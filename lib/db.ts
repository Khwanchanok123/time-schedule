import { neon } from "@neondatabase/serverless";
import type { PGlite } from "@electric-sql/pglite";

/**
 * การเชื่อมต่อฐานข้อมูล (แนวทางเดียวกับโปรเจกต์ warlock)
 * - มี DATABASE_URL (เช่น Neon บน Vercel) → ใช้ Neon serverless driver
 * - รันบนเครื่องโดยไม่มี DATABASE_URL → ใช้ PGlite (Postgres ในตัว) เก็บข้อมูลไว้ที่โฟลเดอร์ .data
 * ตารางและ constraint ถูกสร้างอัตโนมัติในครั้งแรกที่ใช้งาน (ensureSchema)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface Sql {
  <T = Row>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

// เก็บการเชื่อมต่อไว้ที่ globalThis เพื่อให้ทุก route ใช้ตัวเดียวกัน
// (ตอน dev แต่ละ route ถูก bundle แยกกัน ถ้าเปิด PGlite ซ้ำบนโฟลเดอร์เดียวกันจะพัง)
type Shared = { sql: Promise<Sql> | null; schemaReady: Promise<void> | null; schemaVersion?: number };
const g = globalThis as unknown as { __teachingDb?: Shared };
const shared: Shared = (g.__teachingDb ??= { sql: null, schemaReady: null });

/** แปลง PGlite instance เป็นฟังก์ชัน sql แบบเดียวกับ Neon (ใช้ทั้งตอน dev และในชุดทดสอบ) */
export function pgliteSql(pg: PGlite): Sql {
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => `${acc}$${i}${s}`);
    return (await pg.query(text, values)).rows;
  }) as Sql;
  sql.query = async (text: string, params: unknown[] = []) =>
    (await pg.query(text, params)).rows as never;
  return sql;
}

async function localSql(): Promise<Sql> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { mkdir } = await import("node:fs/promises");
  await mkdir("./.data", { recursive: true });
  const pg = new PGlite("./.data/pglite", { extensions: { btree_gist } });
  try {
    await pg.query("SELECT 1");
  } catch {
    throw new Error("ฐานข้อมูลบนเครื่อง (.data) เสียหาย — หยุดเซิร์ฟเวอร์ ลบโฟลเดอร์ .data แล้วรันใหม่");
  }
  // ปิดฐานข้อมูลให้เรียบร้อยเมื่อหยุดเซิร์ฟเวอร์ (Ctrl+C) เพื่อไม่ให้ไฟล์เสีย
  const close = () =>
    pg
      .close()
      .catch(() => {})
      .finally(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  return pgliteSql(pg);
}

function neonSql(url: string): Sql {
  const n = neon(url);
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    n(strings, ...values)) as unknown as Sql;
  sql.query = (text: string, params: unknown[] = []) => n.query(text, params) as never;
  return sql;
}

// เก็บเป็น Promise เพื่อให้คำขอที่มาพร้อมกันรอการเชื่อมต่อเดียวกัน ไม่เปิดซ้ำ
function getSql(): Promise<Sql> {
  if (!shared.sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (url) {
      shared.sql = Promise.resolve(neonSql(url));
    } else if (process.env.NODE_ENV !== "production") {
      shared.sql = localSql().catch((e) => {
        shared.sql = null;
        throw e;
      });
    } else {
      throw new Error("ยังไม่ได้ตั้งค่า DATABASE_URL (เชื่อมต่อฐานข้อมูล Neon ใน Vercel ก่อน)");
    }
  }
  return shared.sql;
}

/**
 * โครงสร้างฐานข้อมูล — รันทีละคำสั่ง (Neon HTTP รับครั้งละ 1 คำสั่ง)
 * ทุกคำสั่งรันซ้ำได้ปลอดภัย
 */
export const SCHEMA: string[] = [
  `CREATE EXTENSION IF NOT EXISTS btree_gist`,

  `CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    full_name     TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS rooms (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    building   TEXT,
    capacity   INTEGER CHECK (capacity IS NULL OR capacity >= 0),
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // room_id ON DELETE SET NULL: ลบห้องที่มีแต่ประวัติในอดีตได้ โดยประวัติการสอนยังอยู่
  `CREATE TABLE IF NOT EXISTS schedules (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    room_id    UUID REFERENCES rooms (id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time   TIMESTAMPTZ NOT NULL,
    subject    TEXT,
    note       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schedules_end_after_start CHECK (end_time > start_time),
    -- ห้องเดียวกันห้ามเวลาทับซ้อน: '[)' = start ใหม่ < end เดิม AND end ใหม่ > start เดิม
    CONSTRAINT schedules_no_room_overlap
      EXCLUDE USING gist (room_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&),
    -- อาจารย์คนเดียวกันห้ามสอนเวลาทับซ้อน แม้ต่างห้อง
    CONSTRAINT schedules_no_teacher_overlap
      EXCLUDE USING gist (teacher_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
  )`,

  // หัวข้อที่จะเรียนในคาบนั้น (เพิ่มภายหลัง — แถวเก่าเป็น NULL ได้ แอปบังคับกรอกสำหรับรายการใหม่)
  `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS topic TEXT`,
  // สถานะเปิดให้ลงทะเบียน (อาจารย์ติ๊กเอง) + รายละเอียดการลงทะเบียน
  `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS registration_open BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS registration_note TEXT`, // เลิกใช้แล้ว (เก็บไว้ไม่ให้ข้อมูลเก่าหาย)
  // จำนวนที่นั่ง = จำกัดจำนวนคนลงทะเบียนของคาบนั้น
  `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS seats INTEGER CHECK (seats IS NULL OR seats > 0)`,
  // ห้องนอกระบบ (พิมพ์ชื่อเอง) → room_id = NULL, room_text = ชื่อห้อง
  `ALTER TABLE schedules ADD COLUMN IF NOT EXISTS room_text TEXT`,
  // ห้องนอกระบบชื่อเดียวกัน (ไม่สนตัวพิมพ์เล็ก/ใหญ่) ห้ามเวลาทับซ้อน
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedules_no_custom_room_overlap') THEN
       ALTER TABLE schedules ADD CONSTRAINT schedules_no_custom_room_overlap
         EXCLUDE USING gist (lower(room_text) WITH =, tstzrange(start_time, end_time, '[)') WITH &&);
     END IF;
   END $$`,

  `CREATE INDEX IF NOT EXISTS schedules_start_idx ON schedules (start_time)`,
  `CREATE INDEX IF NOT EXISTS schedules_teacher_idx ON schedules (teacher_id)`,
  `CREATE INDEX IF NOT EXISTS schedules_room_idx ON schedules (room_id)`,

  // ห้ามลบห้องที่ยังมีตารางสอนในอนาคต (กันอีกชั้นที่ระดับฐานข้อมูล)
  `CREATE OR REPLACE FUNCTION prevent_room_delete_with_future() RETURNS trigger
   LANGUAGE plpgsql AS $$
   BEGIN
     IF EXISTS (SELECT 1 FROM schedules WHERE room_id = OLD.id AND end_time > now()) THEN
       RAISE EXCEPTION 'ROOM_HAS_FUTURE_SCHEDULES';
     END IF;
     RETURN OLD;
   END;
   $$`,
  `DROP TRIGGER IF EXISTS rooms_prevent_delete ON rooms`,
  `CREATE TRIGGER rooms_prevent_delete BEFORE DELETE ON rooms
   FOR EACH ROW EXECUTE FUNCTION prevent_room_delete_with_future()`,
];

export async function ensureSchema(sql: Sql): Promise<void> {
  for (const stmt of SCHEMA) await sql.query(stmt);
}

// เพิ่มเลขนี้เมื่อแก้โครงสร้างฐานข้อมูล เพื่อให้ ensureSchema รันใหม่โดยไม่ต้องรีสตาร์ทเซิร์ฟเวอร์ตอน dev
const SCHEMA_VERSION = 5;

/**
 * เช็กเลขเวอร์ชันโครงสร้างที่เก็บไว้ในฐานข้อมูลก่อน (1 query) — ตรงแล้วไม่ต้องรัน SCHEMA ทั้ง 18 คำสั่ง
 * (บน Vercel ทุกครั้งที่ฟังก์ชันเริ่มใหม่ ถ้ารันครบทุกคำสั่งทีละรอบไป Neon จะช้าหลายวินาที)
 */
async function ensureSchemaOnce(sql: Sql): Promise<void> {
  try {
    const rows = await sql.query(`SELECT value FROM app_meta WHERE key = 'schema_version'`);
    if (Number(rows[0]?.value) === SCHEMA_VERSION) return;
  } catch {
    // ยังไม่มีตาราง app_meta (ฐานข้อมูลใหม่) → สร้างด้านล่าง
  }
  await ensureSchema(sql);
  await sql.query(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await sql.query(
    `INSERT INTO app_meta (key, value) VALUES ('schema_version', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(SCHEMA_VERSION)]
  );
}

export async function db(): Promise<Sql> {
  const sql = await getSql();
  if (!shared.schemaReady || shared.schemaVersion !== SCHEMA_VERSION) {
    shared.schemaVersion = SCHEMA_VERSION;
    shared.schemaReady = ensureSchemaOnce(sql).catch((e) => {
      shared.schemaReady = null;
      throw e;
    });
  }
  await shared.schemaReady;
  return sql;
}

/** timestamptz จาก driver อาจเป็น Date หรือ string → ISO string เสมอ */
export function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}

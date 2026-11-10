/**
 * ใส่ข้อมูลทดสอบลงฐานข้อมูลบนเครื่อง (.data) — คาบที่ผ่านไปแล้ว / กำลังสอน / กำลังจะถึง
 * เวลาคำนวณจาก "ตอนนี้" ทุกครั้งที่รัน จึงรันซ้ำเพื่อรีเซ็ตข้อมูลทดสอบได้เสมอ
 *
 *   npm run seed          ลบข้อมูลทดสอบเดิม แล้วใส่ชุดใหม่
 *   npm run seed:clear    ลบข้อมูลทดสอบอย่างเดียว
 *
 * ⚠️ ต้องหยุด dev server ก่อน (PGlite เปิดไฟล์ฐานข้อมูลได้ทีละโปรเซส)
 * แตะเฉพาะคาบที่หมายเหตุขึ้นต้นด้วย [ข้อมูลทดสอบ] — ข้อมูลจริงไม่ถูกลบ
 */
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { ensureSchema, pgliteSql } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { bangkokToISO, formatTime, isoToBangkokDate } from "@/lib/time";

const TAG = "[ข้อมูลทดสอบ]";
const PASSWORD = "123456";

async function main() {
  const clearOnly = process.argv.includes("--clear");
  const pg = new PGlite("./.data/pglite", { extensions: { btree_gist } });
  const sql = pgliteSql(pg);
  await ensureSchema(sql);

  const removed = await sql`DELETE FROM schedules WHERE note LIKE ${TAG + "%"} RETURNING id`;
  console.log(`ลบข้อมูลทดสอบเดิม ${removed.length} คาบ`);
  if (clearOnly) return pg.close();

  // ---------- ผู้ใช้ ----------
  const [me] = await sql`SELECT id, full_name FROM users ORDER BY (role = 'admin') DESC, created_at LIMIT 1`;
  if (!me) throw new Error("ยังไม่มีผู้ใช้ในระบบ — เปิดเว็บแล้วสร้างแอดมินคนแรกก่อน");

  const teacher = async (username: string, fullName: string) => {
    const [u] = await sql`
      INSERT INTO users (username, full_name, password_hash, role)
      VALUES (${username}, ${fullName}, ${hashPassword(PASSWORD)}, 'teacher')
      ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id`;
    return u.id as string;
  };
  const T1 = await teacher("artemis", "อาร์เทมิส ไนท์เชด");
  const T2 = await teacher("orion", "ออริออน เกรย์วูด");

  // ---------- ห้อง (ใช้ห้องที่มีอยู่ ถ้าไม่พอสร้างเพิ่ม) ----------
  const rooms = (await sql`SELECT id, name FROM rooms WHERE is_active ORDER BY created_at`) as { id: string; name: string }[];
  for (let i = rooms.length; i < 3; i++) {
    const [r] = await sql`INSERT INTO rooms (name) VALUES (${`ห้องทดสอบ ${i + 1}`}) RETURNING id, name`;
    rooms.push(r as { id: string; name: string });
  }
  const [R1, R2, R3] = rooms;
  const CUSTOM = "สนามฝึกบิน (นอกระบบ)";

  // ---------- เวลา (อ้างอิงตอนนี้ ปัดลงทีละ 5 นาที) ----------
  const today = isoToBangkokDate(new Date());
  const [h, m] = formatTime(new Date()).split(":").map(Number);
  const nowMin = Math.floor((h * 60 + m) / 5) * 5;
  const dayOffset = (n: number) => isoToBangkokDate(new Date(new Date(`${today}T12:00:00+07:00`).getTime() + n * 86400000));
  const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  type Row = {
    label: string;
    teacher: string;
    room?: { id: string } | null;
    roomText?: string;
    date: string;
    start: number; // นาทีนับจากเที่ยงคืน
    end: number;
    subject: string;
    topic: string;
    seats: number;
    open?: boolean;
    hint: string;
  };
  const H = (hh: number, mm = 0) => hh * 60 + mm;

  const rows: Row[] = [
    // ===== ผ่านไปแล้ว =====
    { label: "ผ่านแล้ว", teacher: me.id, room: R1, date: dayOffset(-3), start: H(9), end: H(11),
      subject: "วิชาพยากรณ์ศาสตร์", topic: "บทที่ 1 การอ่านใบชา", seats: 20,
      hint: "คาบจบแล้ว — ลองแก้หัวข้อ/ที่นั่ง (ได้) และลองเปลี่ยนวันเวลา (ต้องถูกล็อก)" },
    { label: "ผ่านแล้ว", teacher: T1, room: R2, date: dayOffset(-1), start: H(13), end: H(15),
      subject: "วิชาสมุนไพรและการปรุงยา", topic: "ยาแก้หวัดขั้นพื้นฐาน", seats: 15,
      hint: "คาบของอาจารย์คนอื่น — อาจารย์ทั่วไปต้องแก้/ลบไม่ได้" },
    { label: "ผ่านแล้ว", teacher: me.id, roomText: CUSTOM, date: dayOffset(-1), start: H(15), end: H(16, 30),
      subject: "วิชาการบินไม้กวาดและม้า", topic: "การทรงตัวบนไม้กวาด", seats: 12,
      hint: "คาบห้องนอกระบบที่จบแล้ว" },
    { label: "ผ่านแล้ว (วันนี้)", teacher: T2, room: R3, date: today, start: nowMin - 180, end: nowMin - 120,
      subject: "วิชาประวัติศาสตร์", topic: "สงครามก็อบลินครั้งที่ 1", seats: 30,
      hint: "คาบวันนี้ที่จบไปแล้ว" },

    // ===== กำลังสอน =====
    { label: "กำลังสอน", teacher: me.id, room: R1, date: today, start: nowMin - 60, end: nowMin + 90,
      subject: "วิชาเวทมนต์คาถา", topic: "คาถาลอยตัว", seats: 25,
      hint: "คาบกำลังสอน — ลองขยายเวลาสิ้นสุดเกินเวลาเริ่มของคาบถัดไปในห้องนี้ (ต้องชน), ลองแก้เวลาเริ่ม (ต้องถูกล็อก)" },
    { label: "กำลังสอน", teacher: T1, room: R2, date: today, start: nowMin - 30, end: nowMin + 60,
      subject: "วิชาสัตว์วิทยา", topic: "การดูแลฮิปโปกริฟฟ์", seats: 18,
      hint: "คาบกำลังสอนของอาจารย์คนอื่น" },

    // ===== กำลังจะถึง =====
    { label: "กำลังจะถึง (ต่อจากคาบที่กำลังสอน)", teacher: T2, room: R1, date: today, start: nowMin + 90, end: nowMin + 150,
      subject: "วิชาอักษรรูน", topic: "รูนพื้นฐาน 24 ตัว", seats: 20,
      hint: "เริ่มพอดีตอนที่คาบกำลังสอนในห้องนี้จบ — ใช้ทดสอบการทับซ้อนตอนขยายเวลา" },
    { label: "กำลังจะถึง", teacher: me.id, room: R2, date: dayOffset(1), start: H(9), end: H(11),
      subject: "วิชาแปลงกาย", topic: "แปลงไม้ขีดเป็นเข็ม", seats: 20,
      hint: "ลองเลื่อนเวลาสิ้นสุดเป็น 11:30 (ต้องชนคาบ 11:00 ของ อ.อาร์เทมิส) หรือเลื่อนไปเมื่อวาน (ต้องไม่ได้)" },
    { label: "กำลังจะถึง (ต่อกันพอดี)", teacher: T1, room: R2, date: dayOffset(1), start: H(11), end: H(12),
      subject: "วิชาสมุนไพรและการปรุงยา", topic: "สมุนไพรเรืองแสง", seats: 15, open: false,
      hint: "ต่อจากคาบ 09:00–11:00 ห้องเดียวกันพอดี (ไม่ถือว่าซ้อน) / ยังไม่เปิดลงทะเบียน" },
    { label: "กำลังจะถึง", teacher: T1, room: R3, date: dayOffset(1), start: H(9), end: H(10),
      subject: "วิชาป้องกันตัวจากศาสตร์มืด", topic: "คาถาปลดอาวุธ", seats: 25,
      hint: "ลองย้ายคาบ 09:00 ของคุณมาห้องนี้ (ต้องชนห้อง)" },
    { label: "กำลังจะถึง", teacher: me.id, room: R3, date: dayOffset(2), start: H(10), end: H(12),
      subject: "วิชาพยากรณ์ศาสตร์", topic: "บทที่ 2 ลูกแก้วพยากรณ์", seats: 20,
      hint: "ลองย้ายคาบอื่นของคุณมาวันนี้ 10:30 ห้องอื่น (ต้องชนแบบอาจารย์)" },
    { label: "กำลังจะถึง (นอกระบบ)", teacher: me.id, roomText: CUSTOM, date: dayOffset(2), start: H(14), end: H(16),
      subject: "วิชาการบินไม้กวาดและม้า", topic: "บินผ่านห่วง", seats: 10,
      hint: "ลองให้อาจารย์คนอื่นจองห้องนอกระบบชื่อเดียวกันเวลาซ้อน (ต้องชน)" },
    { label: "กำลังจะถึง", teacher: T2, room: R2, date: dayOffset(7), start: H(13), end: H(15),
      subject: "วิชาประวัติศาสตร์", topic: "ประวัติโรงเรียนเวทมนตร์", seats: 40, open: false,
      hint: "สัปดาห์หน้า / ยังไม่เปิดลงทะเบียน" },
  ];

  let added = 0;
  for (const r of rows) {
    if (r.start < 0 || r.end > 24 * 60 || r.end <= r.start) {
      console.log(`  ข้าม "${r.label}" (เวลาเลยข้ามวัน — ลองรันใหม่ช่วงกลางวัน)`);
      continue;
    }
    try {
      await sql`
        INSERT INTO schedules (teacher_id, room_id, room_text, start_time, end_time, subject, topic, note,
                               registration_open, seats)
        VALUES (${r.teacher}, ${r.room?.id ?? null}, ${r.roomText ?? null},
                ${bangkokToISO(r.date, hhmm(r.start))}, ${bangkokToISO(r.date, hhmm(r.end))},
                ${r.subject}, ${r.topic}, ${`${TAG} ${r.hint}`}, ${r.open ?? true}, ${r.seats})`;
      added++;
      console.log(`  ✓ ${r.label.padEnd(10)} ${r.date} ${hhmm(r.start)}–${hhmm(r.end)}  ${r.subject}`);
    } catch (e) {
      console.log(`  ✗ ${r.label} ${r.date} ${hhmm(r.start)}: ${(e as Error).message}`);
    }
  }

  console.log(`\nเพิ่มข้อมูลทดสอบ ${added} คาบ`);
  console.log(`ห้องที่ใช้: ${R1.name}, ${R2.name}, ${R3.name}, ${CUSTOM}`);
  console.log(`บัญชีอาจารย์ทดสอบ: artemis / ${PASSWORD} , orion / ${PASSWORD}`);
  await pg.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * ทดสอบฐานข้อมูล: schema, constraint กันจองซ้ำ, trigger ห้องเรียน และฟังก์ชันหาเวลาทับซ้อน
 * ใช้ PGlite แบบในหน่วยความจำ (ไม่ต้องใช้ Docker / Neon) กับ ensureSchema ตัวเดียวกับที่แอปใช้
 *
 * รัน: npm run test:db
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { ensureSchema, pgliteSql, type Sql } from "@/lib/db";
import { dbErrorToThai, findConflicts } from "@/lib/conflicts";
import { listSchedules } from "@/lib/queries";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { signSession, verifySession } from "@/lib/session";
import { bangkokToISO } from "@/lib/time";

const A = "11111111-1111-1111-1111-111111111111"; // อาจารย์ A
const B = "22222222-2222-2222-2222-222222222222"; // อาจารย์ B
const R1 = "aaaaaaaa-0000-0000-0000-000000000001"; // ห้อง 301
const R2 = "aaaaaaaa-0000-0000-0000-000000000002"; // ห้อง 302

let sql: Sql;

/** เวลาไทย "2030-01-15 09:00" → ISO */
const bkk = (s: string) => bangkokToISO(s.slice(0, 10), s.slice(11));

async function add(teacher: string, room: string | null, start: string, end: string): Promise<string> {
  const [row] = await sql`
    INSERT INTO schedules (teacher_id, room_id, start_time, end_time)
    VALUES (${teacher}, ${room}, ${bkk(start)}, ${bkk(end)}) RETURNING id`;
  return row.id;
}

/** ตรวจว่าคำสั่งล้มเหลว และ error ตรงกับที่คาด */
async function rejects(p: Promise<unknown>, match: RegExp) {
  await assert.rejects(p, (e: Error & { code?: string; constraint?: string }) => {
    assert.match(`${e.code ?? ""} ${e.message} ${e.constraint ?? ""}`, match);
    return true;
  });
}

before(async () => {
  sql = pgliteSql(new PGlite({ extensions: { btree_gist } }));
  await ensureSchema(sql);
  await ensureSchema(sql); // รันซ้ำต้องไม่พัง (ตอนเซิร์ฟเวอร์เริ่มใหม่)

  await sql`INSERT INTO users (id, username, full_name, password_hash, role) VALUES
    (${A}, 'somchai', 'สมชาย ใจดี', 'x', 'teacher'),
    (${B}, 'somsri', 'สมศรี รักสอน', 'x', 'teacher')`;
  await sql`INSERT INTO rooms (id, name, building) VALUES (${R1}, '301', 'อาคาร 3'), (${R2}, '302', 'อาคาร 3')`;
});

describe("กฎการจองซ้ำ (EXCLUDE constraint ในฐานข้อมูล)", () => {
  test("อาจารย์ A จองห้อง 301 เวลา 09:00–12:00 ได้", async () => {
    await add(A, R1, "2030-01-15 09:00", "2030-01-15 12:00");
  });

  test("ห้องเดียวกัน เวลาทับซ้อน → ถูกปฏิเสธ (แม้เป็นอาจารย์คนอื่น)", async () => {
    await rejects(add(B, R1, "2030-01-15 11:00", "2030-01-15 13:00"), /schedules_no_room_overlap/);
  });

  test("ช่วงเวลาที่อยู่ข้างในทั้งหมด → ถูกปฏิเสธ", async () => {
    await rejects(add(B, R1, "2030-01-15 10:00", "2030-01-15 10:30"), /schedules_no_room_overlap/);
  });

  test("อาจารย์คนเดียวกัน ต่างห้องแต่เวลาทับซ้อน → ถูกปฏิเสธ", async () => {
    await rejects(add(A, R2, "2030-01-15 11:00", "2030-01-15 13:00"), /schedules_no_teacher_overlap/);
  });

  test("สอนต่อกันพอดี (12:00 ต่อจาก 09:00–12:00) → ได้", async () => {
    await add(B, R1, "2030-01-15 12:00", "2030-01-15 15:00");
    await add(A, R2, "2030-01-15 12:00", "2030-01-15 13:00");
  });

  test("ห้องอื่น อาจารย์อื่น เวลาเดียวกัน → ได้", async () => {
    await add(B, R2, "2030-01-15 09:00", "2030-01-15 11:00");
  });

  test("end_time ต้องมากกว่า start_time", async () => {
    await rejects(add(A, R1, "2030-01-20 12:00", "2030-01-20 12:00"), /schedules_end_after_start/);
    await rejects(add(A, R1, "2030-01-20 12:00", "2030-01-20 10:00"), /schedules_end_after_start/);
  });

  test("แก้ไขรายการเดิม (เลื่อนเวลาซ้อนกับช่วงเดิมของตัวเอง) → ได้", async () => {
    const id = await add(A, R1, "2030-02-01 09:00", "2030-02-01 12:00");
    await sql`UPDATE schedules SET start_time = ${bkk("2030-02-01 10:00")}, end_time = ${bkk("2030-02-01 12:30")}
              WHERE id = ${id}`;
  });

  test("แก้ไขจนไปชนรายการอื่น → ถูกปฏิเสธ", async () => {
    const id = await add(B, R1, "2030-02-01 13:00", "2030-02-01 14:00");
    await rejects(
      sql`UPDATE schedules SET start_time = ${bkk("2030-02-01 12:00")} WHERE id = ${id}`,
      /schedules_no_room_overlap/
    );
  });

  test("แปลง error เป็นข้อความภาษาไทยได้", async () => {
    const err = await add(B, R1, "2030-01-15 11:00", "2030-01-15 13:00").catch((e) => e);
    assert.equal(dbErrorToThai(err), "ห้องนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว (มีผู้บันทึกก่อนหน้าคุณ)");
  });
});

describe("findConflicts (เช็กก่อนบันทึก ชั้นที่ 1 และ 2)", () => {
  test("ห้องถูกใช้ → ข้อความ 'ห้อง X ถูกใช้แล้วโดย อ.Y เวลา HH:MM–HH:MM'", async () => {
    const c = await findConflicts(sql, {
      teacherId: B,
      roomId: R1,
      startISO: bkk("2030-01-15 10:00"),
      endISO: bkk("2030-01-15 11:00"),
    });
    // B ติดทั้งห้อง 301 (A ใช้อยู่) และติดสอนตัวเองที่ห้อง 302 เวลา 09:00–11:00 → 2 รายการ
    assert.deepEqual(c.map((x) => x.kind).sort(), ["room", "teacher"]);
    const room = c.find((x) => x.kind === "room")!;
    assert.match(room.message, /^ห้อง 301 ถูกใช้แล้วโดย อ\.สมชาย ใจดี เวลา 09:00–12:00/);
  });

  test("อาจารย์ติดสอนห้องอื่น → แจ้งเตือนแบบ teacher", async () => {
    const c = await findConflicts(sql, {
      teacherId: A,
      roomId: R2,
      startISO: bkk("2030-01-15 10:00"),
      endISO: bkk("2030-01-15 11:00"),
    });
    assert.ok(c.some((x) => x.kind === "teacher" && x.message.startsWith("อ.สมชาย ใจดี มีสอนอยู่แล้วที่ห้อง 301")));
  });

  test("สอนต่อกันพอดี → ไม่ถือว่าซ้อน", async () => {
    const c = await findConflicts(sql, {
      teacherId: B,
      roomId: R1,
      startISO: bkk("2030-01-15 15:00"),
      endISO: bkk("2030-01-15 16:00"),
    });
    assert.equal(c.length, 0);
  });

  test("ตอนแก้ไข ไม่นับรายการตัวเองว่าซ้ำ", async () => {
    const id = await add(A, R1, "2030-03-01 09:00", "2030-03-01 10:00");
    const input = { teacherId: A, roomId: R1, startISO: bkk("2030-03-01 09:30"), endISO: bkk("2030-03-01 10:30") };
    assert.equal((await findConflicts(sql, input)).length, 1);
    assert.equal((await findConflicts(sql, { ...input, excludeId: id })).length, 0);
  });
});

describe("ห้องนอกระบบ (พิมพ์ชื่อเอง)", () => {
  const addCustom = async (teacher: string, text: string, start: string, end: string) => {
    const [row] = await sql`
      INSERT INTO schedules (teacher_id, room_id, room_text, start_time, end_time)
      VALUES (${teacher}, NULL, ${text}, ${bkk(start)}, ${bkk(end)}) RETURNING id`;
    return row.id as string;
  };

  test("จองห้องนอกระบบได้", async () => {
    await addCustom(A, "สนามควิดดิช", "2030-08-01 09:00", "2030-08-01 11:00");
  });

  test("ห้องนอกระบบชื่อเดียวกัน (ไม่สนตัวพิมพ์) เวลาทับซ้อน → DB ปฏิเสธ", async () => {
    await addCustom(A, "Great Hall", "2030-08-02 09:00", "2030-08-02 11:00");
    await rejects(
      addCustom(B, "great hall", "2030-08-02 10:00", "2030-08-02 12:00"),
      /schedules_no_custom_room_overlap/
    );
  });

  test("ห้องนอกระบบต่างชื่อ เวลาเดียวกัน → ได้", async () => {
    await addCustom(B, "หอดูดาว", "2030-08-01 09:00", "2030-08-01 11:00");
  });

  test("findConflicts แจ้ง 'ห้อง X ถูกใช้แล้วโดย ...' สำหรับห้องนอกระบบ", async () => {
    const c = await findConflicts(sql, {
      teacherId: B,
      roomId: null,
      roomText: "สนามควิดดิช",
      startISO: bkk("2030-08-01 10:00"),
      endISO: bkk("2030-08-01 12:00"),
    });
    const room = c.find((x) => x.kind === "room");
    assert.ok(room);
    assert.match(room.message, /^ห้อง สนามควิดดิช ถูกใช้แล้วโดย อ\.สมชาย ใจดี เวลา 09:00–11:00/);
  });

  test("listSchedules แสดงชื่อห้องนอกระบบ (custom = true)", async () => {
    const rows = await listSchedules(sql, { from: bkk("2030-08-01 00:00"), to: bkk("2030-08-02 00:00") });
    const s = rows.find((r) => r.room_text === "สนามควิดดิช");
    assert.deepEqual(s?.room, { id: null, name: "สนามควิดดิช", building: null, custom: true });
  });
});

describe("แก้ไข + การทับซ้อน", () => {
  // ห้อง 302 วันที่ 2030-10-01: X 09:00–11:00 (A), Y 11:00–12:00 (B)
  let X: string;
  before(async () => {
    X = await add(A, R2, "2030-10-01 09:00", "2030-10-01 11:00");
    await add(B, R2, "2030-10-01 11:00", "2030-10-01 12:00");
  });
  const check = (o: Partial<Parameters<typeof findConflicts>[1]> & { start: string; end: string }) =>
    findConflicts(sql, {
      teacherId: A,
      roomId: R2,
      excludeId: X,
      ...o,
      startISO: bkk(o.start),
      endISO: bkk(o.end),
    });

  test("ขยายเวลาสิ้นสุดจนชนคาบถัดไปในห้องเดียวกัน → ทับซ้อน", async () => {
    const c = await check({ start: "2030-10-01 09:00", end: "2030-10-01 11:30" });
    assert.ok(c.some((x) => x.kind === "room" && x.message.includes("11:00–12:00")));
  });

  test("ขยายเวลาสิ้นสุดชนพอดี (ถึง 11:00) → ไม่ทับซ้อน", async () => {
    assert.equal((await check({ start: "2030-10-01 09:00", end: "2030-10-01 11:00" })).length, 0);
  });

  test("ย่นเวลา (ซ้อนกับช่วงเดิมของตัวเอง) → ไม่นับตัวเองว่าซ้ำ", async () => {
    assert.equal((await check({ start: "2030-10-01 09:00", end: "2030-10-01 10:00" })).length, 0);
  });

  test("ย้ายห้องไปห้องที่ว่าง → ได้", async () => {
    assert.equal((await check({ roomId: R1, start: "2030-10-01 09:00", end: "2030-10-01 11:00" })).length, 0);
  });

  test("ย้ายห้อง แต่อาจารย์มีคาบอื่นชนเวลาเดียวกัน → ทับซ้อนแบบ teacher", async () => {
    await add(A, R1, "2030-10-01 13:00", "2030-10-01 14:00");
    const c = await check({ roomId: R2, start: "2030-10-01 13:30", end: "2030-10-01 14:30" });
    assert.ok(c.some((x) => x.kind === "teacher"));
  });

  test("แอดมินเปลี่ยนอาจารย์เป็นคนที่ติดสอนเวลานั้น → ทับซ้อนแบบ teacher", async () => {
    // B สอนห้อง 302 เวลา 11:00–12:00 → ย้าย X (ห้อง 301) มาเป็นของ B เวลา 11:30 ต้องชน
    const c = await check({ teacherId: B, roomId: R1, start: "2030-10-01 11:30", end: "2030-10-01 12:30" });
    assert.ok(c.some((x) => x.kind === "teacher"));
  });

  test("DB ชั้นสุดท้าย: UPDATE ให้ชนคาบถัดไปตรง ๆ → ถูกปฏิเสธ", async () => {
    await rejects(
      sql`UPDATE schedules SET end_time = ${bkk("2030-10-01 11:30")} WHERE id = ${X}`,
      /schedules_no_room_overlap/
    );
  });
});

describe("listSchedules (ปฏิทิน)", () => {
  test("ดึงเฉพาะรายการที่ทับช่วงวัน พร้อมชื่ออาจารย์และห้อง เวลาเป็น ISO", async () => {
    const rows = await listSchedules(sql, { from: bkk("2030-01-15 00:00"), to: bkk("2030-01-16 00:00") });
    assert.equal(rows.length, 4);
    assert.equal(rows[0].teacher?.full_name, "สมชาย ใจดี");
    assert.equal(rows[0].room?.name, "301");
    assert.equal(rows[0].start_time, "2030-01-15T02:00:00.000Z"); // 09:00 น. เวลาไทย
  });

  test("บันทึกและอ่านวิชา + หัวข้อที่จะเรียนได้", async () => {
    const [row] = await sql`
      INSERT INTO schedules (teacher_id, room_id, start_time, end_time, subject, topic)
      VALUES (${B}, ${R2}, ${bkk("2030-07-01 09:00")}, ${bkk("2030-07-01 10:00")},
              'วิชาแปลงกาย', 'บทที่ 1 แปลงร่างเป็นแมว') RETURNING id`;
    const [s] = await listSchedules(sql, { from: bkk("2030-07-01 00:00"), to: bkk("2030-07-02 00:00") });
    assert.equal(s.id, row.id);
    assert.equal(s.subject, "วิชาแปลงกาย");
    assert.equal(s.topic, "บทที่ 1 แปลงร่างเป็นแมว");
  });

  test("สถานะลงทะเบียน + จำนวนที่นั่ง: ค่าเริ่มต้นยังไม่เปิด, เปิดและกำหนดที่นั่งได้", async () => {
    const range = { from: bkk("2030-07-01 00:00"), to: bkk("2030-07-02 00:00") };
    const [before] = await listSchedules(sql, range);
    assert.equal(before.registration_open, false);
    assert.equal(before.seats, null);

    await sql`UPDATE schedules SET registration_open = true, seats = 25 WHERE id = ${before.id}`;
    const [after] = await listSchedules(sql, range);
    assert.equal(after.registration_open, true);
    assert.equal(after.seats, 25);
  });

  test("จำนวนที่นั่งต้องมากกว่า 0", async () => {
    await rejects(sql`UPDATE schedules SET seats = 0 WHERE subject = 'วิชาแปลงกาย'`, /23514|check/);
  });

  test("กรองตามห้องและอาจารย์ได้", async () => {
    const range = { from: bkk("2030-01-15 00:00"), to: bkk("2030-01-16 00:00") };
    assert.equal((await listSchedules(sql, { ...range, roomId: R2 })).length, 2);
    assert.equal((await listSchedules(sql, { ...range, teacherId: B, roomId: R1 })).length, 1);
  });
});

describe("กฎห้องเรียน", () => {
  test("ห้องที่มีตารางสอนในอนาคต ลบไม่ได้ (trigger)", async () => {
    await rejects(sql`DELETE FROM rooms WHERE id = ${R1}`, /ROOM_HAS_FUTURE_SCHEDULES/);
  });

  test("ห้องที่มีแต่ประวัติในอดีต ลบได้ และประวัติยังอยู่ (room_id = null)", async () => {
    const [room] = await sql`INSERT INTO rooms (name) VALUES ('ห้องเก่า') RETURNING id`;
    const sid = await add(A, room.id, "2020-01-01 09:00", "2020-01-01 10:00");
    await sql`DELETE FROM rooms WHERE id = ${room.id}`;
    const [s] = await sql`SELECT room_id FROM schedules WHERE id = ${sid}`;
    assert.equal(s.room_id, null);
  });

  test("ชื่อห้องซ้ำไม่ได้", async () => {
    await rejects(sql`INSERT INTO rooms (name) VALUES ('301')`, /23505|duplicate/);
  });
});

describe("ผู้ใช้และการล็อกอิน", () => {
  test("ลบอาจารย์ → ตารางสอนของอาจารย์คนนั้นถูกลบด้วย", async () => {
    const [u] = await sql`INSERT INTO users (username, full_name, password_hash) VALUES ('temp', 'ชั่วคราว', 'x') RETURNING id`;
    await add(u.id, R2, "2030-09-01 09:00", "2030-09-01 10:00");
    await sql`DELETE FROM users WHERE id = ${u.id}`;
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM schedules WHERE teacher_id = ${u.id}`;
    assert.equal(n, 0);
  });

  test("role ต้องเป็น teacher หรือ admin เท่านั้น", async () => {
    await rejects(
      sql`INSERT INTO users (username, full_name, password_hash, role) VALUES ('bad', 'x', 'x', 'root')`,
      /23514|check/
    );
  });

  test("hash / verify รหัสผ่าน", () => {
    const h = hashPassword("secret123");
    assert.ok(verifyPassword("secret123", h));
    assert.ok(!verifyPassword("wrong", h));
  });

  test("session token: ถูกต้องผ่าน, ถูกแก้ไขไม่ผ่าน", async () => {
    const token = await signSession(A);
    assert.deepEqual(await verifySession(token), { id: A });
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ id: B, exp: Date.now() + 1e9 })).toString("base64url");
    assert.equal(await verifySession(`${forged}.${sig}`), null);
    assert.equal(await verifySession(`${body}.x${sig}`), null);
  });
});

"use server";

import { revalidatePath } from "next/cache";
import { db, toIso, type Sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { bangkokRangeToISO } from "@/lib/time";
import { dbErrorToThai, findConflicts, type Conflict } from "@/lib/conflicts";
import { isUuid } from "@/lib/queries";
import { isSubject } from "@/lib/subjects";
import { checkTimeEdit } from "@/lib/schedule-rules";
import type { ActionResult } from "@/lib/types";

export interface ScheduleInput {
  id?: string | null;
  teacherId?: string | null; // ใช้ได้เฉพาะแอดมิน
  date: string; // YYYY-MM-DD (เวลาไทย)
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  roomId: string; // uuid ของห้องในระบบ หรือ "__custom__" = ห้องนอกระบบ
  roomText?: string; // ชื่อห้องนอกระบบ (เมื่อ roomId = "__custom__")
  subject?: string;
  topic?: string;
  note?: string;
  registrationOpen?: boolean;
  seats?: string | number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseTimes(
  input: Pick<ScheduleInput, "date" | "startTime" | "endTime">
): { error: string } | { startISO: string; endISO: string } {
  if (!DATE_RE.test(input.date ?? "")) return { error: "กรุณาเลือกวันที่" };
  if (!TIME_RE.test(input.startTime ?? "") || !TIME_RE.test(input.endTime ?? ""))
    return { error: "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด" };
  try {
    const { startISO, endISO } = bangkokRangeToISO(input.date, input.startTime, input.endTime);
    if (new Date(endISO) <= new Date(startISO)) return { error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" };
    return { startISO, endISO };
  } catch {
    return { error: "รูปแบบวันที่/เวลาไม่ถูกต้อง" };
  }
}

/** ค่า roomId พิเศษในฟอร์ม = ห้องนอกระบบ (พิมพ์ชื่อเอง) */
const CUSTOM_ROOM = "__custom__";

type ResolvedRoom =
  | { roomId: string; roomText: null; room: { name: string; is_active: boolean } }
  | { roomId: null; roomText: string; room: null }
  | { error: string };

/**
 * แปลงห้องที่เลือก → ห้องในระบบ หรือห้องนอกระบบ
 * ถ้าพิมพ์ชื่อตรงกับห้องที่มีในระบบ จะใช้ห้องในระบบแทน (กันการจองซ้ำได้ถูกต้อง)
 */
async function resolveRoom(sql: Sql, input: ScheduleInput): Promise<ResolvedRoom> {
  if (input.roomId === CUSTOM_ROOM) {
    const text = (input.roomText ?? "").trim().replace(/\s+/g, " ");
    if (!text) return { error: "กรุณาพิมพ์ชื่อห้อง (นอกระบบ)" };
    if (text.length > 100) return { error: "ชื่อห้องยาวเกินไป" };
    const [match] = await sql`SELECT id, name, is_active FROM rooms WHERE lower(name) = lower(${text})`;
    if (match) return { roomId: match.id, roomText: null, room: match as { name: string; is_active: boolean } };
    return { roomId: null, roomText: text, room: null };
  }
  if (!isUuid(input.roomId)) return { error: "กรุณาเลือกห้องเรียน" };
  const [room] = await sql`SELECT name, is_active FROM rooms WHERE id = ${input.roomId}`;
  if (!room) return { error: "ไม่พบห้องเรียนที่เลือก" };
  return { roomId: input.roomId, roomText: null, room: room as { name: string; is_active: boolean } };
}

/** ชั้นที่ 1 (เรียกจากหน้าเว็บ): เช็กการทับซ้อนทันทีเมื่อเลือกวัน/เวลา/ห้อง */
export async function checkConflictsAction(input: ScheduleInput): Promise<Conflict[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const t = parseTimes(input);
  if ("error" in t) return [];
  const teacherId = user.role === "admin" && isUuid(input.teacherId) ? input.teacherId : user.id;

  try {
    const sql = await db();
    const r = await resolveRoom(sql, input);
    if ("error" in r) return [];
    return await findConflicts(sql, {
      teacherId,
      roomId: r.roomId,
      roomText: r.roomText,
      startISO: t.startISO,
      endISO: t.endISO,
      excludeId: input.id,
    });
  } catch {
    return [];
  }
}

/** ชั้นที่ 2: เช็กซ้ำฝั่ง server ก่อนบันทึก (ชั้นที่ 3 คือ EXCLUDE constraint ใน DB) */
export async function saveScheduleAction(input: ScheduleInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
  const isAdmin = user.role === "admin";

  const t = parseTimes(input);
  if ("error" in t) return { ok: false, error: t.error };
  const subject = input.subject?.trim() ?? "";
  if (!subject) return { ok: false, error: "กรุณาเลือกวิชา" };
  const topic = input.topic?.trim() ?? "";
  if (!topic) return { ok: false, error: "กรุณากรอกหัวข้อที่จะเรียน" };
  const seats = Number(input.seats);
  if (!Number.isInteger(seats) || seats < 1)
    return { ok: false, error: "กรุณาใส่จำนวนที่นั่ง (จำนวนเต็มตั้งแต่ 1 ขึ้นไป)" };

  const sql = await db();
  let teacherId = user.id;
  if (isAdmin && isUuid(input.teacherId)) {
    const [t] = await sql`SELECT id FROM users WHERE id = ${input.teacherId}`;
    if (!t) return { ok: false, error: "ไม่พบศาสตราจารย์ที่เลือก" };
    teacherId = input.teacherId;
  }

  // แก้ไข: ต้องเป็นรายการของตัวเอง (หรือเป็นแอดมิน)
  let existingRoomId: string | null = null;
  let existingSubject: string | null = null;
  let original: { startMs: number; endMs: number } | null = null;
  if (input.id) {
    if (!isUuid(input.id)) return { ok: false, error: "รหัสรายการไม่ถูกต้อง" };
    const [existing] = await sql`
      SELECT teacher_id, room_id, subject, start_time, end_time FROM schedules WHERE id = ${input.id}`;
    if (!existing) return { ok: false, error: "ไม่พบรายการที่ต้องการแก้ไข" };
    if (!isAdmin && existing.teacher_id !== user.id)
      return { ok: false, error: "คุณแก้ไขได้เฉพาะตารางสอนของตัวเอง" };
    existingRoomId = existing.room_id;
    existingSubject = existing.subject;
    original = {
      startMs: new Date(toIso(existing.start_time)).getTime(),
      endMs: new Date(toIso(existing.end_time)).getTime(),
    };
  }

  // กฎเวลา: ห้ามเวลาที่ผ่านมาแล้ว / คาบกำลังสอนล็อกเวลาเริ่ม / คาบจบแล้วล็อกวันเวลา (lib/schedule-rules.ts)
  const timeRule = checkTimeEdit({
    original,
    startMs: new Date(t.startISO).getTime(),
    endMs: new Date(t.endISO).getTime(),
    now: Date.now(),
  });
  if (timeRule) return { ok: false, error: timeRule };

  // วิชาต้องอยู่ในรายการ (ยกเว้นรายการเก่าที่แก้ไขโดยไม่เปลี่ยนวิชา)
  if (!isSubject(subject) && subject !== existingSubject)
    return { ok: false, error: "วิชาที่เลือกไม่อยู่ในรายการ" };

  const r = await resolveRoom(sql, input);
  if ("error" in r) return { ok: false, error: r.error };
  // ห้องในระบบต้องเปิดใช้งาน (ยกเว้นแอดมิน หรือแก้ไขรายการเดิมโดยไม่เปลี่ยนห้อง)
  if (r.room && !r.room.is_active && !isAdmin && existingRoomId !== r.roomId)
    return { ok: false, error: `ห้อง ${r.room.name} ปิดใช้งานอยู่ ไม่สามารถจองได้` };

  try {
    const conflicts = await findConflicts(sql, {
      teacherId,
      roomId: r.roomId,
      roomText: r.roomText,
      startISO: t.startISO,
      endISO: t.endISO,
      excludeId: input.id,
    });
    if (conflicts.length > 0) return { ok: false, error: conflicts.map((c) => c.message).join("\n") };

    const note = input.note?.trim() || null;
    const regOpen = !!input.registrationOpen;

    if (input.id) {
      await sql`
        UPDATE schedules
        SET teacher_id = ${teacherId}, room_id = ${r.roomId}, room_text = ${r.roomText},
            start_time = ${t.startISO}, end_time = ${t.endISO},
            subject = ${subject}, topic = ${topic}, note = ${note},
            registration_open = ${regOpen}, seats = ${seats}
        WHERE id = ${input.id}`;
    } else {
      await sql`
        INSERT INTO schedules (teacher_id, room_id, room_text, start_time, end_time, subject, topic, note,
                               registration_open, seats)
        VALUES (${teacherId}, ${r.roomId}, ${r.roomText}, ${t.startISO}, ${t.endISO}, ${subject}, ${topic},
                ${note}, ${regOpen}, ${seats})`;
    }
  } catch (e) {
    // ชั้นที่ 3: ถ้ามีคนบันทึกพร้อมกัน EXCLUDE constraint จะปฏิเสธ
    return { ok: false, error: dbErrorToThai(e) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/");
  return { ok: true, message: input.id ? "แก้ไขตารางสอนเรียบร้อย" : "เพิ่มตารางสอนเรียบร้อย" };
}

/** ปุ่มลัดในรายการ: เปิด/ปิดการลงทะเบียน โดยไม่ต้องเข้าฟอร์มแก้ไข */
export async function setRegistrationAction(id: string, open: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
  if (!isUuid(id)) return { ok: false, error: "รหัสรายการไม่ถูกต้อง" };

  const sql = await db();
  const isAdmin = user.role === "admin";
  const updated = await sql`
    UPDATE schedules SET registration_open = ${open}
    WHERE id = ${id} AND (${isAdmin} OR teacher_id = ${user.id})
    RETURNING id`;
  if (!updated.length) return { ok: false, error: "ไม่พบรายการ หรือคุณไม่มีสิทธิ์แก้ไข" };

  revalidatePath("/dashboard");
  revalidatePath("/");
  return { ok: true, message: open ? "เปิดให้ลงทะเบียนแล้ว" : "ปิดการลงทะเบียนแล้ว" };
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
  if (!isUuid(id)) return { ok: false, error: "รหัสรายการไม่ถูกต้อง" };

  const sql = await db();
  const isAdmin = user.role === "admin";
  const deleted = await sql`
    DELETE FROM schedules
    WHERE id = ${id} AND (${isAdmin} OR teacher_id = ${user.id})
    RETURNING id`;
  if (!deleted.length) return { ok: false, error: "ไม่พบรายการ หรือคุณไม่มีสิทธิ์ลบ" };

  revalidatePath("/dashboard");
  revalidatePath("/");
  return { ok: true, message: "ลบตารางสอนเรียบร้อย" };
}

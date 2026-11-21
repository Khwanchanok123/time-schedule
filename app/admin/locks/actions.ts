"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dbErrorToThai } from "@/lib/conflicts";
import { isUuid } from "@/lib/queries";
import { bangkokToISO } from "@/lib/time";
import type { ActionResult } from "@/lib/types";

export interface LockInput {
  /** มี id = แก้ไขล็อกเดิม */
  id?: string | null;
  startDate: string; // YYYY-MM-DD (เวลาไทย)
  startTime: string; // HH:MM
  endDate: string;
  endTime: string;
  reason?: string;
  /** วันหยุดทั้งวัน: ไม่ใช้ startTime/endTime ล็อกตั้งแต่ 00:00 ของวันเริ่ม ถึงสิ้นวันของวันสิ้นสุด */
  allDay?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function refresh() {
  revalidatePath("/admin/locks");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

/**
 * เพิ่ม / แก้ไขล็อกช่วงเวลา หรือวันหยุด
 * หลังจากนี้ไม่มีใครเพิ่ม/ย้ายคาบสอนเข้ามาในช่วงนี้ได้ (คาบที่มีอยู่แล้วไม่ถูกลบ)
 */
export async function saveLockAction(input: LockInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };
  if (input.id && !isUuid(input.id)) return { ok: false, error: "รหัสรายการไม่ถูกต้อง" };

  if (!DATE_RE.test(input.startDate ?? "") || !DATE_RE.test(input.endDate ?? ""))
    return { ok: false, error: "กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด" };
  const allDay = !!input.allDay;
  if (allDay && input.endDate < input.startDate) return { ok: false, error: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม" };
  if (!allDay && (!TIME_RE.test(input.startTime ?? "") || !TIME_RE.test(input.endTime ?? "")))
    return { ok: false, error: "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด" };
  let startISO: string, endISO: string;
  try {
    if (allDay) {
      startISO = bangkokToISO(input.startDate, "00:00");
      endISO = new Date(Date.parse(bangkokToISO(input.endDate, "00:00")) + 24 * 3600 * 1000).toISOString();
    } else {
      startISO = bangkokToISO(input.startDate, input.startTime);
      endISO = bangkokToISO(input.endDate, input.endTime);
    }
  } catch {
    return { ok: false, error: "รูปแบบวันที่/เวลาไม่ถูกต้อง" };
  }
  if (new Date(endISO) <= new Date(startISO)) return { ok: false, error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" };
  const reason = input.reason?.trim().slice(0, 200) || null;

  const sql = await db();
  try {
    if (input.id) {
      const updated = await sql`
        UPDATE schedule_locks
        SET start_time = ${startISO}, end_time = ${endISO}, reason = ${reason}, all_day = ${allDay}
        WHERE id = ${input.id}
        RETURNING id`;
      if (!updated.length) return { ok: false, error: "ไม่พบรายการ (อาจถูกปลดล็อกไปแล้ว)" };
    } else {
      await sql`
        INSERT INTO schedule_locks (start_time, end_time, reason, all_day, created_by)
        VALUES (${startISO}, ${endISO}, ${reason}, ${allDay}, ${user.id})`;
    }
  } catch (e) {
    return { ok: false, error: dbErrorToThai(e) };
  }
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM schedules WHERE start_time < ${endISO} AND end_time > ${startISO}`;

  refresh();
  const done = input.id ? "แก้ไขเรียบร้อย" : allDay ? "บันทึกวันหยุดเรียบร้อย" : "ล็อกช่วงเวลาเรียบร้อย";
  return {
    ok: true,
    message:
      count > 0
        ? `${done} — มีคาบสอนเดิมในช่วงนี้ ${count} รายการ (ยังอยู่ ไม่ถูกลบ หากต้องการยกเลิกให้ลบที่หน้าจัดการตารางสอน)`
        : done,
  };
}

export async function deleteLockAction(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };
  if (!isUuid(id)) return { ok: false, error: "รหัสรายการไม่ถูกต้อง" };

  const sql = await db();
  const deleted = await sql`DELETE FROM schedule_locks WHERE id = ${id} RETURNING id`;
  if (!deleted.length) return { ok: false, error: "ไม่พบรายการ" };

  refresh();
  return { ok: true, message: "ปลดล็อกเรียบร้อย" };
}

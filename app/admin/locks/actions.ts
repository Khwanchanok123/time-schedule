"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dbErrorToThai } from "@/lib/conflicts";
import { isUuid } from "@/lib/queries";
import { bangkokToISO } from "@/lib/time";
import type { ActionResult } from "@/lib/types";

export interface LockInput {
  startDate: string; // YYYY-MM-DD (เวลาไทย)
  startTime: string; // HH:MM
  endDate: string;
  endTime: string;
  reason?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function refresh() {
  revalidatePath("/admin/locks");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

/** ล็อกช่วงเวลา: หลังจากนี้ไม่มีใครเพิ่ม/ย้ายคาบสอนเข้ามาในช่วงนี้ได้ (คาบที่มีอยู่แล้วไม่ถูกลบ) */
export async function createLockAction(input: LockInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };

  if (!DATE_RE.test(input.startDate ?? "") || !DATE_RE.test(input.endDate ?? ""))
    return { ok: false, error: "กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด" };
  if (!TIME_RE.test(input.startTime ?? "") || !TIME_RE.test(input.endTime ?? ""))
    return { ok: false, error: "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด" };
  let startISO: string, endISO: string;
  try {
    startISO = bangkokToISO(input.startDate, input.startTime);
    endISO = bangkokToISO(input.endDate, input.endTime);
  } catch {
    return { ok: false, error: "รูปแบบวันที่/เวลาไม่ถูกต้อง" };
  }
  if (new Date(endISO) <= new Date(startISO)) return { ok: false, error: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม" };
  const reason = input.reason?.trim().slice(0, 200) || null;

  const sql = await db();
  try {
    await sql`
      INSERT INTO schedule_locks (start_time, end_time, reason, created_by)
      VALUES (${startISO}, ${endISO}, ${reason}, ${user.id})`;
  } catch (e) {
    return { ok: false, error: dbErrorToThai(e) };
  }
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM schedules WHERE start_time < ${endISO} AND end_time > ${startISO}`;

  refresh();
  return {
    ok: true,
    message:
      count > 0
        ? `ล็อกช่วงเวลาเรียบร้อย — มีคาบสอนเดิมในช่วงนี้ ${count} รายการ (ยังอยู่ ไม่ถูกลบ หากต้องการยกเลิกให้ลบที่หน้าจัดการตารางสอน)`
        : "ล็อกช่วงเวลาเรียบร้อย",
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
  return { ok: true, message: "ปลดล็อกช่วงเวลาเรียบร้อย" };
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dbErrorToThai } from "@/lib/conflicts";
import { isUuid } from "@/lib/queries";
import type { ActionResult } from "@/lib/types";

export interface RoomInput {
  id?: string | null;
  name: string;
  building?: string;
  is_active: boolean;
}

async function isAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

function refresh() {
  revalidatePath("/admin/rooms");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export async function saveRoomAction(input: RoomInput): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };

  const name = input.name?.trim();
  if (!name) return { ok: false, error: "กรุณากรอกชื่อห้อง" };

  const building = input.building?.trim() || null;
  const active = !!input.is_active;

  const sql = await db();
  try {
    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: "รหัสห้องไม่ถูกต้อง" };
      await sql`UPDATE rooms SET name = ${name}, building = ${building}, is_active = ${active}
                WHERE id = ${input.id}`;
    } else {
      await sql`INSERT INTO rooms (name, building, is_active) VALUES (${name}, ${building}, ${active})`;
    }
  } catch (e) {
    return { ok: false, error: dbErrorToThai(e) };
  }

  refresh();
  return { ok: true, message: input.id ? "แก้ไขห้องเรียบร้อย" : "เพิ่มห้องเรียบร้อย" };
}

export async function setRoomActiveAction(id: string, active: boolean): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };
  if (!isUuid(id)) return { ok: false, error: "รหัสห้องไม่ถูกต้อง" };

  const sql = await db();
  await sql`UPDATE rooms SET is_active = ${active} WHERE id = ${id}`;
  refresh();
  return { ok: true, message: active ? "เปิดใช้งานห้องแล้ว" : "ปิดใช้งานห้องแล้ว" };
}

/**
 * ลบห้อง: ถ้ามีตารางสอนในอนาคต → ห้ามลบ และเปลี่ยนเป็น "ปิดใช้งาน" แทน
 * (ฐานข้อมูลมี trigger กันอีกชั้น)
 */
export async function deleteRoomAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };
  if (!isUuid(id)) return { ok: false, error: "รหัสห้องไม่ถูกต้อง" };

  const sql = await db();
  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM schedules WHERE room_id = ${id} AND end_time > now()`;

  const deactivate = async (n?: number) => {
    await sql`UPDATE rooms SET is_active = false WHERE id = ${id}`;
    refresh();
    return {
      ok: true as const,
      message: `ห้องนี้มีตารางสอนในอนาคต${n ? ` ${n} รายการ` : ""} จึงไม่สามารถลบได้ — ระบบเปลี่ยนเป็น "ปิดใช้งาน" แทน`,
    };
  };

  if (count > 0) return deactivate(count);

  try {
    await sql`DELETE FROM rooms WHERE id = ${id}`;
  } catch (e) {
    // มีคนเพิ่มตารางสอนเข้ามาระหว่างนั้น → trigger ใน DB ปฏิเสธ → ปิดใช้งานแทน
    if (String((e as Error).message).includes("ROOM_HAS_FUTURE_SCHEDULES")) return deactivate();
    return { ok: false, error: dbErrorToThai(e) };
  }

  refresh();
  return { ok: true, message: "ลบห้องเรียบร้อย" };
}

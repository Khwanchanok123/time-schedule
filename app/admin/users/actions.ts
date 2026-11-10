"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hashPassword, validatePassword, validateUsername } from "@/lib/auth";
import { dbErrorToThai } from "@/lib/conflicts";
import { isUuid } from "@/lib/queries";
import type { ActionResult, Role } from "@/lib/types";

export interface UserInput {
  id?: string | null;
  username: string;
  full_name: string;
  role: Role;
  /** สร้างใหม่: บังคับ / แก้ไข: เว้นว่าง = ไม่เปลี่ยนรหัสผ่าน */
  password?: string;
}

function refresh() {
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  revalidatePath("/");
}

export async function saveUserAction(input: UserInput): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (me?.role !== "admin") return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };

  const username = input.username?.trim().toLowerCase() ?? "";
  const fullName = input.full_name?.trim() ?? "";
  const role: Role = input.role === "admin" ? "admin" : "teacher";
  const password = input.password ?? "";

  const invalid =
    validateUsername(username) ||
    (!fullName && "กรุณากรอกชื่อ-นามสกุล") ||
    ((!input.id || password) && validatePassword(password));
  if (invalid) return { ok: false, error: invalid };

  const sql = await db();
  try {
    if (input.id) {
      if (!isUuid(input.id)) return { ok: false, error: "รหัสผู้ใช้ไม่ถูกต้อง" };
      if (input.id === me.id && role !== "admin")
        return { ok: false, error: "ไม่สามารถลดสิทธิ์แอดมินของตัวเองได้" };
      const hash = password ? hashPassword(password) : null;
      await sql`
        UPDATE users SET username = ${username}, full_name = ${fullName}, role = ${role},
          password_hash = COALESCE(${hash}, password_hash)
        WHERE id = ${input.id}`;
    } else {
      await sql`
        INSERT INTO users (username, full_name, password_hash, role)
        VALUES (${username}, ${fullName}, ${hashPassword(password)}, ${role})`;
    }
  } catch (e) {
    return { ok: false, error: dbErrorToThai(e) };
  }

  refresh();
  return { ok: true, message: input.id ? "แก้ไขผู้ใช้เรียบร้อย" : "เพิ่มผู้ใช้เรียบร้อย" };
}

export async function deleteUserAction(id: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (me?.role !== "admin") return { ok: false, error: "เฉพาะแอดมินเท่านั้น" };
  if (!isUuid(id)) return { ok: false, error: "รหัสผู้ใช้ไม่ถูกต้อง" };
  if (id === me.id) return { ok: false, error: "ไม่สามารถลบบัญชีของตัวเองได้" };

  const sql = await db();
  const deleted = await sql`DELETE FROM users WHERE id = ${id} RETURNING id`;
  if (!deleted.length) return { ok: false, error: "ไม่พบผู้ใช้" };

  refresh();
  return { ok: true, message: "ลบผู้ใช้และตารางสอนของผู้ใช้นั้นเรียบร้อย" };
}

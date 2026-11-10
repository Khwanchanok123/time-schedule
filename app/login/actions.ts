"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  clearSessionCookie,
  hashPassword,
  setSessionCookie,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "@/lib/auth";
import { dbErrorToThai } from "@/lib/conflicts";

export type FormState = { error?: string } | undefined;

function safeNext(v: FormDataEntryValue | null): string {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  const sql = await db();
  const [user] = await sql`SELECT id, password_hash FROM users WHERE username = ${username}`;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  }
  await setSessionCookie(user.id);
  redirect(safeNext(form.get("next")));
}

/** ยังไม่มีผู้ใช้ในระบบเลย → บัญชีแรกที่สร้างจะเป็นแอดมิน */
export async function setupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const fullName = String(form.get("full_name") ?? "").trim();
  const password = String(form.get("password") ?? "");

  const invalid =
    validateUsername(username) || (!fullName && "กรุณากรอกชื่อ-นามสกุล") || validatePassword(password);
  if (invalid) return { error: invalid };

  const sql = await db();
  let created;
  try {
    [created] = await sql`
      INSERT INTO users (username, full_name, password_hash, role)
      SELECT ${username}, ${fullName}, ${hashPassword(password)}, 'admin'
      WHERE NOT EXISTS (SELECT 1 FROM users)
      RETURNING id`;
  } catch (e) {
    return { error: dbErrorToThai(e) };
  }
  if (!created) return { error: "ตั้งค่าผู้ดูแลไปแล้ว กรุณาเข้าสู่ระบบ" };

  await setSessionCookie(created.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/");
}

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { COOKIE, SESSION_DAYS, signSession, verifySession } from "@/lib/session";
import type { User } from "@/lib/types";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function setSessionCookie(userId: string) {
  (await cookies()).set(COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

/** ผู้ใช้ที่ล็อกอินอยู่ (null ถ้ายังไม่ล็อกอิน หรือบัญชีถูกลบไปแล้ว) */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const sql = await db();
  const [user] = await sql<User>`
    SELECT id, username, full_name, role FROM users WHERE id = ${session.id}`;
  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export function validateUsername(username: string): string | null {
  return /^[a-z0-9_.-]{3,32}$/.test(username)
    ? null
    : "ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษตัวเล็ก/ตัวเลข/_ . - ยาว 3-32 ตัว";
}

export function validatePassword(password: string): string | null {
  return !password || password.length < 6 ? "รหัสผ่านต้องมีอย่างน้อย 6 ตัว" : null;
}

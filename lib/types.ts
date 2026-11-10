export type Role = "teacher" | "admin";

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: Role;
}

export interface Room {
  id: string;
  name: string;
  building: string | null;
  is_active: boolean;
}

export interface Schedule {
  id: string;
  teacher_id: string;
  room_id: string | null;
  room_text: string | null; // ชื่อห้องนอกระบบ (เมื่อ room_id = null)
  start_time: string; // ISO (UTC)
  end_time: string;
  subject: string | null;
  topic: string | null; // หัวข้อที่จะเรียน
  note: string | null;
  registration_open: boolean; // เปิดให้ลงทะเบียนแล้วหรือยัง
  seats: number | null; // จำนวนที่นั่ง (จำกัดคนลงทะเบียน)
}

/** ตารางสอนพร้อมชื่ออาจารย์และชื่อห้อง (ใช้แสดงผล) */
export interface ScheduleWithRelations extends Schedule {
  teacher: { id: string; full_name: string } | null;
  /** ห้องในระบบ หรือห้องนอกระบบ (id = null, custom = true) — null = ห้องถูกลบ */
  room: { id: string | null; name: string; building: string | null; custom: boolean } | null;
}

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

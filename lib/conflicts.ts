import { toIso, type Sql } from "@/lib/db";
import { isUuid } from "@/lib/queries";
import { formatRange, formatThaiDate } from "@/lib/time";

export interface ConflictInput {
  teacherId: string;
  /** ห้องในระบบ (uuid) หรือ null ถ้าเป็นห้องนอกระบบ */
  roomId: string | null;
  /** ชื่อห้องนอกระบบ (ใช้เมื่อ roomId = null) */
  roomText?: string | null;
  startISO: string;
  endISO: string;
  /** id ของรายการที่กำลังแก้ไข (ไม่นับตัวเองว่าซ้ำ) */
  excludeId?: string | null;
}

export interface Conflict {
  kind: "room" | "teacher";
  scheduleId: string;
  message: string;
}

/**
 * หารายการที่ทับซ้อน
 * เงื่อนไขทับซ้อน: start ใหม่ < end เดิม AND end ใหม่ > start เดิม
 * - ห้องเดียวกัน หรือ
 * - อาจารย์คนเดียวกัน (แม้ต่างห้อง)
 */
export async function findConflicts(sql: Sql, input: ConflictInput): Promise<Conflict[]> {
  const { teacherId, startISO, endISO } = input;
  const roomId = isUuid(input.roomId) ? input.roomId : null;
  const roomText = roomId ? null : input.roomText?.trim() || null;
  if (!isUuid(teacherId) || (!roomId && !roomText)) return [];
  if (new Date(endISO) <= new Date(startISO)) return [];
  const excludeId = input.excludeId && isUuid(input.excludeId) ? input.excludeId : null;

  const rows = await sql`
    SELECT s.id, s.room_id, s.room_text, s.start_time, s.end_time,
           u.full_name AS teacher_name, r.name AS room_name
    FROM schedules s
    LEFT JOIN users u ON u.id = s.teacher_id
    LEFT JOIN rooms r ON r.id = s.room_id
    WHERE s.start_time < ${endISO}
      AND s.end_time > ${startISO}
      AND (s.room_id = ${roomId}::uuid
           OR lower(s.room_text) = lower(${roomText}::text)
           OR s.teacher_id = ${teacherId}::uuid)
      AND (${excludeId}::uuid IS NULL OR s.id <> ${excludeId}::uuid)
    ORDER BY s.start_time`;

  return rows.map((r) => {
    const teacherName = r.teacher_name || "ไม่ทราบชื่อ";
    const roomName = r.room_name || r.room_text || "-";
    const start = toIso(r.start_time);
    const time = formatRange(start, toIso(r.end_time));
    const date = formatThaiDate(start);
    const sameRoom = roomId
      ? r.room_id === roomId
      : !!r.room_text && r.room_text.toLowerCase() === roomText!.toLowerCase();
    if (sameRoom) {
      return {
        kind: "room" as const,
        scheduleId: r.id,
        message: `ห้อง ${roomName} ถูกใช้แล้วโดย อ.${teacherName} เวลา ${time} (${date})`,
      };
    }
    return {
      kind: "teacher" as const,
      scheduleId: r.id,
      message: `อ.${teacherName} มีสอนอยู่แล้วที่ห้อง ${roomName} เวลา ${time} (${date})`,
    };
  });
}

/** แปลง error จากฐานข้อมูลเป็นข้อความภาษาไทย (ใช้ได้ทั้ง Neon และ PGlite) */
export function dbErrorToThai(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string; detail?: string; constraint?: string };
  const text = `${err.message ?? ""} ${err.detail ?? ""} ${err.constraint ?? ""}`;
  if (err.code === "23P01") {
    if (text.includes("schedules_no_room_overlap") || text.includes("schedules_no_custom_room_overlap"))
      return "ห้องนี้ถูกจองในช่วงเวลาดังกล่าวแล้ว (มีผู้บันทึกก่อนหน้าคุณ)";
    if (text.includes("schedules_no_teacher_overlap")) return "อาจารย์มีตารางสอนช่วงเวลานี้อยู่แล้ว";
    return "ช่วงเวลาทับซ้อนกับรายการอื่น";
  }
  if (err.code === "23514") return "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม";
  if (err.code === "23505") {
    if (text.includes("username")) return "ชื่อผู้ใช้นี้ถูกใช้แล้ว";
    if (text.includes("rooms_name")) return "ชื่อห้องนี้มีอยู่แล้ว";
    return "ข้อมูลซ้ำกับที่มีอยู่แล้ว";
  }
  if (text.includes("ROOM_HAS_FUTURE_SCHEDULES")) return "ห้องนี้มีตารางสอนในอนาคต ไม่สามารถลบได้";
  console.error(e);
  return "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
}

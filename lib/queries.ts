import { toIso, type Row, type Sql } from "@/lib/db";
import type { Room, ScheduleWithRelations } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

function mapSchedule(r: Row): ScheduleWithRelations {
  return {
    id: r.id,
    teacher_id: r.teacher_id,
    room_id: r.room_id,
    start_time: toIso(r.start_time),
    end_time: toIso(r.end_time),
    subject: r.subject,
    topic: r.topic,
    note: r.note,
    registration_open: !!r.registration_open,
    seats: r.seats ?? null,
    teacher: r.teacher_name != null ? { id: r.teacher_id, full_name: r.teacher_name } : null,
    room_text: r.room_text ?? null,
    room:
      r.room_name != null
        ? { id: r.room_id, name: r.room_name, building: r.room_building, custom: false }
        : r.room_text
          ? { id: null, name: r.room_text, building: null, custom: true }
          : null,
  };
}

export interface ScheduleFilter {
  /** รายการที่ทับช่วง [from, to) */
  from?: string;
  to?: string;
  teacherId?: string;
  roomId?: string;
}

export async function listSchedules(sql: Sql, f: ScheduleFilter = {}): Promise<ScheduleWithRelations[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (cond: string, v: unknown) => {
    params.push(v);
    where.push(cond.replace("?", `$${params.length}`));
  };
  if (f.to) add("s.start_time < ?", f.to);
  if (f.from) add("s.end_time > ?", f.from);
  if (f.teacherId) add("s.teacher_id = ?", f.teacherId);
  if (f.roomId) add("s.room_id = ?", f.roomId);

  const rows = await sql.query(
    `SELECT s.id, s.teacher_id, s.room_id, s.start_time, s.end_time, s.subject, s.topic, s.note,
            s.registration_open, s.seats, s.room_text,
            u.full_name AS teacher_name, r.name AS room_name, r.building AS room_building
     FROM schedules s
     LEFT JOIN users u ON u.id = s.teacher_id
     LEFT JOIN rooms r ON r.id = s.room_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY s.start_time`,
    params
  );
  return rows.map(mapSchedule);
}

export async function listRooms(sql: Sql): Promise<Room[]> {
  return sql<Room>`SELECT id, name, building, is_active FROM rooms ORDER BY name`;
}

export async function listTeachers(sql: Sql): Promise<{ id: string; full_name: string }[]> {
  return sql`SELECT id, full_name FROM users ORDER BY full_name` as Promise<
    { id: string; full_name: string }[]
  >;
}

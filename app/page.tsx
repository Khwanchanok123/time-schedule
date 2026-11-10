import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listRooms, listTeachers } from "@/lib/queries";
import PublicCalendar from "@/components/PublicCalendar";

export const dynamic = "force-dynamic";

/** หน้าแรก = ปฏิทินตารางสอน */
export default async function HomePage() {
  const sql = await db();
  const [rooms, teachers, user] = await Promise.all([listRooms(sql), listTeachers(sql), getCurrentUser()]);

  // ล็อกอินแล้ว (อาจารย์/แอดมิน) คลิกวันในปฏิทินเพื่อไปเพิ่มคาบสอนได้
  return <PublicCalendar rooms={rooms} teachers={teachers} canAdd={!!user} />;
}

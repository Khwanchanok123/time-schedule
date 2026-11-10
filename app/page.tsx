import { db } from "@/lib/db";
import { listRooms, listTeachers } from "@/lib/queries";
import PublicCalendar from "@/components/PublicCalendar";

export const dynamic = "force-dynamic";

/** หน้าแรก = ปฏิทินตารางสอน */
export default async function HomePage() {
  const sql = await db();
  const [rooms, teachers] = await Promise.all([listRooms(sql), listTeachers(sql)]);

  return <PublicCalendar rooms={rooms} teachers={teachers} />;
}

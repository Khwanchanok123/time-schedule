import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRooms } from "@/lib/queries";
import RoomManager from "@/components/RoomManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "จัดการห้องเรียน | ตารางสอนศาสตราจารย์" };

export default async function AdminRoomsPage() {
  await requireAdmin();
  const sql = await db();

  const [rooms, counts] = await Promise.all([
    listRooms(sql),
    sql`SELECT room_id, COUNT(*)::int AS n FROM schedules
        WHERE end_time > now() AND room_id IS NOT NULL GROUP BY room_id`,
  ]);
  const futureCounts: Record<string, number> = Object.fromEntries(counts.map((c) => [c.room_id, c.n]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">จัดการห้องเรียน</h1>
        <p className="text-sm text-slate-500">
          ห้องที่มีตารางสอนในอนาคตจะลบไม่ได้ ระบบจะเปลี่ยนเป็น &quot;ปิดใช้งาน&quot; แทน
        </p>
      </div>
      <RoomManager rooms={rooms} futureCounts={futureCounts} />
    </div>
  );
}

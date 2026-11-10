import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRooms, listSchedules, listTeachers } from "@/lib/queries";
import HistoryView from "@/components/HistoryView";

export const dynamic = "force-dynamic";
export const metadata = { title: "ประวัติตารางสอน | ตารางสอนอาจารย์" };

/** ประวัติตารางสอนทั้งหมดในระบบ (ผ่านมาแล้ว / กำลังสอน / กำลังจะถึง) — ทุกคนที่ล็อกอินดูได้ */
export default async function HistoryPage() {
  const user = await requireUser();
  const sql = await db();
  const [schedules, teachers, rooms] = await Promise.all([
    listSchedules(sql),
    listTeachers(sql),
    listRooms(sql),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ประวัติตารางสอนทั้งหมด</h1>
        <p className="text-sm text-slate-500">
          ตารางสอนทุกรายการในระบบ ทั้งที่ผ่านมาแล้ว กำลังสอนอยู่ และกำลังจะถึง (เวลาประเทศไทย)
        </p>
      </div>
      <HistoryView schedules={schedules} teachers={teachers} rooms={rooms} currentUserId={user.id} />
    </div>
  );
}

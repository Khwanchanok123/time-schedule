import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listRooms, listSchedules, listTeachers } from "@/lib/queries";
import ScheduleManager from "@/components/ScheduleManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "จัดการตารางสอน | ตารางสอนอาจารย์" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; time?: string }>;
}) {
  const user = await requireUser();
  // ลิงก์จากการคลิกวันในปฏิทิน: ?date=YYYY-MM-DD&time=HH:MM (รูปแบบไม่ถูกก็ไม่ใช้)
  const sp = await searchParams;
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date : undefined;
  const initialTime = initialDate && /^\d{2}:\d{2}$/.test(sp.time ?? "") ? sp.time : undefined;
  const sql = await db();

  // ทุกคนเห็นตารางสอนของทุกคน (อาจารย์แก้ไข/ลบได้เฉพาะของตัวเอง — ตรวจซ้ำใน server action)
  const [rooms, schedules, teachers] = await Promise.all([
    listRooms(sql),
    listSchedules(sql),
    listTeachers(sql),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">จัดการตารางสอน</h1>
        <p className="text-sm text-slate-500">เวลาทั้งหมดเป็นเวลาประเทศไทย (Asia/Bangkok)</p>
      </div>

      <ScheduleManager
        currentUser={user}
        rooms={rooms}
        schedules={schedules}
        teachers={teachers}
        initialDate={initialDate}
        initialTime={initialTime}
      />
    </div>
  );
}

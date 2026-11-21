import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listLocks } from "@/lib/queries";
import LockManager from "@/components/LockManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "ล็อกตาราง | ตารางสอนศาสตราจารย์" };

export default async function AdminLocksPage() {
  await requireAdmin();
  const sql = await db();

  const [locks, counts] = await Promise.all([
    listLocks(sql),
    // จำนวนคาบสอนเดิมที่อยู่ในแต่ละช่วงที่ล็อก
    sql`SELECT l.id, COUNT(s.id)::int AS n FROM schedule_locks l
        JOIN schedules s ON s.start_time < l.end_time AND s.end_time > l.start_time
        GROUP BY l.id`,
  ]);
  const overlapCounts: Record<string, number> = Object.fromEntries(counts.map((c) => [c.id, c.n]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ล็อกตาราง</h1>
        <p className="text-sm text-slate-500">
          ช่วงเวลาที่ล็อกไว้ จะไม่มีใครเปิดสอนได้ (ทุกห้อง ทุกคน รวมถึงแอดมิน) จนกว่าจะปลดล็อก ·
          เวลาทั้งหมดเป็นเวลาประเทศไทย
        </p>
      </div>
      <LockManager locks={locks} overlapCounts={overlapCounts} />
    </div>
  );
}

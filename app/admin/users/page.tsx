import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import UserManager, { type UserRow } from "@/components/UserManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "จัดการผู้ใช้ | ตารางสอนอาจารย์" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const sql = await db();
  const users = await sql<UserRow>`
    SELECT u.id, u.username, u.full_name, u.role,
           (SELECT COUNT(*)::int FROM schedules s WHERE s.teacher_id = u.id) AS schedule_count
    FROM users u ORDER BY u.role, u.full_name`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">จัดการผู้ใช้</h1>
        <p className="text-sm text-slate-500">สร้างบัญชีให้อาจารย์ แล้วแจ้งชื่อผู้ใช้และรหัสผ่านให้อาจารย์ไปเข้าสู่ระบบ</p>
      </div>
      <UserManager users={users} meId={me.id} />
    </div>
  );
}

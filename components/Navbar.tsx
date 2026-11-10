import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

export default async function Navbar() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-blue-700">
          📅 ตารางสอนศาสตราจารย์
        </Link>

        <div className="flex flex-1 flex-wrap items-center gap-4 text-sm">
          <Link href="/" className="hover:text-blue-600">
            ปฏิทิน
          </Link>
          {user && (
            <Link href="/dashboard" className="hover:text-blue-600">
              จัดการตารางสอน
            </Link>
          )}
          {user && (
            <Link href="/history" className="hover:text-blue-600">
              ประวัติตารางสอน
            </Link>
          )}
          {isAdmin && (
            <>
              <Link href="/admin/rooms" className="hover:text-blue-600">
                จัดการห้องเรียน
              </Link>
              <Link href="/admin/users" className="hover:text-blue-600">
                จัดการผู้ใช้
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="text-slate-600">
                {user.full_name}
                {isAdmin && (
                  <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">แอดมิน</span>
                )}
              </span>
              <form action={logoutAction}>
                <button className="btn-secondary py-1.5">ออกจากระบบ</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn-primary py-1.5">
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}

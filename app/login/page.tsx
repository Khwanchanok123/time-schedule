import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "เข้าสู่ระบบ | ตารางสอนอาจารย์" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");

  const sql = await db();
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  const { next } = await searchParams;

  return (
    <div className="mx-auto mt-8 max-w-md">
      <LoginForm needsSetup={count === 0} next={next ?? "/"} />
    </div>
  );
}

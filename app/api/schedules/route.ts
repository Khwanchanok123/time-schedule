import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isUuid, listSchedules } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** สาธารณะ: ตารางสอนที่ทับช่วง [start, end) ใช้กับปฏิทินหน้าแรก */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const start = p.get("start");
  const end = p.get("end");
  const room = p.get("room");
  const teacher = p.get("teacher");

  const valid = (s: string | null) => !!s && !Number.isNaN(Date.parse(s));
  if (!valid(start) || !valid(end)) {
    return NextResponse.json({ error: "ต้องระบุ start และ end" }, { status: 400 });
  }

  const sql = await db();
  const rows = await listSchedules(sql, {
    from: new Date(start!).toISOString(),
    to: new Date(end!).toISOString(),
    roomId: isUuid(room) ? room : undefined,
    teacherId: isUuid(teacher) ? teacher : undefined,
  });
  return NextResponse.json(rows);
}

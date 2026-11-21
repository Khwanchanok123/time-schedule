import { formatDateTimeRange, formatThaiDate, isoToBangkokDate } from "@/lib/time";

/** ข้อมูลล็อกขั้นต่ำที่ใช้สร้างข้อความ (ใช้ได้ทั้งฝั่งหน้าเว็บและ server) */
interface LockLike {
  start_time: string;
  end_time: string;
  reason: string | null;
  all_day: boolean;
}

/** วันสุดท้ายของช่วง (จบเที่ยงคืนพอดี = นับเป็นวันก่อนหน้า) เป็น "YYYY-MM-DD" */
export const lastDayOf = (endIso: string) => isoToBangkokDate(new Date(new Date(endIso).getTime() - 1));

/**
 * ช่วงของล็อก
 * - วันหยุด: "ส. 21 พ.ย. 2569" หรือ "ส. 21 พ.ย. 2569 – อ. 24 พ.ย. 2569"
 * - ช่วงเวลา: "ส. 21 พ.ย. 2569 22:00–23:00 น."
 */
export function formatLockRange(l: Omit<LockLike, "reason">): string {
  if (!l.all_day) return `${formatDateTimeRange(l.start_time, l.end_time)} น.`;
  const last = new Date(new Date(l.end_time).getTime() - 1);
  return isoToBangkokDate(l.start_time) === isoToBangkokDate(last)
    ? formatThaiDate(l.start_time)
    : `${formatThaiDate(l.start_time)} – ${formatThaiDate(last)}`;
}

/** ข้อความแจ้งว่าเปิดสอนไม่ได้เพราะล็อก/วันหยุด */
export function lockMessage(l: LockLike): string {
  const reason = l.reason ? ` (${l.reason})` : "";
  return l.all_day
    ? `🏖️ ${formatLockRange(l)} เป็นวันหยุด ไม่สามารถเปิดสอนได้${reason}`
    : `🔒 ช่วงเวลา ${formatLockRange(l)} ถูกล็อกไว้ ไม่สามารถเปิดสอนได้${reason}`;
}

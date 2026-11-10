/**
 * ระบบใช้ Asia/Bangkok (UTC+7, ไม่มี daylight saving) ทั้งหมด
 * ฐานข้อมูลเก็บเป็น timestamptz (UTC) ส่วนหน้าเว็บแสดงเป็นเวลาไทยเสมอ
 * ไม่ขึ้นกับ timezone ของเครื่องผู้ใช้หรือเซิร์ฟเวอร์ (Vercel = UTC)
 */
export const TIMEZONE = "Asia/Bangkok";
const OFFSET = "+07:00";

/** "2026-11-10" + "09:30" (เวลาไทย) → ISO string UTC */
export function bangkokToISO(date: string, time: string): string {
  const d = new Date(`${date}T${time}:00${OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error("รูปแบบวันที่/เวลาไม่ถูกต้อง");
  return d.toISOString();
}

/**
 * ช่วงเวลาในวันที่เลือก (เวลาไทย) → ISO string UTC
 * ถ้าเวลาสิ้นสุดน้อยกว่าเวลาเริ่ม ถือว่าสิ้นสุดวันถัดไป (คาบข้ามคืน เช่น 23:00–00:00, 22:00–02:00)
 * ถ้าเวลาเท่ากัน ไม่ข้ามวัน (ให้ตัวตรวจจับว่าเวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม)
 */
export function bangkokRangeToISO(date: string, startTime: string, endTime: string) {
  const startISO = bangkokToISO(date, startTime);
  let endISO = bangkokToISO(date, endTime);
  if (endTime < startTime) endISO = new Date(new Date(endISO).getTime() + 24 * 3600 * 1000).toISOString();
  return { startISO, endISO };
}

function parts(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** ISO → "YYYY-MM-DD" (เวลาไทย) สำหรับ <input type="date"> */
export function isoToBangkokDate(iso: string | Date): string {
  const p = parts(iso);
  return `${p.year}-${p.month}-${p.day}`;
}

/** ISO → "HH:MM" (เวลาไทย) */
export function formatTime(iso: string | Date): string {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}

/** ISO → "อ. 10 พ.ย. 2569" */
export function formatThaiDate(iso: string | Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function formatRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)}–${formatTime(endIso)}`;
}

/** วันนี้ (เวลาไทย) เป็น "YYYY-MM-DD" */
export function todayBangkok(): string {
  return isoToBangkokDate(new Date());
}

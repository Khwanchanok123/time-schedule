/**
 * กฎเรื่องเวลาเมื่อเพิ่ม/แก้ไขตารางสอน (ใช้ร่วมกันทั้งฝั่งหน้าเว็บและ server)
 *
 * สถานะของคาบ "เดิม" (ตอนกดแก้ไข) เทียบกับเวลาปัจจุบัน:
 *   upcoming = ยังไม่เริ่ม      (now < start)
 *   ongoing  = กำลังสอนอยู่     (start <= now < end)
 *   past     = สอนจบไปแล้ว     (end <= now)
 *
 * | กรณี                  | วันที่ / เวลาเริ่ม           | เวลาสิ้นสุด                 |
 * |-----------------------|-----------------------------|----------------------------|
 * | เพิ่มใหม่              | ต้องไม่ใช่เวลาที่ผ่านมาแล้ว     | > เวลาเริ่ม                 |
 * | แก้ไขคาบที่ยังไม่เริ่ม   | เปลี่ยนได้ แต่ต้องไม่ผ่านมาแล้ว  | > เวลาเริ่ม                 |
 * | แก้ไขคาบที่กำลังสอน     | ล็อก (เปลี่ยนไม่ได้)          | ขยาย/ย่นได้ แต่ต้อง > ตอนนี้  |
 * | แก้ไขคาบที่สอนจบแล้ว    | ล็อก                         | ล็อก                        |
 *
 * ทุกกรณียังต้องผ่านการเช็กเวลาทับซ้อน (ห้อง/อาจารย์) โดยไม่นับรายการตัวเอง
 */

export type Phase = "upcoming" | "ongoing" | "past";

export function phaseOf(startMs: number, endMs: number, now: number): Phase {
  if (endMs <= now) return "past";
  if (startMs <= now) return "ongoing";
  return "upcoming";
}

export interface TimeEditInput {
  /** เวลาเดิมของรายการที่แก้ไข (ไม่มี = เพิ่มใหม่) */
  original?: { startMs: number; endMs: number } | null;
  startMs: number;
  endMs: number;
  now: number;
}

/** คืนข้อความ error ภาษาไทย หรือ null ถ้าผ่าน */
export function checkTimeEdit({ original, startMs, endMs, now }: TimeEditInput): string | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "รูปแบบวันที่/เวลาไม่ถูกต้อง";
  if (endMs <= startMs) return "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม";

  if (!original) {
    return startMs < now ? "เลือกเวลาที่ผ่านมาแล้วไม่ได้ กรุณาเลือกวันและเวลาในอนาคต" : null;
  }

  const startChanged = startMs !== original.startMs;
  const endChanged = endMs !== original.endMs;

  switch (phaseOf(original.startMs, original.endMs, now)) {
    case "past":
      return startChanged || endChanged
        ? "คาบนี้สอนจบไปแล้ว เปลี่ยนวัน/เวลาไม่ได้ (แก้ได้เฉพาะรายละเอียดอื่น)"
        : null;
    case "ongoing":
      if (startChanged) return "คาบนี้กำลังสอนอยู่ เปลี่ยนวัน/เวลาเริ่มไม่ได้ (ปรับได้เฉพาะเวลาสิ้นสุด)";
      if (endChanged && endMs <= now) return "เวลาสิ้นสุดใหม่ต้องเป็นเวลาหลังจากตอนนี้";
      return null;
    case "upcoming":
      return startChanged && startMs < now
        ? "เลือกเวลาที่ผ่านมาแล้วไม่ได้ กรุณาเลือกวันและเวลาในอนาคต"
        : null;
  }
}

/** ช่องไหนในฟอร์มที่ต้องล็อกตามสถานะของคาบเดิม */
export function lockedFields(original: { startMs: number; endMs: number } | null | undefined, now: number) {
  if (!original) return { date: false, start: false, end: false, phase: null as Phase | null };
  const phase = phaseOf(original.startMs, original.endMs, now);
  return {
    phase,
    date: phase !== "upcoming",
    start: phase !== "upcoming",
    end: phase === "past",
  };
}

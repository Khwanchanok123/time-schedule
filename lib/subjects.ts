/** รายวิชาที่เลือกได้ในฟอร์มลงตารางสอน (แก้ไข/เพิ่มวิชาได้ที่นี่) */
export const SUBJECTS = [
  "วิชาการบินไม้กวาดและม้า",
  "วิชาพยากรณ์ศาสตร์",
  "วิชาสัตว์วิทยา",
  "วิชาประวัติศาสตร์",
  "วิชาสมุนไพรและการปรุงยา",
  "วิชาแปลงกาย",
  "วิชาเวทมนต์คาถา",
  "วิชาป้องกันตัวจากศาสตร์มืด",
  "วิชาอักษรรูน",
] as const;

export const isSubject = (v: unknown): v is (typeof SUBJECTS)[number] =>
  typeof v === "string" && (SUBJECTS as readonly string[]).includes(v);

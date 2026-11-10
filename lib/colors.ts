// พาเลตสีที่อ่านตัวอักษรสีขาวได้ชัด
const PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c",
  "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#b45309",
  "#0d9488", "#7c3aed", "#e11d48", "#0284c7", "#a16207",
];

import { SUBJECTS } from "@/lib/subjects";

/** สีประจำแต่ละวิชา (กำหนดตายตัว เพื่อให้ 9 วิชาไม่ซ้ำสีกัน) — เรียงตาม SUBJECTS */
const SUBJECT_COLORS = [
  "#2563eb", // การบินไม้กวาดและม้า
  "#9333ea", // พยากรณ์ศาสตร์
  "#16a34a", // สัตว์วิทยา
  "#b45309", // ประวัติศาสตร์
  "#0d9488", // สมุนไพรและการปรุงยา
  "#db2777", // แปลงกาย
  "#ea580c", // เวทมนต์คาถา
  "#dc2626", // ป้องกันตัวจากศาสตร์มืด
  "#4f46e5", // อักษรรูน
];

/** สีของวิชา (วิชาเก่าที่ไม่อยู่ในรายการ ใช้สีจากชื่อแทน) */
export function colorForSubject(subject: string | null | undefined): string {
  const i = (SUBJECTS as readonly string[]).indexOf(subject ?? "");
  return i >= 0 ? SUBJECT_COLORS[i % SUBJECT_COLORS.length] : colorFor(subject);
}

/** สีคงที่ต่อ id (ห้องหรืออาจารย์คนเดิมได้สีเดิมเสมอ) */
export function colorFor(id: string | null | undefined): string {
  if (!id) return "#6b7280";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

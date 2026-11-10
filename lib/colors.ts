// พาเลตสีที่อ่านตัวอักษรสีขาวได้ชัด
const PALETTE = [
  "#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c",
  "#0891b2", "#db2777", "#4f46e5", "#65a30d", "#b45309",
  "#0d9488", "#7c3aed", "#e11d48", "#0284c7", "#a16207",
];

/** สีคงที่ต่อ id (ห้องหรืออาจารย์คนเดิมได้สีเดิมเสมอ) */
export function colorFor(id: string | null | undefined): string {
  if (!id) return "#6b7280";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

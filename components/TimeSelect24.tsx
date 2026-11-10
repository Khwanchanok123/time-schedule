"use client";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

/** ช่องเลือกเวลาแบบ 24 ชั่วโมง (ไม่ขึ้นกับภาษา/AM-PM ของเบราว์เซอร์) ค่าเป็น "HH:MM" */
export default function TimeSelect24({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [h = "", m = ""] = value.split(":");
  // ค่าเดิมที่นาทีไม่ลงตัว 5 ยังแสดงได้
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES;

  return (
    <div className="flex items-center gap-1">
      <select
        id={id}
        className="input px-2"
        value={h}
        onChange={(e) => onChange(`${e.target.value}:${m || "00"}`)}
        aria-label="ชั่วโมง"
        disabled={disabled}
        required
      >
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="font-semibold text-slate-500">:</span>
      <select
        className="input px-2"
        value={m}
        onChange={(e) => onChange(`${h || "00"}:${e.target.value}`)}
        aria-label="นาที"
        disabled={disabled}
        required
      >
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="ml-1 text-sm text-slate-500">น.</span>
    </div>
  );
}

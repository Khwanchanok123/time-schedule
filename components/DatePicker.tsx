"use client";

import { useRef } from "react";

/** "2026-11-10" → "10/11/2569" (วัน/เดือน/ปี พ.ศ.) */
function toDMY(value: string): string {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${Number(y) + 543}` : "";
}

/**
 * ช่องเลือกวันที่: กดแล้วเปิดปฏิทินของเบราว์เซอร์ (แบบเดิม)
 * แต่ช่องแสดงผลเป็น วว/ดด/ปปปป (พ.ศ.) เสมอ ไม่ขึ้นกับภาษาของเครื่อง
 * ค่า value / onChange เป็น "YYYY-MM-DD" เหมือน <input type="date">
 */
export default function DatePicker({
  id,
  value,
  onChange,
  disabled = false,
  allowEmpty = false,
  min,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** มีปุ่ม × ล้างค่า (ใช้ในตัวกรอง) */
  allowEmpty?: boolean;
  min?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const open = () => {
    const el = ref.current;
    if (!el || disabled) return;
    try {
      el.showPicker(); // Chrome / Edge / Firefox / Safari 16+
    } catch {
      el.focus();
      el.click();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        onClick={open}
        disabled={disabled}
        className="input flex items-center justify-between gap-2 text-left"
      >
        <span className={value ? "" : "text-slate-400"}>{value ? toDMY(value) : "วว/ดด/ปปปป"}</span>
        <span aria-hidden className="text-slate-400">
          📅
        </span>
      </button>
      {allowEmpty && value && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-8 top-1/2 -translate-y-1/2 px-1 text-slate-400 hover:text-slate-700"
          aria-label="ล้างวันที่"
        >
          ×
        </button>
      )}
      {/* input จริงซ่อนไว้ ใช้เปิดปฏิทินของเบราว์เซอร์ */}
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
      />
    </div>
  );
}

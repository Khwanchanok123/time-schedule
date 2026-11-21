"use client";

import { useState, useTransition } from "react";
import { deleteLockAction, saveLockAction, type LockInput } from "@/app/admin/locks/actions";
import DatePicker from "@/components/DatePicker";
import TimeSelect24 from "@/components/TimeSelect24";
import { formatLockRange, lastDayOf } from "@/lib/locks";
import { formatTime, isoToBangkokDate, todayBangkok } from "@/lib/time";
import type { ScheduleLock } from "@/lib/types";

interface Props {
  locks: ScheduleLock[];
  overlapCounts: Record<string, number>;
}

type FormState = Required<LockInput>;

const emptyForm = (): FormState => {
  const today = todayBangkok();
  return { id: null, startDate: today, startTime: "08:00", endDate: today, endTime: "17:00", reason: "", allDay: false };
};

/** ล็อกเดิม → ค่าในฟอร์ม (วันหยุด: วันสิ้นสุด = วันสุดท้ายของช่วง) */
function lockToForm(l: ScheduleLock): FormState {
  return {
    id: l.id,
    startDate: isoToBangkokDate(l.start_time),
    startTime: l.all_day ? "08:00" : formatTime(l.start_time),
    endDate: l.all_day ? lastDayOf(l.end_time) : isoToBangkokDate(l.end_time),
    endTime: l.all_day ? "17:00" : formatTime(l.end_time),
    reason: l.reason ?? "",
    allDay: l.all_day,
  };
}

export default function LockManager({ locks, overlapCounts }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof LockInput>(key: K, value: LockInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, onOk?: () => void) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setSuccess(res.message ?? "สำเร็จ");
        onOk?.();
      } else {
        setError(res.error ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    run(() => saveLockAction(form), () => setForm(emptyForm()));
  }

  function startEdit(lock: ScheduleLock) {
    setError(null);
    setSuccess(null);
    setForm(lockToForm(lock));
  }

  function handleDelete(lock: ScheduleLock) {
    if (!confirm(`ปลดล็อก${lock.all_day ? "วันหยุด" : "ช่วงเวลา"} ${formatLockRange(lock)} ?`)) return;
    run(() => deleteLockAction(lock.id), () => form.id === lock.id && setForm(emptyForm()));
  }

  const now = Date.now();
  const active = locks.filter((l) => new Date(l.end_time).getTime() > now);
  const past = locks.filter((l) => new Date(l.end_time).getTime() <= now);
  const shown = showPast ? [...active, ...past] : active;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="card h-fit">
        <h2 className="mb-4 text-lg font-semibold">{form.id ? "แก้ไขล็อก" : "ล็อกใหม่"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 text-sm">
            {[
              { allDay: false, label: "🔒 ช่วงเวลา" },
              { allDay: true, label: "🏖️ วันหยุดทั้งวัน" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => set("allDay", o.allDay)}
                className={`rounded px-2 py-1.5 font-medium ${
                  form.allDay === o.allDay ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {form.allDay && (
            <p className="text-xs text-slate-500">ใช้กับวันพัก / ปิดเทอม — ทั้งวันจะไม่สามารถเปิดสอนได้</p>
          )}
          <div>
            <label className="label" htmlFor="lock-start-date">
              {form.allDay ? "ตั้งแต่วันที่ *" : "เริ่ม *"}
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <DatePicker
                id="lock-start-date"
                value={form.startDate}
                onChange={(v) =>
                  // เลื่อนวันเริ่มเลยวันสิ้นสุด → ขยับวันสิ้นสุดตาม
                  setForm((f) => ({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate }))
                }
              />
              {!form.allDay && <TimeSelect24 value={form.startTime} onChange={(v) => set("startTime", v)} />}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="lock-end-date">
              {form.allDay ? "ถึงวันที่ *" : "สิ้นสุด *"}
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <DatePicker
                id="lock-end-date"
                value={form.endDate}
                min={form.startDate}
                onChange={(v) => set("endDate", v)}
              />
              {!form.allDay && <TimeSelect24 value={form.endTime} onChange={(v) => set("endTime", v)} />}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="lock-reason">
              เหตุผล
            </label>
            <input
              id="lock-reason"
              className="input"
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder={form.allDay ? "เช่น ปิดเทอม, วันพัก" : "เช่น สอบกลางภาค"}
              maxLength={200}
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

          <div className="flex gap-2">
            <button type="submit" className="btn-danger flex-1" disabled={isPending}>
              {isPending
                ? "กำลังบันทึก..."
                : form.id
                  ? "บันทึกการแก้ไข"
                  : form.allDay
                    ? "🏖️ บันทึกวันหยุด"
                    : "🔒 ล็อกช่วงเวลานี้"}
            </button>
            {form.id && (
              <button type="button" className="btn-secondary" onClick={() => setForm(emptyForm())}>
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            ช่วงเวลาที่ล็อก / วันหยุด <span className="text-sm font-normal text-slate-500">({active.length})</span>
          </h2>
          {past.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
              แสดงที่ผ่านมาแล้ว ({past.length})
            </label>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-slate-500">ยังไม่มีช่วงเวลาที่ล็อกหรือวันหยุด</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-medium">ประเภท</th>
                  <th className="py-2 pr-3 font-medium">ช่วงเวลา</th>
                  <th className="py-2 pr-3 font-medium">เหตุผล</th>
                  <th className="py-2 pr-3 font-medium">คาบเดิมในช่วงนี้</th>
                  <th className="py-2 pr-3 font-medium">ล็อกโดย</th>
                  <th className="py-2 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const isPast = new Date(l.end_time).getTime() <= now;
                  return (
                    <tr
                      key={l.id}
                      className={`border-b border-slate-100 ${isPast ? "text-slate-400" : ""} ${
                        form.id === l.id ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {l.all_day ? (
                          <span className={`rounded px-2 py-0.5 text-xs ${isPast ? "bg-slate-100" : "bg-amber-100 text-amber-800"}`}>
                            🏖️ วันหยุด
                          </span>
                        ) : (
                          <span className={`rounded px-2 py-0.5 text-xs ${isPast ? "bg-slate-100" : "bg-red-100 text-red-800"}`}>
                            🔒 ช่วงเวลา
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-medium">{formatLockRange(l)}</td>
                      <td className="py-2 pr-3">{l.reason ?? "-"}</td>
                      <td className="py-2 pr-3">
                        {overlapCounts[l.id] ? (
                          <span className={isPast ? "" : "text-amber-700"}>{overlapCounts[l.id]} รายการ</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 pr-3">{l.created_by_name ?? "-"}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        <button
                          className="mr-3 text-blue-600 hover:underline disabled:opacity-50"
                          disabled={isPending}
                          onClick={() => startEdit(l)}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="text-red-600 hover:underline disabled:opacity-50"
                          disabled={isPending}
                          onClick={() => handleDelete(l)}
                        >
                          ปลดล็อก
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

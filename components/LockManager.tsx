"use client";

import { useState, useTransition } from "react";
import { createLockAction, deleteLockAction, type LockInput } from "@/app/admin/locks/actions";
import DatePicker from "@/components/DatePicker";
import TimeSelect24 from "@/components/TimeSelect24";
import { formatDateTimeRange, todayBangkok } from "@/lib/time";
import type { ScheduleLock } from "@/lib/types";

interface Props {
  locks: ScheduleLock[];
  overlapCounts: Record<string, number>;
}

const emptyForm = (): Required<LockInput> => {
  const today = todayBangkok();
  return { startDate: today, startTime: "08:00", endDate: today, endTime: "17:00", reason: "" };
};

export default function LockManager({ locks, overlapCounts }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof LockInput>(key: K, value: string) => setForm((f) => ({ ...f, [key]: value }));

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
    run(() => createLockAction(form), () => setForm(emptyForm()));
  }

  function handleDelete(lock: ScheduleLock) {
    if (!confirm(`ปลดล็อกช่วงเวลา ${formatDateTimeRange(lock.start_time, lock.end_time)} ?`)) return;
    run(() => deleteLockAction(lock.id));
  }

  const now = Date.now();
  const active = locks.filter((l) => new Date(l.end_time).getTime() > now);
  const past = locks.filter((l) => new Date(l.end_time).getTime() <= now);
  const shown = showPast ? [...active, ...past] : active;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="card h-fit">
        <h2 className="mb-4 text-lg font-semibold">ล็อกช่วงเวลาใหม่</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="lock-start-date">
              เริ่ม *
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
              <TimeSelect24 value={form.startTime} onChange={(v) => set("startTime", v)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="lock-end-date">
              สิ้นสุด *
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <DatePicker
                id="lock-end-date"
                value={form.endDate}
                min={form.startDate}
                onChange={(v) => set("endDate", v)}
              />
              <TimeSelect24 value={form.endTime} onChange={(v) => set("endTime", v)} />
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
              placeholder="เช่น สอบกลางภาค, วันหยุด"
              maxLength={200}
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

          <button type="submit" className="btn-danger w-full" disabled={isPending}>
            {isPending ? "กำลังบันทึก..." : "🔒 ล็อกช่วงเวลานี้"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            ช่วงเวลาที่ล็อกอยู่ <span className="text-sm font-normal text-slate-500">({active.length})</span>
          </h2>
          {past.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} />
              แสดงที่ผ่านมาแล้ว ({past.length})
            </label>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-slate-500">ยังไม่มีช่วงเวลาที่ล็อก</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
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
                    <tr key={l.id} className={`border-b border-slate-100 ${isPast ? "text-slate-400" : ""}`}>
                      <td className="py-2 pr-3 font-medium">
                        {isPast ? "" : "🔒 "}
                        {formatDateTimeRange(l.start_time, l.end_time)}
                      </td>
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

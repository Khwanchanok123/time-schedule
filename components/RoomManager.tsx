"use client";

import { useState, useTransition } from "react";
import {
  deleteRoomAction,
  saveRoomAction,
  setRoomActiveAction,
} from "@/app/admin/rooms/actions";
import type { Room } from "@/lib/types";

interface Props {
  rooms: Room[];
  futureCounts: Record<string, number>;
}

type FormState = {
  id: string | null;
  name: string;
  building: string;
  is_active: boolean;
};

const emptyForm: FormState = { id: null, name: "", building: "", is_active: true };

export default function RoomManager({ rooms, futureCounts }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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
    run(() => saveRoomAction(form), () => setForm(emptyForm));
  }

  function handleDelete(room: Room) {
    const future = futureCounts[room.id] ?? 0;
    const msg =
      future > 0
        ? `ห้อง "${room.name}" มีตารางสอนในอนาคต ${future} รายการ จึงลบไม่ได้\nต้องการเปลี่ยนเป็น "ปิดใช้งาน" แทนหรือไม่?`
        : `ยืนยันการลบห้อง "${room.name}" ?\n(ประวัติการสอนในอดีตจะยังอยู่ แต่จะไม่แสดงชื่อห้อง)`;
    if (!confirm(msg)) return;
    run(() => deleteRoomAction(room.id), () => form.id === room.id && setForm(emptyForm));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="card h-fit">
        <h2 className="mb-4 text-lg font-semibold">{form.id ? "แก้ไขห้อง" : "เพิ่มห้อง"}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              ชื่อห้อง *
            </label>
            <input
              id="name"
              className="input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="เช่น 301"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="building">
              อาคาร
            </label>
            <input
              id="building"
              className="input"
              value={form.building}
              onChange={(e) => set("building", e.target.value)}
              placeholder="เช่น อาคาร 3"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
            />
            เปิดใช้งาน
          </label>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {success && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1" disabled={isPending}>
              {isPending ? "กำลังบันทึก..." : form.id ? "บันทึกการแก้ไข" : "เพิ่มห้อง"}
            </button>
            {form.id && (
              <button type="button" className="btn-secondary" onClick={() => setForm(emptyForm)}>
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">
          ห้องทั้งหมด <span className="text-sm font-normal text-slate-500">({rooms.length})</span>
        </h2>
        {rooms.length === 0 ? (
          <p className="py-10 text-center text-slate-500">ยังไม่มีห้องเรียน</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-medium">ชื่อห้อง</th>
                  <th className="py-2 pr-3 font-medium">อาคาร</th>
                  <th className="py-2 pr-3 font-medium">สถานะ</th>
                  <th className="py-2 pr-3 font-medium">ตารางในอนาคต</th>
                  <th className="py-2 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className={`border-b border-slate-100 ${form.id === r.id ? "bg-blue-50" : ""}`}>
                    <td className="py-2 pr-3 font-medium">{r.name}</td>
                    <td className="py-2 pr-3">{r.building ?? "-"}</td>
                    <td className="py-2 pr-3">
                      {r.is_active ? (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                          เปิดใช้งาน
                        </span>
                      ) : (
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                          ปิดใช้งาน
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{futureCounts[r.id] ?? 0}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button
                        className="mr-3 text-blue-600 hover:underline disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => {
                          setError(null);
                          setSuccess(null);
                          setForm({
                            id: r.id,
                            name: r.name,
                            building: r.building ?? "",
                            is_active: r.is_active,
                          });
                        }}
                      >
                        แก้ไข
                      </button>
                      <button
                        className="mr-3 text-slate-600 hover:underline disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => run(() => setRoomActiveAction(r.id, !r.is_active))}
                      >
                        {r.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                      <button
                        className="text-red-600 hover:underline disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => handleDelete(r)}
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

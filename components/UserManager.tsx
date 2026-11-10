"use client";

import { useState, useTransition } from "react";
import { deleteUserAction, saveUserAction } from "@/app/admin/users/actions";
import type { ActionResult, Role } from "@/lib/types";

export interface UserRow {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  schedule_count: number;
}

type FormState = { id: string | null; username: string; full_name: string; role: Role; password: string };
const emptyForm: FormState = { id: null, username: "", full_name: "", role: "teacher", password: "" };

export default function UserManager({ users, meId }: { users: UserRow[]; meId: string }) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function run(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setSuccess(res.message ?? "สำเร็จ");
        onOk?.();
      } else {
        setError(res.error);
      }
    });
  }

  function handleDelete(u: UserRow) {
    const msg =
      u.schedule_count > 0
        ? `ลบผู้ใช้ "${u.full_name}" ?\nตารางสอนของผู้ใช้นี้ ${u.schedule_count} รายการจะถูกลบด้วย`
        : `ลบผู้ใช้ "${u.full_name}" ?`;
    if (!confirm(msg)) return;
    run(() => deleteUserAction(u.id), () => form.id === u.id && setForm(emptyForm));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="card h-fit">
        <h2 className="mb-4 text-lg font-semibold">{form.id ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveUserAction(form), () => setForm(emptyForm));
          }}
          className="space-y-4"
        >
          <div>
            <label className="label" htmlFor="full_name">
              ชื่อ-นามสกุล *
            </label>
            <input
              id="full_name"
              className="input"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="username">
              ชื่อผู้ใช้ (ใช้ล็อกอิน) *
            </label>
            <input
              id="username"
              className="input"
              value={form.username}
              onChange={(e) => set("username", e.target.value)}
              autoCapitalize="none"
              placeholder="ภาษาอังกฤษ เช่น somchai"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              รหัสผ่าน {form.id ? "(เว้นว่าง = ไม่เปลี่ยน)" : "*"}
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required={!form.id}
            />
          </div>
          <div>
            <label className="label" htmlFor="role">
              สิทธิ์
            </label>
            <select
              id="role"
              className="input"
              value={form.role}
              onChange={(e) => set("role", e.target.value as Role)}
              disabled={form.id === meId}
            >
              <option value="teacher">ศาสตราจารย์</option>
              <option value="admin">แอดมิน</option>
            </select>
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1" disabled={isPending}>
              {isPending ? "กำลังบันทึก..." : form.id ? "บันทึกการแก้ไข" : "เพิ่มผู้ใช้"}
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
          ผู้ใช้ทั้งหมด <span className="text-sm font-normal text-slate-500">({users.length})</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3 font-medium">ชื่อ</th>
                <th className="py-2 pr-3 font-medium">ชื่อผู้ใช้</th>
                <th className="py-2 pr-3 font-medium">สิทธิ์</th>
                <th className="py-2 pr-3 font-medium">ตารางสอน</th>
                <th className="py-2 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-slate-100 ${form.id === u.id ? "bg-blue-50" : ""}`}>
                  <td className="py-2 pr-3 font-medium">
                    {u.full_name}
                    {u.id === meId && <span className="ml-1 text-xs text-slate-400">(คุณ)</span>}
                  </td>
                  <td className="py-2 pr-3">{u.username}</td>
                  <td className="py-2 pr-3">
                    {u.role === "admin" ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">แอดมิน</span>
                    ) : (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">อาจารย์</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">{u.schedule_count}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button
                      className="mr-3 text-blue-600 hover:underline disabled:opacity-50"
                      disabled={isPending}
                      onClick={() => {
                        setError(null);
                        setSuccess(null);
                        setForm({ id: u.id, username: u.username, full_name: u.full_name, role: u.role, password: "" });
                      }}
                    >
                      แก้ไข
                    </button>
                    {u.id !== meId && (
                      <button
                        className="text-red-600 hover:underline disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => handleDelete(u)}
                      >
                        ลบ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

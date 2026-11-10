"use client";

import { useActionState } from "react";
import { loginAction, setupAction } from "./actions";

export default function LoginForm({ needsSetup, next }: { needsSetup: boolean; next: string }) {
  const [state, formAction, pending] = useActionState(needsSetup ? setupAction : loginAction, undefined);

  return (
    <div className="card">
      <h1 className="mb-1 text-xl font-semibold">
        {needsSetup ? "ตั้งค่าผู้ดูแลระบบคนแรก" : "เข้าสู่ระบบ"}
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        {needsSetup
          ? "ยังไม่มีผู้ใช้ในระบบ บัญชีที่สร้างตอนนี้จะเป็นแอดมิน"
          : "สำหรับอาจารย์และผู้ดูแลระบบ"}
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        {needsSetup && (
          <div>
            <label className="label" htmlFor="full_name">
              ชื่อ-นามสกุล
            </label>
            <input id="full_name" name="full_name" className="input" placeholder="เช่น สมชาย ใจดี" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="username">
            ชื่อผู้ใช้
          </label>
          <input
            id="username"
            name="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            placeholder={needsSetup ? "ภาษาอังกฤษ เช่น admin" : ""}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            รหัสผ่าน
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete={needsSetup ? "new-password" : "current-password"}
            minLength={needsSetup ? 6 : undefined}
            required
          />
        </div>

        {state?.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "กำลังดำเนินการ..." : needsSetup ? "สร้างบัญชีแอดมิน" : "เข้าสู่ระบบ"}
        </button>
      </form>

      {!needsSetup && (
        <p className="mt-4 text-center text-xs text-slate-500">
          ยังไม่มีบัญชี? ติดต่อผู้ดูแลระบบเพื่อสร้างบัญชีอาจารย์
        </p>
      )}
    </div>
  );
}

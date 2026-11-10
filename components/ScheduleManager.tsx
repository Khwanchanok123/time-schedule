"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  checkConflictsAction,
  deleteScheduleAction,
  setRegistrationAction,
  saveScheduleAction,
  type ScheduleInput,
} from "@/app/dashboard/actions";
import type { Conflict } from "@/lib/conflicts";
import type { Room, ScheduleWithRelations, User } from "@/lib/types";
import TimeSelect24 from "@/components/TimeSelect24";
import DatePicker from "@/components/DatePicker";
import { SUBJECTS, isSubject } from "@/lib/subjects";
import { checkTimeEdit, lockedFields } from "@/lib/schedule-rules";

/** ค่าพิเศษใน dropdown ห้อง = ห้องนอกระบบ (ต้องตรงกับใน app/dashboard/actions.ts) */
const CUSTOM_ROOM = "__custom__";
import { formatRange, formatThaiDate, formatTime, isoToBangkokDate, todayBangkok } from "@/lib/time";

interface Props {
  currentUser: User;
  rooms: Room[];
  schedules: ScheduleWithRelations[];
  teachers: { id: string; full_name: string }[];
  /** มาจากการคลิกปฏิทิน (/dashboard?date=YYYY-MM-DD&time=HH:MM) — ใช้เป็นค่าเริ่มต้นของฟอร์มครั้งแรก */
  initialDate?: string;
  initialTime?: string;
}

const addMinutes = (hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = Math.min(h * 60 + m + mins, 23 * 60 + 55);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

type FormState = {
  id: string | null;
  teacherId: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string; // uuid ห้องในระบบ ("" = ไม่ได้เลือก)
  roomText: string; // ชื่อห้องนอกระบบ
  subject: string;
  topic: string;
  note: string;
  registrationOpen: boolean;
  seats: string;
};

export default function ScheduleManager({
  currentUser,
  rooms,
  schedules,
  teachers,
  initialDate,
  initialTime,
}: Props) {
  const isAdmin = currentUser.role === "admin";

  const emptyForm = (): FormState => ({
    id: null,
    teacherId: currentUser.id,
    // ค่าเริ่มต้น 09:00 วันนี้ — ถ้าเลย 09:00 แล้วให้เป็นพรุ่งนี้ (ไม่เริ่มที่เวลาที่ผ่านมาแล้ว)
    date:
      formatTime(new Date()) < "09:00"
        ? todayBangkok()
        : isoToBangkokDate(new Date(Date.now() + 24 * 3600 * 1000)),
    startTime: "09:00",
    endTime: "12:00",
    roomId: "",
    roomText: "",
    subject: "",
    topic: "",
    note: "",
    registrationOpen: true, // ค่าเริ่มต้น: เปิดให้ลงทะเบียนแล้ว
    seats: "",
  });

  // ฟอร์มเริ่มต้น: ถ้ามาจากการคลิกวันในปฏิทิน ใช้วัน (และเวลา) นั้น
  const [form, setForm] = useState<FormState>(() => {
    const f = emptyForm();
    if (!initialDate) return f;
    let start = initialTime;
    if (!start) {
      // คลิกทั้งวัน (มุมมองเดือน): วันนี้ → ชั่วโมงถัดไป, วันอื่น → 09:00
      start = "09:00";
      if (initialDate === todayBangkok()) {
        const [h] = formatTime(new Date()).split(":").map(Number);
        start = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:00`;
      }
    }
    return { ...f, date: initialDate, startTime: start, endTime: addMinutes(start, 60) };
  });
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showPast, setShowPast] = useState(false);
  const [teacherFilter, setTeacherFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(""); // ช่วงวันที่ของรายการ (YYYY-MM-DD, ว่าง = ไม่จำกัด)
  const [dateTo, setDateTo] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // นาฬิกาเดินทุก 30 วินาที เพื่อเช็กว่าเวลาที่เลือกผ่านไปแล้วหรือยัง
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // กฎเวลา (ตัวเดียวกับฝั่ง server — lib/schedule-rules.ts)
  const originalSchedule = form.id ? schedules.find((s) => s.id === form.id) : undefined;
  const original = originalSchedule
    ? {
        startMs: new Date(originalSchedule.start_time).getTime(),
        endMs: new Date(originalSchedule.end_time).getTime(),
      }
    : null;
  const toMs = (time: string) =>
    form.date && time ? new Date(`${form.date}T${time}:00+07:00`).getTime() : NaN;
  const locked = lockedFields(original, clock);

  const timeError =
    form.date && form.startTime && form.endTime
      ? checkTimeEdit({ original, startMs: toMs(form.startTime), endMs: toMs(form.endTime), now: clock })
      : null;

  // ---------- จำนวนที่นั่ง: ต้องเป็นจำนวนเต็ม ≥ 1 ----------
  const seatsNum = Number(form.seats);
  const seatsError = !form.seats
    ? "กรุณาใส่จำนวนที่นั่ง"
    : !Number.isInteger(seatsNum) || seatsNum < 1
      ? "จำนวนที่นั่งต้องเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป"
      : null;

  // ห้องนอกระบบ = เลือก "ห้องอื่น" แล้วพิมพ์ชื่อ
  const isCustomRoom = !form.roomId && !!form.roomText.trim();
  const roomChosen = !!form.roomId || isCustomRoom;
  /** ค่า roomId ที่ส่งให้ server: uuid หรือ CUSTOM_ROOM */
  const payloadRoomId = isCustomRoom ? CUSTOM_ROOM : form.roomId;

  // ---------- ชั้นที่ 1: เช็กการทับซ้อนทันทีเมื่อเลือกวัน/เวลา/ห้อง ----------
  useEffect(() => {
    if (!form.date || !form.startTime || !form.endTime || !roomChosen || timeError) {
      setConflicts([]);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      const input: ScheduleInput = {
        id: form.id,
        teacherId: form.teacherId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        roomId: payloadRoomId,
        roomText: form.roomText,
      };
      const result = await checkConflictsAction(input);
      if (!cancelled) {
        setConflicts(result);
        setChecking(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.id, form.teacherId, form.date, form.startTime, form.endTime, payloadRoomId, form.roomText, roomChosen, timeError]);

  // ห้องที่เลือกได้: ห้องเปิดใช้งาน + ห้องเดิมของรายการที่กำลังแก้ไข (แอดมินเห็นทุกห้อง)
  const editingRoomId = form.id ? schedules.find((s) => s.id === form.id)?.room_id : null;
  const selectableRooms = rooms.filter((r) => r.is_active || isAdmin || r.id === editingRoomId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (timeError) return setError(timeError);
    if (!roomChosen) return setError("กรุณาเลือกห้องเรียน หรือพิมพ์ชื่อห้องนอกระบบ");
    if (!form.subject) return setError("กรุณาเลือกวิชา");
    if (!form.topic.trim()) return setError("กรุณากรอกหัวข้อที่จะเรียน");
    if (seatsError) return setError(seatsError);
    if (conflicts.length > 0) return setError("ไม่สามารถบันทึกได้ เนื่องจากเวลาทับซ้อน");

    startTransition(async () => {
      const res = await saveScheduleAction({ ...form, roomId: payloadRoomId });
      if (res.ok) {
        setSuccess(res.message ?? "บันทึกเรียบร้อย");
        setForm((f) => ({ ...emptyForm(), teacherId: f.teacherId, date: f.date }));
        setConflicts([]);
      } else {
        setError(res.error);
      }
    });
  }

  function handleEdit(s: ScheduleWithRelations) {
    setError(null);
    setSuccess(null);
    setForm({
      id: s.id,
      teacherId: s.teacher_id,
      date: isoToBangkokDate(s.start_time),
      startTime: formatTime(s.start_time),
      endTime: formatTime(s.end_time),
      roomId: s.room_id ?? "",
      roomText: s.room_text ?? "",
      subject: s.subject ?? "",
      topic: s.topic ?? "",
      note: s.note ?? "",
      registrationOpen: s.registration_open,
      seats: s.seats?.toString() ?? "",
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleDelete(s: ScheduleWithRelations) {
    const label = `${formatThaiDate(s.start_time)} ${formatRange(s.start_time, s.end_time)}`;
    if (!confirm(`ยืนยันการลบตารางสอน\n${label}${s.subject ? ` (${s.subject})` : ""} ?`)) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await deleteScheduleAction(s.id);
      if (res.ok) {
        setSuccess(res.message ?? "ลบเรียบร้อย");
        if (form.id === s.id) setForm(emptyForm());
      } else {
        setError(res.error);
      }
    });
  }

  function handleToggleRegistration(s: ScheduleWithRelations) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await setRegistrationAction(s.id, !s.registration_open);
      if (res.ok) {
        setSuccess(res.message ?? "บันทึกเรียบร้อย");
        if (form.id === s.id) set("registrationOpen", !s.registration_open);
      } else {
        setError(res.error);
      }
    });
  }

  const now = Date.now();
  // เลือกช่วงวันที่แล้ว → แสดงทุกคาบในช่วงนั้น (รวมที่ผ่านไปแล้ว) / ไม่เลือก → ใช้ติ๊ก "แสดงที่ผ่านมาแล้ว"
  const hasRange = !!(dateFrom || dateTo);
  const inView = (s: ScheduleWithRelations) => {
    if (hasRange) {
      const day = isoToBangkokDate(s.start_time);
      return (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
    }
    return showPast || new Date(s.end_time).getTime() >= now;
  };
  const visibleSchedules = useMemo(() => {
    return schedules
      .filter(inView)
      .filter((s) => (teacherFilter ? s.teacher_id === teacherFilter : true))
      .sort((a, b) =>
        showPast && !hasRange
          ? b.start_time.localeCompare(a.start_time)
          : a.start_time.localeCompare(b.start_time)
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, showPast, teacherFilter, now, dateFrom, dateTo]);

  const canSubmit = !isPending && !checking && !timeError && conflicts.length === 0 && roomChosen && !!form.subject && !!form.topic.trim() && !seatsError;

  /** อาจารย์จัดการได้เฉพาะคาบของตัวเอง แอดมินจัดการได้ทุกคาบ */
  const canManage = (s: ScheduleWithRelations) => isAdmin || s.teacher_id === currentUser.id;
  const myCount = schedules.filter((s) => s.teacher_id === currentUser.id && inView(s)).length;

  // ปุ่มลัดช่วงวันที่
  const plusDays = (n: number) => isoToBangkokDate(new Date(Date.now() + n * 86400000));
  const setRange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  };

  return (
    <div className="space-y-6">
      {/* ---------------- ฟอร์มเพิ่ม/แก้ไข (เด่น อยู่บนสุด) ---------------- */}
      <section
        ref={formRef}
        className={`scroll-mt-4 overflow-hidden rounded-xl border-2 bg-white shadow-lg ${
          form.id ? "border-amber-400" : "border-blue-500"
        }`}
      >
        <div
          className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-white ${
            form.id ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-blue-600 to-indigo-600"
          }`}
        >
          <h2 className="text-lg font-semibold">{form.id ? "✏️ แก้ไขตารางสอน" : "➕ เพิ่มตารางสอน"}</h2>
          <span className="text-xs opacity-90">
            {isAdmin ? "แอดมิน: ลงตารางให้อาจารย์คนใดก็ได้" : `ลงในนามของ อ.${currentUser.full_name}`}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2 xl:grid-cols-3">
          {locked.phase && locked.phase !== "upcoming" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 md:col-span-2 xl:col-span-3">
              {locked.phase === "past"
                ? "🔒 คาบนี้สอนจบไปแล้ว — เปลี่ยนวัน/เวลาไม่ได้ แก้ได้เฉพาะรายละเอียดอื่น (ห้อง, วิชา, หัวข้อ, ที่นั่ง, หมายเหตุ)"
                : "🔒 คาบนี้กำลังสอนอยู่ — เปลี่ยนวัน/เวลาเริ่มไม่ได้ ปรับได้เฉพาะเวลาสิ้นสุด (ขยายหรือเลิกเร็วขึ้น)"}
            </div>
          )}
          {isAdmin && (
            <div>
              <label className="label" htmlFor="teacher">
                อาจารย์
              </label>
              <select
                id="teacher"
                className="input"
                value={form.teacherId}
                onChange={(e) => set("teacherId", e.target.value)}
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name || "(ไม่มีชื่อ)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="date">
              วันที่ <span className="text-red-600">*</span>
            </label>
            <DatePicker
              id="date"
              value={form.date}
              onChange={(v) => set("date", v)}
              disabled={locked.date}
              min={original ? undefined : todayBangkok()}
            />
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="start">
                  เวลาเริ่ม
                </label>
                <TimeSelect24
                  id="start"
                  value={form.startTime}
                  onChange={(v) => set("startTime", v)}
                  disabled={locked.start}
                />
              </div>
              <div>
                <label className="label" htmlFor="end">
                  เวลาสิ้นสุด
                </label>
                <TimeSelect24
                  id="end"
                  value={form.endTime}
                  onChange={(v) => set("endTime", v)}
                  disabled={locked.end}
                />
              </div>
            </div>
            {timeError && <p className="mt-1 text-sm text-red-600">{timeError}</p>}
          </div>

          <div>
            <label className="label" htmlFor="room">
              ห้องเรียน <span className="text-red-600">*</span>
            </label>
            <select
              id="room"
              className={`input ${isCustomRoom ? "text-slate-400" : ""}`}
              value={form.roomId}
              // เลือกห้องในระบบ → ล้างช่องห้องนอกระบบ
              onChange={(e) =>
                setForm((f) => ({ ...f, roomId: e.target.value, roomText: e.target.value ? "" : f.roomText }))
              }
            >
              <option value="">{isCustomRoom ? "— ใช้ห้องนอกระบบ —" : "— เลือกห้องในระบบ —"}</option>
              {selectableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.building ? ` (${r.building})` : ""}
                  {!r.is_active ? " [ปิดใช้งาน]" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="roomText">
              หรือ ห้องนอกระบบ <span className="font-normal text-slate-500">(พิมพ์ชื่อเอง)</span>
            </label>
            <input
              id="roomText"
              className="input"
              value={form.roomText}
              // พิมพ์ห้องนอกระบบ → ล้างห้องที่เลือกจาก dropdown
              onChange={(e) =>
                setForm((f) => ({ ...f, roomText: e.target.value, roomId: e.target.value.trim() ? "" : f.roomId }))
              }
              placeholder="เช่น สนามควิดดิช, หอดูดาว"
              maxLength={100}
            />
          </div>

          <div>
            <label className="label" htmlFor="seats">
              จำนวนที่นั่ง (จำกัดคนลงทะเบียน) <span className="text-red-600">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="seats"
                type="number"
                inputMode="numeric"
                min={1}
                className="input"
                value={form.seats}
                onChange={(e) => set("seats", e.target.value)}
                required
              />
              <span className="shrink-0 text-sm text-slate-500">ที่นั่ง</span>
            </div>
            {seatsError && form.seats && <p className="mt-1 text-sm text-red-600">{seatsError}</p>}
          </div>

          <div>
            <label className="label" htmlFor="subject">
              วิชา <span className="text-red-600">*</span>
            </label>
            <select
              id="subject"
              className="input"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              required
            >
              <option value="">— เลือกวิชา —</option>
              {SUBJECTS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {/* รายการเก่าที่วิชาไม่อยู่ในรายการ ยังแสดงค่าเดิมได้ */}
              {form.subject && !isSubject(form.subject) && (
                <option value={form.subject}>{form.subject} (เดิม)</option>
              )}
            </select>
          </div>

          <div className="md:col-span-2 xl:col-span-2">
            <label className="label" htmlFor="topic">
              หัวข้อที่จะเรียน <span className="text-red-600">*</span>
            </label>
            <input
              id="topic"
              className="input"
              value={form.topic}
              onChange={(e) => set("topic", e.target.value)}
              placeholder="เช่น บทที่ 3 การบินขั้นพื้นฐาน"
              maxLength={300}
              required
            />
          </div>

          {/* สถานะการลงทะเบียน */}
          <div
            className={`flex flex-col justify-center rounded-md border p-3 ${
              form.registrationOpen ? "border-green-300 bg-green-50" : "border-slate-200 bg-slate-50"
            }`}
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.registrationOpen}
                onChange={(e) => set("registrationOpen", e.target.checked)}
              />
              เปิดให้ลงทะเบียนแล้ว
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {form.registrationOpen
                ? "ปฏิทินจะติดแท็ก \"เปิดลงทะเบียนแล้ว\" ให้นักเรียนเห็น"
                : "ยังไม่เปิด — ติ๊กเมื่อพร้อมให้นักเรียนลงทะเบียน"}
            </p>
          </div>

          <div className="md:col-span-2 xl:col-span-3">
            <label className="label" htmlFor="note">
              หมายเหตุ
            </label>
            <textarea
              id="note"
              className="input min-h-[60px]"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              maxLength={1000}
            />
          </div>

          {/* สถานะ + ปุ่ม */}
          <div className="space-y-3 md:col-span-2 xl:col-span-3">
            {checking && <p className="text-sm text-slate-500">กำลังตรวจสอบเวลาว่าง...</p>}
            {!checking && conflicts.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="mb-1 font-medium">⚠️ เวลาทับซ้อน</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {conflicts.map((c) => (
                    <li key={c.scheduleId + c.kind}>{c.message}</li>
                  ))}
                </ul>
              </div>
            )}
            {!checking && conflicts.length === 0 && roomChosen && !timeError && (
              <p className="text-sm text-green-700">✓ ห้องและเวลานี้ว่าง</p>
            )}
            {error && (
              <p className="whitespace-pre-line rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            {success && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              {form.id && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setForm(emptyForm());
                    setError(null);
                  }}
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
              <button type="submit" className="btn-primary min-w-[200px] py-2.5 text-base" disabled={!canSubmit}>
                {isPending ? "กำลังบันทึก..." : form.id ? "บันทึกการแก้ไข" : "➕ เพิ่มตารางสอน"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* ---------------- รายการตารางสอน (เห็นของทุกคน) ---------------- */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            รายการตารางสอน{" "}
            <span className="text-sm font-normal text-slate-500">({visibleSchedules.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {/* ปุ่มลัด: ทุกคน / เฉพาะของฉัน */}
            <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <button
                type="button"
                className={`px-3 py-1.5 ${teacherFilter === "" ? "bg-blue-600 text-white" : "bg-white hover:bg-slate-50"}`}
                onClick={() => setTeacherFilter("")}
              >
                ทุกคน
              </button>
              <button
                type="button"
                className={`border-l border-slate-300 px-3 py-1.5 ${
                  teacherFilter === currentUser.id ? "bg-blue-600 text-white" : "bg-white hover:bg-slate-50"
                }`}
                onClick={() => setTeacherFilter(currentUser.id)}
              >
                เฉพาะของฉัน ({myCount})
              </button>
            </div>
            <select
              className="input w-auto py-1.5"
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              aria-label="กรองตามอาจารย์"
            >
              <option value="">อาจารย์ทุกคน</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                  {t.id === currentUser.id ? " (ฉัน)" : ""}
                </option>
              ))}
            </select>
            <label className={`flex items-center gap-1.5 ${hasRange ? "text-slate-400" : ""}`}>
              <input
                type="checkbox"
                checked={showPast}
                disabled={hasRange}
                onChange={(e) => setShowPast(e.target.checked)}
              />
              แสดงรายการที่ผ่านมาแล้ว
            </label>
          </div>
        </div>

        {/* ช่วงวันที่ */}
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3 text-sm">
          <div className="w-44">
            <label className="label" htmlFor="list-from">
              ตั้งแต่วันที่
            </label>
            <DatePicker id="list-from" value={dateFrom} onChange={setDateFrom} allowEmpty />
          </div>
          <div className="w-44">
            <label className="label" htmlFor="list-to">
              ถึงวันที่
            </label>
            <DatePicker id="list-to" value={dateTo} onChange={setDateTo} allowEmpty min={dateFrom || undefined} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary py-1.5" onClick={() => setRange(todayBangkok(), todayBangkok())}>
              วันนี้
            </button>
            <button type="button" className="btn-secondary py-1.5" onClick={() => setRange(todayBangkok(), plusDays(6))}>
              7 วันข้างหน้า
            </button>
            <button type="button" className="btn-secondary py-1.5" onClick={() => setRange(plusDays(-7), plusDays(-1))}>
              7 วันที่ผ่านมา
            </button>
            {hasRange && (
              <button type="button" className="btn-secondary py-1.5" onClick={() => setRange("", "")}>
                ล้างช่วงวันที่
              </button>
            )}
          </div>
          {dateFrom && dateTo && dateTo < dateFrom && (
            <p className="w-full text-amber-700">วันที่สิ้นสุดอยู่ก่อนวันที่เริ่ม — ไม่มีรายการในช่วงนี้</p>
          )}
        </div>

        {visibleSchedules.length === 0 ? (
          <p className="py-10 text-center text-slate-500">
            {hasRange ? "ไม่มีตารางสอนในช่วงวันที่ที่เลือก" : "ยังไม่มีตารางสอน"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-medium">วันที่</th>
                  <th className="py-2 pr-3 font-medium">เวลา</th>
                  <th className="py-2 pr-3 font-medium">อาจารย์</th>
                  <th className="py-2 pr-3 font-medium">ห้อง</th>
                  <th className="py-2 pr-3 font-medium">วิชา / หัวข้อ</th>
                  <th className="py-2 pr-3 font-medium">ลงทะเบียน</th>
                  <th className="py-2 text-right font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {visibleSchedules.map((s) => {
                  const past = new Date(s.end_time).getTime() < now;
                  const mine = s.teacher_id === currentUser.id;
                  const manage = canManage(s);
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-slate-100 ${past ? "text-slate-400" : ""} ${
                        form.id === s.id ? "bg-amber-50" : mine ? "bg-blue-50/40" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">{formatThaiDate(s.start_time)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatRange(s.start_time, s.end_time)}</td>
                      <td className="py-2 pr-3">
                        {s.teacher?.full_name ?? "-"}
                        {mine && (
                          <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">ฉัน</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {s.room ? (
                          <>
                            {s.room.name}
                            {s.room.custom && <div className="text-xs text-slate-400">(นอกระบบ)</div>}
                          </>
                        ) : (
                          <em>ห้องถูกลบ</em>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <div>{s.subject || "-"}</div>
                        {s.topic && <div className="text-xs text-slate-600">หัวข้อ: {s.topic}</div>}
                        {s.note && <div className="text-xs text-slate-500">{s.note}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        {manage ? (
                          <button
                            type="button"
                            className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium transition disabled:opacity-50 ${
                              s.registration_open
                                ? "bg-green-100 text-green-800 hover:bg-green-200"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                            onClick={() => handleToggleRegistration(s)}
                            disabled={isPending}
                            title="คลิกเพื่อสลับสถานะ"
                          >
                            {s.registration_open ? "✓ เปิดแล้ว" : "ยังไม่เปิด"}
                          </button>
                        ) : (
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              s.registration_open ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {s.registration_open ? "✓ เปิดแล้ว" : "ยังไม่เปิด"}
                          </span>
                        )}
                        <div className="mt-1 text-xs text-slate-500">
                          {s.seats ? `${s.seats} ที่นั่ง` : "ยังไม่ระบุที่นั่ง"}
                        </div>
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {manage ? (
                          <>
                            <button
                              className="mr-2 text-blue-600 hover:underline disabled:opacity-50"
                              onClick={() => handleEdit(s)}
                              disabled={isPending}
                            >
                              แก้ไข
                            </button>
                            <button
                              className="text-red-600 hover:underline disabled:opacity-50"
                              onClick={() => handleDelete(s)}
                              disabled={isPending}
                            >
                              ลบ
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">ดูอย่างเดียว</span>
                        )}
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

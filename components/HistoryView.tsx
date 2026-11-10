"use client";

import { useEffect, useMemo, useState } from "react";
import type { Room, ScheduleWithRelations } from "@/lib/types";
import { SUBJECTS } from "@/lib/subjects";
import DatePicker from "@/components/DatePicker";
import { formatRange, formatThaiDate, isoToBangkokDate } from "@/lib/time";

type Status = "past" | "ongoing" | "upcoming";
type Tab = "all" | Status;

const STATUS: Record<Status, { label: string; badge: string; dot: string }> = {
  past: { label: "ผ่านมาแล้ว", badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  ongoing: { label: "กำลังสอนอยู่", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  upcoming: { label: "กำลังจะถึง", badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
};

function statusOf(s: ScheduleWithRelations, now: number): Status {
  const start = new Date(s.start_time).getTime();
  const end = new Date(s.end_time).getTime();
  if (end <= now) return "past";
  if (start <= now) return "ongoing";
  return "upcoming";
}

interface Props {
  schedules: ScheduleWithRelations[];
  teachers: { id: string; full_name: string }[];
  rooms: Room[];
  currentUserId: string;
}

export default function HistoryView({ schedules, teachers, rooms, currentUserId }: Props) {
  // อัปเดตเวลาปัจจุบันทุก 1 นาที ให้สถานะเปลี่ยนเองโดยไม่ต้องรีเฟรช
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [tab, setTab] = useState<Tab>("all");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState(""); // id ห้องในระบบ หรือ "text:<ชื่อ>" สำหรับห้องนอกระบบ
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  // ห้องนอกระบบที่เคยใช้ (ไว้ให้กรองได้ด้วย)
  const customRooms = useMemo(
    () =>
      Array.from(new Set(schedules.filter((s) => s.room?.custom).map((s) => s.room!.name))).sort((a, b) =>
        a.localeCompare(b, "th")
      ),
    [schedules]
  );

  // กรองทุกอย่างยกเว้นสถานะ (ใช้นับจำนวนในแต่ละแท็บ)
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return schedules.filter((s) => {
      if (teacher && s.teacher_id !== teacher) return false;
      if (room) {
        if (room.startsWith("text:")) {
          if (!s.room?.custom || s.room.name !== room.slice(5)) return false;
        } else if (s.room_id !== room) return false;
      }
      if (subject && s.subject !== subject) return false;
      const day = isoToBangkokDate(s.start_time);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (query) {
        const hay = [s.teacher?.full_name, s.room?.name, s.subject, s.topic, s.note]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [schedules, teacher, room, subject, from, to, q]);

  const counts = useMemo(() => {
    const c = { all: filtered.length, past: 0, ongoing: 0, upcoming: 0 };
    for (const s of filtered) c[statusOf(s, now)]++;
    return c;
  }, [filtered, now]);

  // เรียง: กำลังสอน → กำลังจะถึง (ใกล้สุดก่อน) → ผ่านมาแล้ว (ล่าสุดก่อน)
  const rows = useMemo(() => {
    const order: Record<Status, number> = { ongoing: 0, upcoming: 1, past: 2 };
    return filtered
      .map((s) => ({ s, status: statusOf(s, now) }))
      .filter((r) => tab === "all" || r.status === tab)
      .sort((a, b) => {
        if (a.status !== b.status) return order[a.status] - order[b.status];
        return a.status === "past"
          ? b.s.start_time.localeCompare(a.s.start_time)
          : a.s.start_time.localeCompare(b.s.start_time);
      });
  }, [filtered, tab, now]);

  const hasFilter = teacher || room || subject || from || to || q;

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "ทั้งหมด" },
    { key: "ongoing", label: STATUS.ongoing.label },
    { key: "upcoming", label: STATUS.upcoming.label },
    { key: "past", label: STATUS.past.label },
  ];

  return (
    <div className="space-y-4">
      {/* สรุปจำนวน */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg border p-4 text-left transition ${
              tab === t.key ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              {t.key !== "all" && <span className={`h-2 w-2 rounded-full ${STATUS[t.key].dot}`} />}
              {t.label}
            </div>
            <div className="mt-1 text-2xl font-semibold">{counts[t.key]}</div>
          </button>
        ))}
      </div>

      {/* ตัวกรอง */}
      <div className="card flex flex-wrap items-end gap-3 py-4 sm:py-4">
        <div className="min-w-[200px] flex-[2]">
          <label className="label" htmlFor="h-q">
            ค้นหา
          </label>
          <input
            id="h-q"
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่ออาจารย์, ห้อง, วิชา, หัวข้อ…"
          />
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="label" htmlFor="h-teacher">
            อาจารย์
          </label>
          <select id="h-teacher" className="input" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="">ทุกคน</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
                {t.id === currentUserId ? " (ฉัน)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="label" htmlFor="h-room">
            ห้อง
          </label>
          <select id="h-room" className="input" value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">ทุกห้อง</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            {customRooms.length > 0 && (
              <optgroup label="ห้องนอกระบบ">
                {customRooms.map((name) => (
                  <option key={name} value={`text:${name}`}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label" htmlFor="h-subject">
            วิชา
          </label>
          <select id="h-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">ทุกวิชา</option>
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="h-from">
            ตั้งแต่วันที่
          </label>
          <DatePicker id="h-from" value={from} onChange={setFrom} allowEmpty />
        </div>
        <div>
          <label className="label" htmlFor="h-to">
            ถึงวันที่
          </label>
          <DatePicker id="h-to" value={to} onChange={setTo} allowEmpty />
        </div>
        {hasFilter && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setTeacher("");
              setRoom("");
              setSubject("");
              setFrom("");
              setTo("");
              setQ("");
            }}
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* ตาราง */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">
          {tabs.find((t) => t.key === tab)?.label}{" "}
          <span className="text-sm font-normal text-slate-500">({rows.length} รายการ)</span>
        </h2>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-slate-500">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3 font-medium">สถานะ</th>
                  <th className="py-2 pr-3 font-medium">วันที่</th>
                  <th className="py-2 pr-3 font-medium">เวลา</th>
                  <th className="py-2 pr-3 font-medium">อาจารย์</th>
                  <th className="py-2 pr-3 font-medium">ห้อง</th>
                  <th className="py-2 pr-3 font-medium">วิชา / หัวข้อ</th>
                  <th className="py-2 pr-3 font-medium">ที่นั่ง</th>
                  <th className="py-2 font-medium">ลงทะเบียน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, status }) => (
                  <tr
                    key={s.id}
                    className={`border-b border-slate-100 align-top ${status === "past" ? "text-slate-500" : ""} ${
                      status === "ongoing" ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <td className="py-2 pr-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[status].badge}`}
                      >
                        {STATUS[status].label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatThaiDate(s.start_time)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatRange(s.start_time, s.end_time)}</td>
                    <td className="py-2 pr-3">
                      {s.teacher?.full_name ?? "-"}
                      {s.teacher_id === currentUserId && (
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
                        <em className="text-slate-400">ห้องถูกลบ</em>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div>{s.subject || "-"}</div>
                      {s.topic && <div className="text-xs text-slate-600">หัวข้อ: {s.topic}</div>}
                      {s.note && <div className="text-xs text-slate-500">{s.note}</div>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{s.seats ?? "-"}</td>
                    <td className="py-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.registration_open ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {s.registration_open ? "✓ เปิดแล้ว" : "ยังไม่เปิด"}
                      </span>
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

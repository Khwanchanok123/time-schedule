"use client";

import { useCallback, useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import luxonPlugin from "@fullcalendar/luxon3";
import interactionPlugin, { type DateClickArg } from "@fullcalendar/interaction";
import { useRouter } from "next/navigation";
import thLocale from "@fullcalendar/core/locales/th";
import type { EventContentArg, EventInput, EventSourceFuncArg } from "@fullcalendar/core";
import { colorFor, colorForSubject } from "@/lib/colors";
import { SUBJECTS } from "@/lib/subjects";
import { TIMEZONE, formatRange, formatThaiDate, formatTime, todayBangkok } from "@/lib/time";
import type { Room, ScheduleWithRelations } from "@/lib/types";

interface Props {
  rooms: Room[];
  teachers: { id: string; full_name: string }[];
  /** ล็อกอินแล้ว: คลิกวัน/ช่องเวลาในปฏิทิน → ไปหน้าเพิ่มคาบสอนพร้อมวันที่นั้น */
  canAdd?: boolean;
}

type ColorBy = "subject" | "room" | "teacher";

interface EventProps {
  teacherName: string;
  roomName: string;
  building: string | null;
  subject: string | null;
  topic: string | null;
  note: string | null;
  registrationOpen: boolean;
  seats: number | null;
  timeLabel: string;
  dateLabel: string;
}

export default function PublicCalendar({ rooms, teachers, canAdd = false }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // คลิกวัน (มุมมองเดือน) หรือช่องเวลา (มุมมองสัปดาห์/วัน) → ไปหน้าเพิ่มคาบสอน
  // dateStr: "YYYY-MM-DD" หรือ "YYYY-MM-DDTHH:MM:SS+07:00" (เป็นเวลาไทยเพราะตั้ง timeZone ไว้)
  const onDateClick = (arg: DateClickArg) => {
    if (!canAdd) return;
    const date = arg.dateStr.slice(0, 10);
    const time = arg.allDay ? null : arg.dateStr.slice(11, 16);
    const today = todayBangkok();
    if (date < today || (date === today && time && time < formatTime(new Date()))) {
      setNotice("เลือกวันเวลาที่ผ่านมาแล้วไม่ได้ — คลิกวันนี้หรือวันข้างหน้า");
      return;
    }
    setNotice(null);
    router.push(`/dashboard?date=${date}${time ? `&time=${time}` : ""}`);
  };
  // ช่องวันที่ยังไม่ผ่าน: ขึ้นเมาส์เป็นรูปมือ + ไฮไลต์ตอนชี้ (arg.date เป็นวันที่ไทยแบบ UTC-coerced)
  const dayCellClassNames = (arg: { date: Date }) =>
    canAdd && arg.date.toISOString().slice(0, 10) >= todayBangkok() ? ["cursor-pointer", "hover:bg-blue-50"] : [];
  const [roomFilter, setRoomFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [colorBy, setColorBy] = useState<ColorBy>("subject");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventProps | null>(null);

  useEffect(() => setMounted(true), []);

  // ดึงข้อมูลเฉพาะช่วงวันที่ที่กำลังแสดงอยู่ (รายการที่ทับช่วงนั้น)
  const fetchEvents = useCallback(
    async (info: EventSourceFuncArg): Promise<EventInput[]> => {
      const params = new URLSearchParams({
        start: info.start.toISOString(),
        end: info.end.toISOString(),
      });
      if (roomFilter) params.set("room", roomFilter);
      if (teacherFilter) params.set("teacher", teacherFilter);

      let data: ScheduleWithRelations[];
      try {
        const res = await fetch(`/api/schedules?${params}`, { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
        data = await res.json();
      } catch (e) {
        setLoadError((e as Error).message);
        return [];
      }
      setLoadError(null);

      return data.map((s) => {
        const color =
          colorBy === "subject"
            ? colorForSubject(s.subject)
            : colorFor(colorBy === "room" ? (s.room_id ?? s.room_text?.toLowerCase()) : s.teacher_id);
        const extendedProps: EventProps = {
          teacherName: s.teacher?.full_name ?? "ไม่ทราบชื่อ",
          roomName: s.room?.name ?? "-",
          building: s.room?.building ?? null,
          subject: s.subject,
          topic: s.topic,
          note: s.note,
          registrationOpen: s.registration_open,
          seats: s.seats,
          timeLabel: formatRange(s.start_time, s.end_time),
          dateLabel: formatThaiDate(s.start_time),
        };
        return {
          id: s.id,
          title: `ศจ.${extendedProps.teacherName} · ${extendedProps.roomName}`,
          start: s.start_time,
          end: s.end_time,
          backgroundColor: color,
          borderColor: color,
          textColor: "#ffffff",
          extendedProps,
        };
      });
    },
    [roomFilter, teacherFilter, colorBy]
  );

  const legend: { id: string; label: string; color: string }[] =
    colorBy === "subject"
      ? SUBJECTS.map((s) => ({ id: s, label: s, color: colorForSubject(s) }))
      : colorBy === "room"
        ? rooms
            .filter((r) => !roomFilter || r.id === roomFilter)
            .map((r) => ({ id: r.id, label: r.name, color: colorFor(r.id) }))
        : teachers
            .filter((t) => !teacherFilter || t.id === teacherFilter)
            .map((t) => ({ id: t.id, label: t.full_name, color: colorFor(t.id) }));

  return (
    <div className="card space-y-3 p-2 sm:p-4">
      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="label" htmlFor="f-room">ห้องเรียน</label>
          <select id="f-room" className="input" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
            <option value="">ทุกห้อง</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.building ? ` (${r.building})` : ""}
                {!r.is_active ? " [ปิดใช้งาน]" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="label" htmlFor="f-teacher">ศาสตราจารย์</label>
          <select
            id="f-teacher"
            className="input"
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
          >
            <option value="">ศาสตราจารย์ทุกคน</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="label" htmlFor="f-color">แยกสีตาม</label>
          <select
            id="f-color"
            className="input"
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as ColorBy)}
          >
            <option value="subject">รายวิชา</option>
            <option value="room">ห้องเรียน</option>
            <option value="teacher">ศาสตราจารย์</option>
          </select>
        </div>
        {(roomFilter || teacherFilter) && (
          <button
            className="btn-secondary"
            onClick={() => {
              setRoomFilter("");
              setTeacherFilter("");
            }}
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {legend.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {canAdd && (
        <p className="text-sm text-blue-700">
          💡 คลิกวันที่ (หรือช่องเวลาในมุมมองสัปดาห์/วัน) เพื่อเพิ่มคาบสอนในวันนั้น
        </p>
      )}
      {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {loadError}
        </p>
      )}

      <div>
        {mounted ? (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, luxonPlugin, interactionPlugin]}
            dateClick={onDateClick}
            dayCellClassNames={dayCellClassNames}
            locale={thLocale}
            timeZone={TIMEZONE}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            buttonText={{ today: "วันนี้", month: "เดือน", week: "สัปดาห์", day: "วัน", list: "รายการ" }}
            events={fetchEvents}
            eventContent={renderEvent}
            eventClick={(arg) => setSelected(arg.event.extendedProps as EventProps)}
            eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={false}
            nowIndicator
            dayMaxEvents={4}
            height="auto"
          />
        ) : (
          <div className="py-24 text-center text-slate-400">กำลังโหลดปฏิทิน...</div>
        )}
      </div>

      {/* รายละเอียดเมื่อคลิก */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div className="card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold">{selected.subject || "ตารางสอน"}</h3>
            <dl className="space-y-1.5 text-sm">
              {selected.topic && <Row label="หัวข้อ" value={selected.topic} />}
              <Row label="ศาสตราจารย์" value={`ศจ.${selected.teacherName}`} />
              <Row label="วันที่" value={selected.dateLabel} />
              <Row label="เวลา" value={`${selected.timeLabel} น.`} />
              <Row
                label="ห้อง"
                value={`${selected.roomName}${selected.building ? ` (${selected.building})` : ""}`}
              />
              {selected.seats != null && (
                <Row label="ที่นั่ง" value={`รับ ${selected.seats} คน (จำกัดจำนวนผู้ลงทะเบียน)`} />
              )}
              {selected.note && <Row label="หมายเหตุ" value={selected.note} />}
            </dl>
            <div
              className={`mt-4 rounded-md border p-3 text-sm ${
                selected.registrationOpen
                  ? "border-green-300 bg-green-50 text-green-900"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              <p className="font-semibold">
                {selected.registrationOpen ? "✓ เปิดให้ลงทะเบียนแล้ว" : "⏳ ยังไม่เปิดลงทะเบียน"}
              </p>
              {selected.registrationOpen && selected.seats != null && (
                <p className="mt-0.5">รับจำนวนจำกัด {selected.seats} ที่นั่ง</p>
              )}
            </div>
            <button className="btn-secondary mt-4 w-full" onClick={() => setSelected(null)}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-slate-500">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </div>
  );
}

function renderEvent(arg: EventContentArg) {
  const p = arg.event.extendedProps as EventProps;
  const view = arg.view.type;

  const tooltip = [
    `${p.timeLabel} น.`,
    `ศจ.${p.teacherName}`,
    `ห้อง ${p.roomName}`,
    p.subject,
    p.topic && `หัวข้อ: ${p.topic}`,
    p.seats != null && `${p.seats} ที่นั่ง`,
    p.registrationOpen ? "เปิดให้ลงทะเบียนแล้ว" : "ยังไม่เปิดลงทะเบียน",
  ]
    .filter(Boolean)
    .join(" | ");

  if (view === "dayGridMonth") {
    return (
      <div
        className="w-full cursor-pointer overflow-hidden rounded px-1 py-0.5 text-[11px] leading-tight text-white"
        style={{ backgroundColor: arg.event.backgroundColor }}
        title={tooltip}
      >
        <div className="truncate">
          <b>{p.timeLabel}</b> ศจ.{p.teacherName} · {p.roomName}
          {p.subject ? ` · ${p.subject}` : ""}
        </div>
        <Tags p={p} />
      </div>
    );
  }

  if (view.startsWith("list")) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>
          <b>ศจ.{p.teacherName}</b> — ห้อง {p.roomName}
          {p.subject ? ` — ${p.subject}` : ""}
          {p.topic ? ` (${p.topic})` : ""}
        </span>
        <Tags p={p} light />
      </span>
    );
  }

  // timeGridWeek / timeGridDay
  return (
    <div className="cursor-pointer p-0.5 text-[11px] leading-snug" title={tooltip}>
      <div className="font-semibold">{p.timeLabel}</div>
      <div>ศจ.{p.teacherName}</div>
      <div>ห้อง {p.roomName}</div>
      {p.subject && <div className="italic opacity-90">{p.subject}</div>}
      {p.topic && <div className="opacity-90">หัวข้อ: {p.topic}</div>}
      <Tags p={p} />
    </div>
  );
}

/** แท็ก "เปิดลงทะเบียนแล้ว" + จำนวนที่นั่ง (light = พื้นขาว เช่นในมุมมองรายการ) */
function Tags({ p, light = false }: { p: EventProps; light?: boolean }) {
  if (!p.registrationOpen && p.seats == null) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {p.registrationOpen && (
        <span
          className={`whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ${
            light ? "bg-green-100 text-green-800" : "bg-white text-green-700"
          }`}
        >
          ✓ เปิดลงทะเบียนแล้ว
        </span>
      )}
      {p.seats != null && (
        <span
          className={`whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-medium ${
            light ? "bg-slate-100 text-slate-700" : "bg-black/25 text-white"
          }`}
        >
          {p.seats} ที่นั่ง
        </span>
      )}
    </div>
  );
}

/**
 * ไล่ทุกกรณีของกฎเวลาตอนเพิ่ม/แก้ไขตารางสอน (lib/schedule-rules.ts)
 * รัน: npm test
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkTimeEdit, lockedFields, phaseOf } from "@/lib/schedule-rules";

// "ตอนนี้" = 10 พ.ย. 2030 เวลา 10:00 น. (ไทย)
const at = (hhmm: string, day = "2030-11-10") => new Date(`${day}T${hhmm}:00+07:00`).getTime();
const NOW = at("10:00");
const ok = (r: string | null) => assert.equal(r, null);
const err = (r: string | null, re: RegExp) => {
  assert.ok(r, "ควรถูกปฏิเสธ");
  assert.match(r!, re);
};

describe("สถานะของคาบ", () => {
  test("ยังไม่เริ่ม / กำลังสอน / จบแล้ว (ขอบเวลา)", () => {
    assert.equal(phaseOf(at("11:00"), at("12:00"), NOW), "upcoming");
    assert.equal(phaseOf(at("10:00"), at("12:00"), NOW), "ongoing"); // เริ่มพอดีตอนนี้ = กำลังสอน
    assert.equal(phaseOf(at("09:00"), at("11:00"), NOW), "ongoing");
    assert.equal(phaseOf(at("08:00"), at("10:00"), NOW), "past"); // จบพอดีตอนนี้ = จบแล้ว
  });
});

describe("เพิ่มคาบใหม่", () => {
  test("เวลาในอนาคต → ได้", () => ok(checkTimeEdit({ startMs: at("11:00"), endMs: at("12:00"), now: NOW })));
  test("เริ่มตอนนี้พอดี → ได้", () => ok(checkTimeEdit({ startMs: at("10:00"), endMs: at("11:00"), now: NOW })));
  test("เวลาเริ่มผ่านมาแล้ว (แม้ยังไม่จบ) → ไม่ได้", () =>
    err(checkTimeEdit({ startMs: at("09:55"), endMs: at("12:00"), now: NOW }), /ผ่านมาแล้ว/));
  test("วันที่ผ่านมาแล้ว → ไม่ได้", () =>
    err(checkTimeEdit({ startMs: at("09:00", "2030-11-09"), endMs: at("10:00", "2030-11-09"), now: NOW }), /ผ่านมาแล้ว/));
  test("เวลาสิ้นสุด ≤ เวลาเริ่ม → ไม่ได้", () => {
    err(checkTimeEdit({ startMs: at("11:00"), endMs: at("11:00"), now: NOW }), /มากกว่าเวลาเริ่ม/);
    err(checkTimeEdit({ startMs: at("12:00"), endMs: at("11:00"), now: NOW }), /มากกว่าเวลาเริ่ม/);
  });
});

describe("แก้ไขคาบที่ยังไม่เริ่ม (13:00–15:00)", () => {
  const original = { startMs: at("13:00"), endMs: at("15:00") };
  test("ไม่เปลี่ยนเวลา (แก้รายละเอียดอื่น) → ได้", () =>
    ok(checkTimeEdit({ original, ...original, now: NOW })));
  test("เลื่อนไปเวลาอื่นในอนาคต → ได้", () =>
    ok(checkTimeEdit({ original, startMs: at("14:00"), endMs: at("16:00"), now: NOW })));
  test("เลื่อนไปวันอื่นในอนาคต → ได้", () =>
    ok(checkTimeEdit({ original, startMs: at("09:00", "2030-11-12"), endMs: at("10:00", "2030-11-12"), now: NOW })));
  test("เลื่อนมาเวลาที่ผ่านมาแล้ว → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: at("08:00"), endMs: at("09:00"), now: NOW }), /ผ่านมาแล้ว/));
  test("เลื่อนเวลาเริ่มมาก่อนตอนนี้ (ให้กลายเป็นกำลังสอน) → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: at("09:30"), endMs: at("15:00"), now: NOW }), /ผ่านมาแล้ว/));
  test("เปลี่ยนแค่เวลาสิ้นสุด → ได้", () =>
    ok(checkTimeEdit({ original, startMs: original.startMs, endMs: at("16:00"), now: NOW })));
  test("เวลาสิ้นสุด ≤ เวลาเริ่ม → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: original.startMs, endMs: at("13:00"), now: NOW }), /มากกว่าเวลาเริ่ม/));
  test("คาบเริ่มไปแล้วระหว่างเปิดฟอร์มค้างไว้ แต่กดบันทึกโดยไม่เปลี่ยนเวลา → ได้ (กลายเป็นกำลังสอน)", () =>
    ok(checkTimeEdit({ original, ...original, now: at("13:30") })));
});

describe("แก้ไขคาบที่กำลังสอนอยู่ (09:00–11:00, ตอนนี้ 10:00)", () => {
  const original = { startMs: at("09:00"), endMs: at("11:00") };
  test("ไม่เปลี่ยนเวลา (แก้หัวข้อ/ที่นั่ง/หมายเหตุ) → ได้", () =>
    ok(checkTimeEdit({ original, ...original, now: NOW })));
  test("ขยายเวลาสิ้นสุด (สอนเกินเวลา) → ได้", () =>
    ok(checkTimeEdit({ original, startMs: original.startMs, endMs: at("12:00"), now: NOW })));
  test("ย่นเวลาสิ้นสุด แต่ยังหลังจากตอนนี้ → ได้", () =>
    ok(checkTimeEdit({ original, startMs: original.startMs, endMs: at("10:30"), now: NOW })));
  test("ย่นเวลาสิ้นสุดให้จบก่อนตอนนี้ → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: original.startMs, endMs: at("09:30"), now: NOW }), /หลังจากตอนนี้/));
  test("ย่นให้จบตอนนี้พอดี → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: original.startMs, endMs: NOW, now: NOW }), /หลังจากตอนนี้/));
  test("เปลี่ยนเวลาเริ่ม → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: at("09:30"), endMs: original.endMs, now: NOW }), /กำลังสอนอยู่/));
  test("ย้ายไปเวลาอนาคต → ไม่ได้ (คาบเริ่มไปแล้ว)", () =>
    err(checkTimeEdit({ original, startMs: at("14:00"), endMs: at("16:00"), now: NOW }), /กำลังสอนอยู่/));
  test("ย้ายไปวันอื่น → ไม่ได้", () =>
    err(
      checkTimeEdit({ original, startMs: at("09:00", "2030-11-11"), endMs: at("11:00", "2030-11-11"), now: NOW }),
      /กำลังสอนอยู่/
    ));
});

describe("แก้ไขคาบที่สอนจบแล้ว (07:00–09:00, ตอนนี้ 10:00)", () => {
  const original = { startMs: at("07:00"), endMs: at("09:00") };
  test("ไม่เปลี่ยนวันเวลา (แก้ห้อง/วิชา/หัวข้อ/หมายเหตุ) → ได้", () =>
    ok(checkTimeEdit({ original, ...original, now: NOW })));
  test("คาบของเมื่อวาน ไม่เปลี่ยนวันเวลา → ได้", () => {
    const y = { startMs: at("07:00", "2030-11-09"), endMs: at("09:00", "2030-11-09") };
    ok(checkTimeEdit({ original: y, ...y, now: NOW }));
  });
  test("ย้ายไปอนาคต → ไม่ได้ (ประวัติการสอนจริงจะหาย)", () =>
    err(checkTimeEdit({ original, startMs: at("13:00"), endMs: at("15:00"), now: NOW }), /สอนจบไปแล้ว/));
  test("แก้เวลาสิ้นสุดย้อนหลัง → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: original.startMs, endMs: at("08:30"), now: NOW }), /สอนจบไปแล้ว/));
  test("แก้เวลาเริ่มย้อนหลัง → ไม่ได้", () =>
    err(checkTimeEdit({ original, startMs: at("07:30"), endMs: original.endMs, now: NOW }), /สอนจบไปแล้ว/));
});

describe("ช่องที่ล็อกในฟอร์ม", () => {
  test("เพิ่มใหม่: ไม่ล็อก", () => assert.deepEqual(lockedFields(null, NOW), { date: false, start: false, end: false, phase: null }));
  test("ยังไม่เริ่ม: ไม่ล็อก", () =>
    assert.deepEqual(lockedFields({ startMs: at("13:00"), endMs: at("15:00") }, NOW), {
      phase: "upcoming", date: false, start: false, end: false,
    }));
  test("กำลังสอน: ล็อกวันที่ + เวลาเริ่ม", () =>
    assert.deepEqual(lockedFields({ startMs: at("09:00"), endMs: at("11:00") }, NOW), {
      phase: "ongoing", date: true, start: true, end: false,
    }));
  test("จบแล้ว: ล็อกทั้งหมด", () =>
    assert.deepEqual(lockedFields({ startMs: at("07:00"), endMs: at("09:00") }, NOW), {
      phase: "past", date: true, start: true, end: true,
    }));
});

# ระบบลงเวลาสอนของอาจารย์

Next.js 15 (App Router) + TypeScript + Tailwind CSS + PostgreSQL (Neon / PGlite) + FullCalendar
Timezone ทั้งระบบ: **Asia/Bangkok** · UI ภาษาไทย

ฐานข้อมูลใช้แนวทางเดียวกับโปรเจกต์ warlock (`lib/db.ts`):

| สภาพแวดล้อม | ฐานข้อมูล |
|---|---|
| รันบนเครื่อง (ไม่มี `DATABASE_URL`) | **PGlite** — Postgres ในตัว เก็บไว้ที่ `./.data` ไม่ต้องติดตั้งอะไรเพิ่ม |
| Vercel / มี `DATABASE_URL` | **Neon** ผ่าน `@neondatabase/serverless` |

ตารางและ constraint ถูกสร้างอัตโนมัติในครั้งแรกที่ใช้งาน ไม่ต้องรัน migration เอง

## รันบนเครื่อง

```bash
npm install
npm run dev
```

เปิด <http://localhost:3000/login> → ครั้งแรกจะเป็นหน้า **ตั้งค่าผู้ดูแลระบบคนแรก**
บัญชีที่สร้างตรงนี้คือ **แอดมิน** จากนั้น:

1. `/admin/rooms` เพิ่มห้องเรียน
2. `/admin/users` สร้างบัญชีอาจารย์ (ชื่อผู้ใช้ + รหัสผ่าน แล้วแจ้งให้อาจารย์)
3. อาจารย์ล็อกอินแล้วลงตารางสอนที่ `/dashboard`

ล้างข้อมูลบนเครื่อง: หยุดเซิร์ฟเวอร์ แล้วลบโฟลเดอร์ `.data`

## ความสามารถ

| ผู้ใช้ | ทำอะไรได้ |
|---|---|
| บุคคลทั่วไป | ดูปฏิทิน (เดือน / สัปดาห์ / วัน / รายการ), กรองตามห้องหรืออาจารย์, แยกสีตามห้องหรืออาจารย์ |
| อาจารย์ | เพิ่ม / แก้ไข / ลบ ตารางสอน**ของตัวเอง** |
| แอดมิน | จัดการห้องเรียน, จัดการผู้ใช้, จัดการตารางสอน**ของทุกคน** |

### กันการจองซ้ำ 3 ชั้น

เงื่อนไขทับซ้อน: `start ใหม่ < end เดิม AND end ใหม่ > start เดิม` (สอนต่อกันพอดีไม่ถือว่าซ้อน)

1. **หน้าเว็บ** – เช็กทันทีเมื่อเลือกวัน/เวลา/ห้อง แจ้ง `ห้อง X ถูกใช้แล้วโดย อ.Y เวลา HH:MM–HH:MM`
2. **Server Action** (`app/dashboard/actions.ts`) – เช็กซ้ำก่อนบันทึก
3. **Database** – `EXCLUDE USING gist` (`btree_gist` + `tstzrange '[)'`) ทั้งระดับห้องและระดับอาจารย์ กันกรณีกดบันทึกพร้อมกัน

ตอนแก้ไขจะไม่นับรายการตัวเองว่าซ้ำ

### กฎห้องเรียน

- ห้องที่มีตารางสอนในอนาคตลบไม่ได้ → ระบบเปลี่ยนเป็น "ปิดใช้งาน" แทน (มี trigger ใน DB กันอีกชั้น)
- ห้องที่มีแต่ประวัติในอดีตลบได้ ประวัติการสอนยังอยู่ (แสดงเป็น "ห้องถูกลบ")
- ห้องที่ปิดใช้งาน อาจารย์จองใหม่ไม่ได้ (แอดมินยังจองได้)

### สิทธิ์การเข้าถึง

ไม่มี RLS เพราะไม่ได้ใช้ Supabase แล้ว — ตรวจสิทธิ์ทุกครั้งใน Server Action ฝั่งเซิร์ฟเวอร์
(อาจารย์แก้/ลบได้เฉพาะ `teacher_id` ของตัวเอง, งานจัดการห้อง/ผู้ใช้เช็กว่าเป็นแอดมิน)
ล็อกอินด้วยรหัสผ่านที่แฮชด้วย scrypt และคุกกี้ session ที่ลงลายเซ็น HMAC (`lib/session.ts`)

## ทดสอบ

```bash
npm run test:db     # schema, กันจองซ้ำ, trigger ห้อง, findConflicts, รหัสผ่าน/session (PGlite ในหน่วยความจำ)
npm run typecheck
```

## Deploy บน Vercel + Neon

1. Push โค้ดขึ้น GitHub แล้วไปที่ <https://vercel.com/new> → Import repository
2. ในโปรเจกต์ Vercel ไปที่ **Storage → Create Database → Neon** แล้วเชื่อมกับโปรเจกต์
   (Vercel จะตั้ง `DATABASE_URL` ให้อัตโนมัติ) — หรือสร้างที่ <https://neon.tech> แล้วใส่ `DATABASE_URL` เอง
   แนะนำ region **Singapore (ap-southeast-1)**
3. **Settings → Environment Variables** เพิ่ม `AUTH_SECRET` = ค่าสุ่มยาว ๆ (เช่น `openssl rand -base64 32`)
4. Deploy แล้วเปิด `https://<your-app>.vercel.app/login` → สร้างแอดมินคนแรก

`btree_gist` เป็น extension ที่ Neon รองรับ ระบบจะ `CREATE EXTENSION` ให้เอง

## ตั้งบัญชีแรกให้เป็นแอดมิน

ทำอัตโนมัติ: ตอนยังไม่มีผู้ใช้ในระบบ หน้า `/login` จะให้สร้างบัญชีแอดมินคนแรก
(สร้างได้ครั้งเดียว หลังจากนั้นแอดมินเพิ่มผู้ใช้/ตั้งแอดมินคนอื่นได้ที่ `/admin/users`)

ถ้าต้องการตั้งแอดมินผ่าน SQL (เช่นลืมรหัส แต่มีบัญชีอื่นอยู่):

```sql
UPDATE users SET role = 'admin' WHERE username = 'somchai';
```

## โครงสร้างโฟลเดอร์

```
app/
  page.tsx                  # / ปฏิทินสาธารณะ
  login/                    # /login + ตั้งค่าแอดมินคนแรก (page, LoginForm, actions)
  dashboard/                # /dashboard ตารางสอน (page, actions = เช็กซ้ำ/บันทึก/ลบ)
  admin/rooms/              # /admin/rooms จัดการห้อง
  admin/users/              # /admin/users จัดการผู้ใช้
  api/schedules/route.ts    # API สาธารณะสำหรับปฏิทิน
components/                 # Navbar, PublicCalendar, ScheduleManager, RoomManager, UserManager
lib/
  db.ts                     # เชื่อม Neon / PGlite + สร้างตารางอัตโนมัติ
  queries.ts                # query ที่ใช้ร่วมกัน
  conflicts.ts              # หาเวลาทับซ้อน + แปล error เป็นภาษาไทย
  auth.ts, session.ts       # รหัสผ่าน, คุกกี้ล็อกอิน
  time.ts, colors.ts, types.ts
middleware.ts               # กัน /dashboard และ /admin
tests/db.test.ts
```

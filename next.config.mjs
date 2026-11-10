import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ระบุ root ของโปรเจกต์ให้ชัด (กัน warning เมื่อมี package-lock.json อื่นในโฟลเดอร์แม่)
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // PGlite ใช้ไฟล์ wasm ต้องไม่ถูก bundle
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;

import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "./globals.css";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ตารางสอนศาสตราจารย์",
  description: "ระบบลงเวลาสอนและจองห้องเรียนของศาสตราจารย์",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-800 antialiased">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

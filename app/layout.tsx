import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "LeadFlow — AI lead intake & qualification",
  description:
    "Capture a lead once and everything after runs itself: AI qualification, scoring, CRM sync and a real-time alert to sales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-page font-sans text-ink">{children}</body>
    </html>
  );
}

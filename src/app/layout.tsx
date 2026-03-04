import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Apex - Sentient Interface",
  description: "Phase 1 Complete - Full functional landing page with AI-powered features, real-time GitHub metrics, and OpenTelemetry integration.",
  keywords: ["Apex", "Sentient Interface", "AI", "Next.js", "Grafana", "OpenTelemetry"],
  authors: [{ name: "Apex Team" }],
  openGraph: {
    title: "Apex - Sentient Interface",
    description: "Phase 1 Complete - Full functional landing page with AI-powered features",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeBench — Cross-Language Algorithm Benchmarking",
  description:
    "CodeBench executes real algorithms in C++ (Google Benchmark), Java (JMH) and Python (pyperf) on identical deterministic inputs, verifies correctness, and analyzes the measurements.",
  keywords: [
    "benchmark",
    "algorithm",
    "performance",
    "C++",
    "Java",
    "Python",
    "Google Benchmark",
    "JMH",
    "pyperf",
    "CodeBench",
  ],
  authors: [{ name: "Parsa Fathi" }],
  icons: { icon: "/codebench-icon.svg" },
  openGraph: {
    title: "CodeBench — Cross-Language Algorithm Benchmarking",
    description:
      "Real measurements, verified correctness, honest statistics. C++ / Java / Python benchmark workbench.",
    siteName: "CodeBench",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#111310",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

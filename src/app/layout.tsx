import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

/* ── Atelier × Lookbook design system ──
   Fraunces (editorial display, with italics) + Hanken Grotesk (UI/body).
   These power the whole app — desktop and mobile share one type system. */
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Garment — Uniform Management Platform",
    template: "%s | Garment",
  },
  description:
    "Garment is a visual uniform management platform for churches and uniform-based organisations.",
  keywords: ["uniform management", "church uniforms", "outfit scheduler", "uniform planning"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${hanken.variable}`}>
      <head>
        <meta name="theme-color" content="#472743" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

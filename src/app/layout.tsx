import type { Metadata } from "next";
import { Nunito, DM_Sans } from "next/font/google";
import "./globals.css";

const dm_serif = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const dm_sans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
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
    <html lang="en" className={`${dm_serif.variable} ${dm_sans.variable}`}>
      <head>
        <meta name="theme-color" content="#7C5CBF" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

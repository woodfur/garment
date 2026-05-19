import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Polar account",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, var(--color-bg-primary) 60%)" }}>
      {children}
    </main>
  );
}

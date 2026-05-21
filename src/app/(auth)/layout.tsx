import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Garment account",
};

// Passthrough — login page manages its own full-screen split-panel layout
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

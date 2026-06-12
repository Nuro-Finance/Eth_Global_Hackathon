import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Nuro Card Sandbox — Design Preview",
};

export default function CardLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#0d0d0e] font-sans antialiased text-[#ececec]"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

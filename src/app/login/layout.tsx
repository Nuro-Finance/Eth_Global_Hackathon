import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nuro",
  description: "Nuro Dashboard",
  icons: {
    icon: [{ url: "/nuro-logo-black.svg", type: "image/svg+xml" }],
    shortcut: "/nuro-logo-black.svg",
    apple: [{ url: "/nuro-logo-black.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning data-gramm="false">
        {children}
      </body>
    </html>
  )
}

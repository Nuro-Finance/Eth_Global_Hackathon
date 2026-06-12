import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nuro",
  description: "Nuro Dashboard",
  icons: {
    icon: [
      { url: "/favicon.ico?v=nuro", sizes: "any" },
      { url: "/favicon-32.png?v=nuro", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico?v=nuro",
    apple: [{ url: "/favicon-32.png", type: "image/png" }],
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

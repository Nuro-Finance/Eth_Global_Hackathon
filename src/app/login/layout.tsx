import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nuro",
  description: "Nuro Dashboard",
  icons: {
    icon: [
      { url: "/favicon-32.png?v=nuro", type: "image/png", sizes: "32x32" },
      { url: "/nuro-logo-black.svg?v=nuro", type: "image/svg+xml" },
    ],
    shortcut: "/favicon-32.png?v=nuro",
    apple: [{ url: "/Nuro Fav Icon 1x1.png", type: "image/png" }],
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

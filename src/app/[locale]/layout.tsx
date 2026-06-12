export const dynamic = "auto";
import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
import { getMessages } from "next-intl/server";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import Providers from "@/providers/Providers";
import SmoothScroll from "@/components/SmoothScroll";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  display: "swap",
  variable: "--font-noto-arabic",
});

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/favicon.ico?v=nuro", sizes: "any" },
      { url: "/favicon-32.png?v=nuro", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico?v=nuro",
    apple: [{ url: "/favicon-32.png", type: "image/png" }],
  },
  other: {
    "grammarly-disable-extension": "true",
  },
};

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  // Ensure that the incoming `locale` is valid
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <body
        className={`antialiased bg-transparent ${inter.variable} ${notoSansArabic.variable} font-sans overflow-x-hidden`}
        suppressHydrationWarning
        data-gramm="false"
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              document.documentElement.classList.remove('light', 'graphite');
              document.documentElement.classList.add('dark');
              document.documentElement.style.backgroundColor = 'var(--color-bg-primary)';
            })();
          `,
          }}
        />
        {/* Site-wide buttery scroll. Single Lenis instance at root.
            Touch devices keep native momentum. Native scrollbars unaffected. */}
        <SmoothScroll />
        <div id="root-content" className="relative z-10 bg-transparent min-h-screen">
          <NextIntlClientProvider messages={messages}>
            <Providers>{children}</Providers>
          </NextIntlClientProvider>
        </div>
      </body>
    </html>
  );
}

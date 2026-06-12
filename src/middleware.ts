import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.includes("/dev/preview-error-boundary")) {
    const url = request.nextUrl.clone();
    url.pathname = "/design/preview-error-boundary";
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|skills|agents|contracts|styles|design|.*\\..*).*)",
  ],
};

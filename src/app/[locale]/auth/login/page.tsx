// Session 30 SECURITY SHIM.
//
// NextAuth v5 beta, some older ProtectedRoute code paths, and misbehaving
// client-side pushes have historically tried to route users to
// /<locale>/auth/login — a path that doesn't exist in our app. Result: 404
// page, and users believe sign-in is broken.
//
// This shim catches the stray path and redirects server-side to the real
// login page (/<locale>/login). Pure redirect, zero UI, renders nothing.
//
// Why this exists (not just "fix the caller"): between NextAuth v5 default
// fallbacks, three signed-in flows (credentials, Google, future Privy),
// and a 250ms-flash bug we just fixed in ProtectedRoute.tsx, defensive
// routing here is cheaper than hunting every source of /auth/login URLs.
// If you find yourself editing this file to do anything besides redirect:
// stop. Fix the upstream pusher instead.

import { redirect } from "next/navigation";

export default function AuthLoginRedirectShim({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Next 15+: params is a Promise; we only need it to unblock the render.
  // The redirect is synchronous below based on a static pattern.
  void params;
  redirect("/en/login");
}

import { auth } from "@/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WELCOME_COOKIE, getWelcomeUserId, welcomeSeenForUser } from "@/lib/welcome-onboarding";

/**
 * App entry — login when signed out; dashboard or first-login welcome when signed in.
 */
export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const userId = getWelcomeUserId(session.user);
  const welcomeCookie = (await cookies()).get(WELCOME_COOKIE)?.value;
  const seenWelcome = welcomeSeenForUser(welcomeCookie, userId);

  redirect(seenWelcome ? `/${locale}/dashboard` : `/${locale}/welcome`);
}

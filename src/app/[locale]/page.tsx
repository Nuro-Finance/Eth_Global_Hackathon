import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * App entry — login when signed out; dashboard when signed in.
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

  redirect(`/${locale}/dashboard`);
}

"use client";

/**
 * Legacy welcome redirect removed - onboarding is AccountOnboardingModal on dashboard.
 */
export default function WelcomeOnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

export default function KycSuccessOverlay() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          router.push(`/${locale}/dashboard`);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [locale, router]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 text-center p-8">
        <div className="relative flex items-center justify-center w-28 h-28">
          <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
          <div className="absolute inset-0 rounded-full bg-green-500/10 animate-pulse" />
          <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-green-500 shadow-[0_0_40px_rgba(34,197,94,0.5)]">
            <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white">Identity Verified!</h2>
          <p className="text-white/60 text-base max-w-xs">Your account is now fully activated. Welcome to Nuro.</p>
        </div>
        <p className="text-white/40 text-sm">Redirecting in {countdown}s&hellip;</p>
        <button
          onClick={() => router.push(`/${locale}/dashboard`)}
          className="px-8 py-3 rounded-full bg-green-500 text-white text-sm font-semibold hover:bg-green-400 active:scale-95 transition-all shadow-lg"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

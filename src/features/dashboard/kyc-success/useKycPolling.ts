"use client";
import { useState, useEffect, useRef } from "react";
import { useAppSession } from "@/hooks/useAppSession";

export function useKycPolling() {
  const { data: session } = useAppSession();
  const [kycApproved, setKycApproved] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPolling = useRef(false);

  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) return;

    const checkStatus = async () => {
      try {
        const res = await fetch(
          `/api/kyc/status`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "approved") {
          setKycApproved(true);
          isPolling.current = false;
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } else if (data.status === "pending" && !isPolling.current) {
          isPolling.current = true;
          intervalRef.current = setInterval(checkStatus, 8000);
        }
      } catch {
        // silently ignore
      }
    };

    checkStatus();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isPolling.current = false;
    };
  }, [(session as any)?.accessToken]);

  return { kycApproved };
}

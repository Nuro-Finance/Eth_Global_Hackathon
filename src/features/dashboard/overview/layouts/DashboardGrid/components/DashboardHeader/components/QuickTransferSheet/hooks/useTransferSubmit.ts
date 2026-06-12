import { useState } from "react";
import { useSession } from "next-auth/react";
import { QuickTransferFormData } from "../config";

interface UseTransferSubmitOptions {
    onSuccess?: () => void;
    onError?: (error: unknown) => void;
}

export function useTransferSubmit(options?: UseTransferSubmitOptions) {
    const { data: session } = useSession();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const submit = async (data: QuickTransferFormData) => {
        setIsSubmitting(true);
        try {
            // Convert the form's Date object to ISO timestamp the backend expects.
            // Backend compares scheduledAt to Date.now()+60s to decide scheduled vs
            // immediate — so passing today's date (<60s in future) = immediate, future
            // date = scheduled intent.
            const scheduledAt = data.transferDate
                ? new Date(data.transferDate).toISOString()
                : null;
            const res = await fetch("/api/transfers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.accessToken || ""}`,
                },
                body: JSON.stringify({
                    recipientName: data.recipient,
                    recipientEmail: data.recipientEmail,
                    amount: data.amount,
                    currency: data.currency || "USD",
                    description: data.description || null,
                    // Session 23 polish: destination now driven by UI toggle (was hardcoded 'wallet').
                    destination: data.destination || "wallet",
                    scheduledAt,
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Transfer failed");
            }
            if (options?.onSuccess) {
                options.onSuccess();
            }
        } catch (error) {
            console.error("[useTransferSubmit] failed:", error);
            if (options?.onError) {
                options.onError(error);
            }
            throw error;
        } finally {
            setIsSubmitting(false);
        }
    };

    return { submit, isSubmitting };
}

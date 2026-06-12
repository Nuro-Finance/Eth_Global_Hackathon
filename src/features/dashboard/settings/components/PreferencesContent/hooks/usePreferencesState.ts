"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppSession } from "@/hooks/useAppSession";

export interface PreferencesState {
    darkMode: boolean;
    autoSave: boolean;
    animations: boolean;
}

export interface SelectState {
    language: string;
    currency: string;
}

export function usePreferencesState() {
    const { data: session } = useAppSession();
    const token = (session as any)?.accessToken;

    const [preferences, setPreferences] = useState<PreferencesState>({
        darkMode: true,
        autoSave: true,
        animations: true,
    });

    const [selects, setSelects] = useState<SelectState>({
        language: "en",
        currency: "USD",
    });

    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!token || loaded) return;
        fetch("/api/users/preferences", {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => (r.ok ? r.json() : {}))
            .then((data: any) => {
                if (data.darkMode !== undefined) setPreferences((p) => ({ ...p, darkMode: data.darkMode }));
                if (data.autoSave !== undefined) setPreferences((p) => ({ ...p, autoSave: data.autoSave }));
                if (data.animations !== undefined) setPreferences((p) => ({ ...p, animations: data.animations }));
                if (data.currency) setSelects((s) => ({ ...s, currency: data.currency }));
                if (data.language) setSelects((s) => ({ ...s, language: data.language }));
                setLoaded(true);
            })
            .catch(() => {});
    }, [token, loaded]);

    const patchPrefs = useCallback(
        (patch: Record<string, any>) => {
            if (!token) return;
            fetch("/api/users/preferences", {
                method: "PATCH",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            }).catch(() => {});
        },
        [token]
    );

    const togglePreference = (key: keyof PreferencesState) => {
        setPreferences((prev) => {
            const next = { ...prev, [key]: !prev[key] };
            patchPrefs({ [key]: next[key] });
            return next;
        });
    };

    const setSelectValue = (key: keyof SelectState, value: string) => {
        setSelects((prev) => ({ ...prev, [key]: value }));
        patchPrefs({ [key]: value });
    };

    return {
        preferences,
        selects,
        togglePreference,
        setSelectValue,
    };
}

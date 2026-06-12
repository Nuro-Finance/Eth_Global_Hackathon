"use client";

import { useState } from "react";

export interface SecurityState {
    twoFactorEnabled: boolean;
}

export function useSecurityState() {
    const [state, setState] = useState<SecurityState>({
        twoFactorEnabled: false,
    });

    const toggleSetting = (key: keyof SecurityState) => {
        setState((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return {
        ...state,
        toggleSetting,
    };
}

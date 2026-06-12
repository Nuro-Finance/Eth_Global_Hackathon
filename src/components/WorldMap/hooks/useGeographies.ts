"use client";

import { useState, useCallback } from "react";

interface UseGeographiesProps {
    onGeographiesLoad?: (geographies: object[]) => void;
}

export function useGeographies({ onGeographiesLoad }: UseGeographiesProps) {
    const [hasLoadedGeographies, setHasLoadedGeographies] = useState(false);

    const handleGeographiesRender = useCallback(
        (geographies: object[]) => {
            if (!hasLoadedGeographies && geographies.length > 0) {
                setHasLoadedGeographies(true);
                onGeographiesLoad?.(geographies);
            }
        },
        [hasLoadedGeographies, onGeographiesLoad]
    );

    return {
        hasLoadedGeographies,
        handleGeographiesRender,
    };
}

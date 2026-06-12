"use client";

import { useRef, useCallback } from "react";
import domtoimage from "dom-to-image";

interface UseChartDownloadOptions {
    filename: string;
}

/**
 * Hook to handle chart download as PNG
 * Extracts the download logic for reusability across all chart components
 */
export function useChartDownload({ filename }: UseChartDownloadOptions) {
    const chartRef = useRef<HTMLDivElement>(null);

    const downloadAsPNG = useCallback(async () => {
        if (!chartRef.current) return;

        try {
 // Get current theme background color
            const bgColor =
                getComputedStyle(document.documentElement)
                    .getPropertyValue("--color-bg-primary")
                    .trim() ||
                (document.documentElement.classList.contains("dark")
                    ? "#111111"
                    : "#ffffff");

            const dataUrl = await domtoimage.toPng(chartRef.current, {
                quality: 1,
                bgcolor: bgColor,
                width: chartRef.current.offsetWidth * 2,
                height: chartRef.current.offsetHeight * 2,
                style: {
                    transform: "scale(2)",
                    transformOrigin: "top left",
                    width: chartRef.current.offsetWidth + "px",
                    height: chartRef.current.offsetHeight + "px",
                },
            });

            const link = document.createElement("a");
            link.download = `${filename.toLowerCase().replace(/\s+/g, "-")}-chart.png`;
            link.href = dataUrl;
            link.click();
        } catch (error) {
            console.error("Error generating image:", error);
        }
    }, [filename]);

    return { chartRef, downloadAsPNG };
}

"use client";

import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { POINTER_SENSOR_CONFIG } from "../config";

/**
 * Hook for configuring drag sensors
 */
export function useDragSensors() {
    return useSensors(
        useSensor(PointerSensor, POINTER_SENSOR_CONFIG),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );
}

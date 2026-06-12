/**
 * Cross-surface signal when reload or withdraw is recognized by the backend
 * (not merely UI step changes). Header listens and shows a short-lived pill.
 */
export const DASHBOARD_IN_FLIGHT_OPERATION_EVENT = "nuro:dashboard-in-flight-operation";

export type DashboardInFlightOperationKind = "reload" | "withdraw";

export function emitDashboardInFlightOperation(kind: DashboardInFlightOperationKind): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_IN_FLIGHT_OPERATION_EVENT, { detail: kind }));
}

export function subscribeDashboardInFlightOperation(
  handler: (kind: DashboardInFlightOperationKind) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const ce = e as CustomEvent<DashboardInFlightOperationKind>;
    const kind = ce.detail;
    if (kind === "reload" || kind === "withdraw") handler(kind);
  };
  window.addEventListener(DASHBOARD_IN_FLIGHT_OPERATION_EVENT, listener as EventListener);
  return () => window.removeEventListener(DASHBOARD_IN_FLIGHT_OPERATION_EVENT, listener as EventListener);
}

/** Fired once reload flow reaches deposit success (step 4). */
export const FIRST_DEPOSIT_SUCCESS_EVENT = "nuro:first-deposit-success";

export function emitFirstDepositSuccess(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FIRST_DEPOSIT_SUCCESS_EVENT));
}

export function subscribeFirstDepositSuccess(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(FIRST_DEPOSIT_SUCCESS_EVENT, handler);
  return () => window.removeEventListener(FIRST_DEPOSIT_SUCCESS_EVENT, handler);
}

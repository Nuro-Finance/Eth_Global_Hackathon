export type DataStatus =
  | "idle"
  | "loading"
  | "refreshing"
  | "success"
  | "stale"
  | "error"
  | "offline";

export interface DataStateMeta {
  lastUpdatedAt?: number; // epoch ms
  source?: string;
  chainId?: number | string;
  requestId?: string;
}

export interface DataState {
  status: DataStatus;
  meta?: DataStateMeta;
  error?: string;
}

export function formatRelativeTimeFromNow(epochMs?: number): string | null {
  if (!epochMs) return null;
  const diffMs = Date.now() - epochMs;
  if (!Number.isFinite(diffMs)) return null;

  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}


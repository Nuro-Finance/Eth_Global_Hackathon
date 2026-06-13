const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

const RESERVED = new Set([
  "admin",
  "api",
  "www",
  "nuro",
  "nurofi",
  "eth",
  "app",
  "mail",
  "support",
]);

export function ensParentDomain(): string {
  return (
    process.env.ENS_PARENT_NAME ??
    process.env.NEXT_PUBLIC_ENS_PARENT_NAME ??
    "nurofi.eth"
  );
}

export function normalizeEnsSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateEnsSlug(slug: string): string | null {
  if (!slug) return "Name is required";
  if (slug.length < 3) return "At least 3 characters";
  if (slug.length > 32) return "Max 32 characters";
  if (!SLUG_RE.test(slug)) return "Use letters, numbers, and hyphens only";
  if (RESERVED.has(slug)) return "This name is reserved";
  return null;
}

export function businessFullName(businessSlug: string, parent = ensParentDomain()): string {
  return `${businessSlug}.${parent}`;
}

export function agentFullName(
  agentSlug: string,
  businessSlug: string,
  parent = ensParentDomain(),
): string {
  return `${agentSlug}-${businessSlug}.${parent}`;
}

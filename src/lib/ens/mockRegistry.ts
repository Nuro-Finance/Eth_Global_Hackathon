import { randomUUID } from "crypto";
import type { EnsClaimResult, EnsIdentity, EnsRecordKind, EnsVisibility } from "./types";
import {
  agentFullName,
  businessFullName,
  ensParentDomain,
  normalizeEnsSlug,
  validateEnsSlug,
} from "./slug";

type UserEnsState = {
  businessSlug: string | null;
  agents: Array<{
    slug: string;
    visibility: EnsVisibility;
    address: string;
    createdAt: string;
  }>;
};

const byUser = new Map<string, UserEnsState>();
const takenGlobal = new Set<string>();

function stateFor(userId: string): UserEnsState {
  let s = byUser.get(userId);
  if (!s) {
    s = { businessSlug: null, agents: [] };
    byUser.set(userId, s);
  }
  return s;
}

function mockWalletAddress(seed: string): string {
  const hex = Buffer.from(seed).toString("hex").slice(0, 40).padEnd(40, "0");
  return `0x${hex}`;
}

export function getEnsIdentity(userId: string): EnsIdentity {
  const parent = ensParentDomain();
  const s = stateFor(userId);
  return {
    parent,
    businessSlug: s.businessSlug,
    businessFullName: s.businessSlug ? businessFullName(s.businessSlug, parent) : null,
    agents: s.agents.map((a) => ({
      slug: a.slug,
      fullName: agentFullName(a.slug, s.businessSlug!, parent),
      visibility: a.visibility,
      address: a.address,
      createdAt: a.createdAt,
    })),
  };
}

export function checkEnsSlug(params: {
  userId: string;
  kind: EnsRecordKind;
  slug: string;
  businessSlug?: string;
}): { available: boolean; fullName: string; error?: string } {
  const parent = ensParentDomain();
  const slug = normalizeEnsSlug(params.slug);
  const err = validateEnsSlug(slug);
  if (err) return { available: false, fullName: "", error: err };

  if (params.kind === "business") {
    const fullName = businessFullName(slug, parent);
    const s = stateFor(params.userId);
    if (s.businessSlug === slug) return { available: true, fullName };
    if (takenGlobal.has(fullName)) return { available: false, fullName, error: "Already taken" };
    return { available: true, fullName };
  }

  const businessSlug = normalizeEnsSlug(params.businessSlug ?? stateFor(params.userId).businessSlug ?? "");
  const businessErr = validateEnsSlug(businessSlug);
  if (businessErr) return { available: false, fullName: "", error: "Set a business name first" };

  const fullName = agentFullName(slug, businessSlug, parent);
  const s = stateFor(params.userId);
  if (s.agents.some((a) => a.slug === slug)) return { available: true, fullName };
  if (takenGlobal.has(fullName)) return { available: false, fullName, error: "Already taken" };
  return { available: true, fullName };
}

export function claimEnsName(params: {
  userId: string;
  kind: EnsRecordKind;
  slug: string;
  visibility?: EnsVisibility;
  address?: string;
}): EnsClaimResult {
  const parent = ensParentDomain();
  const slug = normalizeEnsSlug(params.slug);
  const err = validateEnsSlug(slug);
  if (err) throw new Error(err);

  const visibility = params.visibility ?? "private";
  const s = stateFor(params.userId);

  if (params.kind === "business") {
    const fullName = businessFullName(slug, parent);
    if (s.businessSlug && s.businessSlug !== slug) {
      takenGlobal.delete(businessFullName(s.businessSlug, parent));
    }
    if (takenGlobal.has(fullName) && s.businessSlug !== slug) {
      throw new Error("Business name already taken");
    }
    s.businessSlug = slug;
    takenGlobal.add(fullName);
    const address = params.address ?? mockWalletAddress(`${params.userId}:business:${slug}`);
    return { kind: "business", slug, fullName, visibility: "public", address };
  }

  if (!s.businessSlug) throw new Error("Claim a business name first");
  const fullName = agentFullName(slug, s.businessSlug, parent);
  if (takenGlobal.has(fullName) && !s.agents.some((a) => a.slug === slug)) {
    throw new Error("Agent name already taken");
  }
  if (s.agents.some((a) => a.slug === slug)) {
    const existing = s.agents.find((a) => a.slug === slug)!;
    return {
      kind: "agent",
      slug,
      fullName,
      visibility: existing.visibility,
      address: existing.address,
    };
  }

  const address =
    params.address ?? mockWalletAddress(`${params.userId}:agent:${slug}:${randomUUID()}`);
  s.agents.push({ slug, visibility, address, createdAt: new Date().toISOString() });
  takenGlobal.add(fullName);
  return { kind: "agent", slug, fullName, visibility, address };
}

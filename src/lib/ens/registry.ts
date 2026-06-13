import { randomUUID } from "crypto";
import { pool } from "@/db";
import type { EnsClaimResult, EnsIdentity, EnsRecordKind, EnsVisibility } from "./types";
import {
  agentFullName,
  businessFullName,
  ensParentDomain,
  normalizeEnsSlug,
  validateEnsSlug,
} from "./slug";
import { syncEnsClaimToGateway } from "./gatewaySync";

type ClaimRow = {
  kind: EnsRecordKind;
  slug: string;
  full_name: string;
  visibility: EnsVisibility;
  address: string;
  created_at: Date;
};

function mockWalletAddress(seed: string): string {
  const hex = Buffer.from(seed).toString("hex").slice(0, 40).padEnd(40, "0");
  return `0x${hex}`;
}

async function pushClaimToGateway(params: {
  fullName: string;
  address: string;
  visibility: EnsVisibility;
}): Promise<void> {
  const result = await syncEnsClaimToGateway(params);
  if (result.status === "synced") return;
  if (result.status === "skipped") return;

  console.error("[ens] gateway sync failed:", result.error);
  if (process.env.ENS_GATEWAY_REQUIRED === "true") {
    throw new Error(`Gateway sync failed: ${result.error}`);
  }
}

async function findOwnerOfFullName(fullName: string): Promise<string | null> {
  const res = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM ens_claims WHERE full_name = $1 LIMIT 1`,
    [fullName],
  );
  return res.rows[0]?.user_id ?? null;
}

async function loadClaimsForUser(userId: string): Promise<ClaimRow[]> {
  const res = await pool.query<ClaimRow>(
    `SELECT kind, slug, full_name, visibility, address, created_at
     FROM ens_claims
     WHERE user_id = $1
     ORDER BY kind ASC, created_at ASC`,
    [userId],
  );
  return res.rows;
}

export async function getEnsIdentity(userId: string): Promise<EnsIdentity> {
  const parent = ensParentDomain();
  const rows = await loadClaimsForUser(userId);
  const business = rows.find((r) => r.kind === "business");

  return {
    parent,
    businessSlug: business?.slug ?? null,
    businessFullName: business ? businessFullName(business.slug, parent) : null,
    agents: rows
      .filter((r) => r.kind === "agent")
      .map((r) => ({
        slug: r.slug,
        fullName: business
          ? agentFullName(r.slug, business.slug, parent)
          : r.full_name,
        visibility: r.visibility,
        address: r.address,
        createdAt: new Date(r.created_at).toISOString(),
      })),
  };
}

export async function checkEnsSlug(params: {
  userId: string;
  kind: EnsRecordKind;
  slug: string;
  businessSlug?: string;
}): Promise<{ available: boolean; fullName: string; error?: string }> {
  const parent = ensParentDomain();
  const slug = normalizeEnsSlug(params.slug);
  const err = validateEnsSlug(slug);
  if (err) return { available: false, fullName: "", error: err };

  if (params.kind === "business") {
    const fullName = businessFullName(slug, parent);
    const owner = await findOwnerOfFullName(fullName);
    if (owner && owner !== params.userId) {
      return { available: false, fullName, error: "Already taken" };
    }
    return { available: true, fullName };
  }

  const rows = await loadClaimsForUser(params.userId);
  const businessRow = rows.find((r) => r.kind === "business");
  const businessSlug = normalizeEnsSlug(
    params.businessSlug ?? businessRow?.slug ?? "",
  );
  const businessErr = validateEnsSlug(businessSlug);
  if (businessErr) return { available: false, fullName: "", error: "Set a business name first" };

  const fullName = agentFullName(slug, businessSlug, parent);
  const existingAgent = rows.find((r) => r.kind === "agent" && r.slug === slug);
  if (existingAgent) return { available: true, fullName };

  const owner = await findOwnerOfFullName(fullName);
  if (owner && owner !== params.userId) {
    return { available: false, fullName, error: "Already taken" };
  }
  return { available: true, fullName };
}

export async function claimEnsName(params: {
  userId: string;
  kind: EnsRecordKind;
  slug: string;
  visibility?: EnsVisibility;
  address?: string;
}): Promise<EnsClaimResult> {
  const parent = ensParentDomain();
  const slug = normalizeEnsSlug(params.slug);
  const err = validateEnsSlug(slug);
  if (err) throw new Error(err);

  const visibility = params.visibility ?? "private";

  if (params.kind === "business") {
    const fullName = businessFullName(slug, parent);
    const owner = await findOwnerOfFullName(fullName);
    if (owner && owner !== params.userId) {
      throw new Error("Business name already taken");
    }

    const address = params.address ?? mockWalletAddress(`${params.userId}:business:${slug}`);
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM ens_claims WHERE user_id = $1 AND kind = 'business' LIMIT 1`,
      [params.userId],
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE ens_claims
         SET slug = $2, full_name = $3, parent_domain = $4, visibility = 'public',
             address = $5, updated_at = now()
         WHERE user_id = $1 AND kind = 'business'`,
        [params.userId, slug, fullName, parent, address],
      );
    } else {
      await pool.query(
        `INSERT INTO ens_claims (user_id, kind, slug, full_name, parent_domain, visibility, address)
         VALUES ($1, 'business', $2, $3, $4, 'public', $5)`,
        [params.userId, slug, fullName, parent, address],
      );
    }

    await pushClaimToGateway({ fullName, address, visibility: "public" });
    return { kind: "business", slug, fullName, visibility: "public", address };
  }

  const rows = await loadClaimsForUser(params.userId);
  const businessRow = rows.find((r) => r.kind === "business");
  if (!businessRow) throw new Error("Claim a business name first");

  const fullName = agentFullName(slug, businessRow.slug, parent);
  const existingAgent = rows.find((r) => r.kind === "agent" && r.slug === slug);
  if (existingAgent) {
    await pushClaimToGateway({
      fullName,
      address: existingAgent.address,
      visibility: existingAgent.visibility,
    });
    return {
      kind: "agent",
      slug,
      fullName,
      visibility: existingAgent.visibility,
      address: existingAgent.address,
    };
  }

  const owner = await findOwnerOfFullName(fullName);
  if (owner && owner !== params.userId) {
    throw new Error("Agent name already taken");
  }

  const address =
    params.address ?? mockWalletAddress(`${params.userId}:agent:${slug}:${randomUUID()}`);

  await pool.query(
    `INSERT INTO ens_claims (user_id, kind, slug, full_name, parent_domain, visibility, address)
     VALUES ($1, 'agent', $2, $3, $4, $5, $6)`,
    [params.userId, slug, fullName, parent, visibility, address],
  );

  await pushClaimToGateway({ fullName, address, visibility });
  return { kind: "agent", slug, fullName, visibility, address };
}

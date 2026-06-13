export type EnsVisibility = "public" | "private";

export type EnsRecordKind = "business" | "agent";

export interface EnsIdentityAgent {
  slug: string;
  fullName: string;
  visibility: EnsVisibility;
  address: string;
  createdAt: string;
}

export interface EnsIdentity {
  parent: string;
  businessSlug: string | null;
  businessFullName: string | null;
  agents: EnsIdentityAgent[];
}

export interface EnsClaimResult {
  kind: EnsRecordKind;
  slug: string;
  fullName: string;
  visibility: EnsVisibility;
  address: string;
}

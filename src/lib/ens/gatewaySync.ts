import { privateKeyToAccount } from "viem/accounts";
import { isAddress, isHex } from "viem";
import type { EnsVisibility } from "./types";

const BASE_COIN_TYPE = "2147492101"; // ENSIP-11: Base (chain 8453)
const ETH_COIN_TYPE = "60";
const GATEWAY_TTL_MS = 60 * 60 * 1000;

export type EnsGatewaySyncResult =
  | { status: "skipped"; reason: "not_configured" }
  | { status: "synced" }
  | { status: "failed"; error: string };

function gatewayBaseUrl(): string | null {
  const url = process.env.ENS_GATEWAY_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function signerPrivateKey(): `0x${string}` | null {
  const raw = process.env.ENS_GATEWAY_SIGNER_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const normalized = raw.startsWith("0x") ? raw : `0x${raw}`;
  return isHex(normalized) ? (normalized as `0x${string}`) : null;
}

function normalizeAddress(address: string): `0x${string}` {
  if (!isAddress(address)) {
    throw new Error("Invalid wallet address for gateway sync");
  }
  return address as `0x${string}`;
}

export async function syncEnsClaimToGateway(params: {
  fullName: string;
  address: string;
  visibility: EnsVisibility;
}): Promise<EnsGatewaySyncResult> {
  const baseUrl = gatewayBaseUrl();
  const privateKey = signerPrivateKey();

  if (!baseUrl || !privateKey) {
    return { status: "skipped", reason: "not_configured" };
  }

  const resolvedAddress = normalizeAddress(params.address);
  const account = privateKeyToAccount(privateKey);

  const message = {
    name: params.fullName,
    owner: account.address,
    addresses: {
      [ETH_COIN_TYPE]: resolvedAddress,
      [BASE_COIN_TYPE]: resolvedAddress,
    },
    texts: {
      "nuro.visibility": params.visibility,
    },
  };

  const signature = await account.signMessage({
    message: JSON.stringify(message),
  });

  const body = {
    signature: {
      hash: signature,
      message,
    },
    expiration: Date.now() + GATEWAY_TTL_MS,
  };

  try {
    const res = await fetch(`${baseUrl}/set`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        status: "failed",
        error: `Gateway ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      };
    }

    return { status: "synced" };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Gateway unreachable";
    return { status: "failed", error };
  }
}

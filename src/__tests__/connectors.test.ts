// Unit tests for src/connectors.ts — pure helpers (no DB).
//
// The DB-touching paths (createConnectedAgent, ingestExternalEvent etc.)
// are exercised in integration only — unit-mocking the Pool would just
// re-test the SQL strings, low value.
//
// Coverage:
//   - generateApiKey produces "nuro_ak_" prefix + 32-hex tail
//   - hashApiKey is sha256-stable
//   - api_key_prefix has length 12 (matches DB column display use)
//   - generateWebhookSecret produces "whsec_" + 48-hex tail
//   - signWebhookBody verifies via independent HMAC
//   - signature is "sha256=<hex>" Stripe-shape (so partner code can
//     port from Stripe without re-coding the verifier)

import { describe, it, expect } from "vitest";
import { createHash, createHmac } from "crypto";
import {
  generateApiKey,
  hashApiKey,
  generateWebhookSecret,
  signWebhookBody,
} from "../connectors";

describe("generateApiKey", () => {
  it("produces a 'nuro_ak_' prefix + 32 lowercase hex chars", () => {
    const k = generateApiKey();
    expect(k.plaintext).toMatch(/^nuro_ak_[0-9a-f]{32}$/);
  });

  it("hash is sha256(plaintext) hex-encoded", () => {
    const k = generateApiKey();
    const expected = createHash("sha256").update(k.plaintext).digest("hex");
    expect(k.hash).toBe(expected);
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prefix is the first 12 chars of plaintext", () => {
    const k = generateApiKey();
    expect(k.prefix.length).toBe(12);
    expect(k.plaintext.startsWith(k.prefix)).toBe(true);
    // Always starts with nuro_ak_ + 4 entropy chars.
    expect(k.prefix).toMatch(/^nuro_ak_[0-9a-f]{4}$/);
  });

  it("two calls produce distinct keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("hashApiKey", () => {
  it("is deterministic for the same input", () => {
    const k = "nuro_ak_deadbeefdeadbeefdeadbeefdeadbeef";
    expect(hashApiKey(k)).toBe(hashApiKey(k));
  });

  it("matches generateApiKey().hash for its own plaintext", () => {
    const k = generateApiKey();
    expect(hashApiKey(k.plaintext)).toBe(k.hash);
  });
});

describe("generateWebhookSecret", () => {
  it("produces a 'whsec_' prefix + 48 lowercase hex chars", () => {
    const s = generateWebhookSecret();
    expect(s).toMatch(/^whsec_[0-9a-f]{48}$/);
  });

  it("two calls produce distinct secrets", () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe("signWebhookBody", () => {
  const secret = "whsec_" + "a".repeat(48);
  const body = '{"hello":"world","ts":1700000000}';

  it("returns 'sha256=<hex>' (Stripe shape)", () => {
    const sig = signWebhookBody(body, secret);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("verifies via independent HMAC computation", () => {
    const sig = signWebhookBody(body, secret);
    const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(sig).toBe(expected);
  });

  it("differs across bodies", () => {
    expect(signWebhookBody("a", secret)).not.toBe(signWebhookBody("b", secret));
  });

  it("differs across secrets", () => {
    expect(signWebhookBody(body, "secret-a")).not.toBe(signWebhookBody(body, "secret-b"));
  });
});

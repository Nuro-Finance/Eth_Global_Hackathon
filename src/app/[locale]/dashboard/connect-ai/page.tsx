"use client";

/**
 * /dashboard/connect-ai — BYOK (Bring Your Own AI) setup page.
 *
 * Generates Nuro MCP API keys + shows copy-paste configs for plugging
 * Nuro into the user's AI client of choice (Claude Desktop, Claude Code,
 * Cursor, ChatGPT custom GPT).
 *
 * The big idea: the user's AI talks to Nuro. We expose data + tools.
 * Companion to the upcoming per-card chat agent (which runs ON TOP of
 * the same MCP tools internally).
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Copy, Check, Trash2, Sparkles, Plus, Eye, EyeOff, ExternalLink, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface KeyRow {
  id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
}

interface NewKey {
  id: string;
  raw_key: string;
  name: string;
  created_at: string;
}

const SAMPLE_HOST = typeof window !== "undefined" ? window.location.origin : "https://app.nuro.finance";

export default function ConnectAiPage() {
  const { data: session } = useSession();
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<NewKey | null>(null);
  const [showRawKey, setShowRawKey] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [keyName, setKeyName] = useState("");

  const refreshKeys = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      const r = await fetch("/api/mcp/keys", {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      const data = await r.json();
      if (data?.ok) setKeys(data.keys ?? []);
    } catch (e) {
      console.error("[connect-ai] refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken]);

  useEffect(() => {
    void refreshKeys();
  }, [refreshKeys]);

  const handleGenerate = async () => {
    if (!session?.accessToken) return;
    setGenerating(true);
    try {
      const r = await fetch("/api/mcp/keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: keyName.trim() || `Key ${new Date().toLocaleDateString()}`,
        }),
      });
      const data = await r.json();
      if (data?.ok && data?.key?.raw_key) {
        setNewKey(data.key);
        setShowRawKey(true);
        setKeyName("");
        void refreshKeys();
      } else {
        alert(data?.error ?? "Failed to generate key");
      }
    } catch (e) {
      console.error("[connect-ai] generate failed:", e);
      alert("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!session?.accessToken) return;
    if (!confirm("Revoke this key? Any AI client using it will lose access immediately.")) return;
    try {
      await fetch(`/api/mcp/keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      void refreshKeys();
    } catch (e) {
      console.error("[connect-ai] revoke failed:", e);
    }
  };

  const copy = useCallback((text: string, field: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const claudeDesktopConfig = newKey
    ? `{
  "mcpServers": {
    "nuro-finance": {
      "type": "http",
      "url": "${SAMPLE_HOST}/api/mcp",
      "headers": {
        "Authorization": "Bearer ${newKey.raw_key}"
      }
    }
  }
}`
    : "";

  const claudeCodeConfig = newKey
    ? `claude mcp add nuro-finance --transport http --url ${SAMPLE_HOST}/api/mcp --header "Authorization: Bearer ${newKey.raw_key}"`
    : "";

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Sparkles className="w-7 h-7 text-[var(--color-primary)]" />
            <h1 className="text-3xl font-bold">Connect your AI</h1>
          </div>
          <p className="text-[var(--color-text-muted)] text-sm max-w-2xl">
            Generate an API key and paste it into your AI client of choice. Your AI will be able to read your balance, transactions, and (with confirmation) adjust card limits or freeze cards. Bring your own agent — Claude, GPT, Cursor, anything that speaks MCP.
          </p>
        </header>

        {/* New key reveal — modal-like card that appears after generation */}
        <AnimatePresence>
          {newKey && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-8 bg-[var(--color-bg-secondary)] border-2 border-[var(--color-primary)] rounded-[var(--radius-lg,12px)] p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <ShieldCheck className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-[var(--color-text-primary)] mb-1">
                    Your new key — save it now
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    This is the only time you can see the full key. Copy it, paste it into your AI client's config, then keep this tab open until you've verified it works.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setNewKey(null); setShowRawKey(false); }}
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] shrink-0"
                >
                  Dismiss
                </button>
              </div>

              <div className="bg-[var(--color-bg-primary)] rounded-[10px] p-4 mb-4 border border-[var(--color-border-primary)]">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--color-text-muted)]">
                    API Key
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRawKey(!showRawKey)}
                      className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex items-center gap-1"
                    >
                      {showRawKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showRawKey ? "Hide" : "Show"}
                    </button>
                    <button
                      type="button"
                      onClick={() => copy(newKey.raw_key, "raw")}
                      className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 flex items-center gap-1 font-medium"
                    >
                      {copiedField === "raw" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedField === "raw" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
                <code className="font-mono text-sm text-[var(--color-text-primary)] break-all block select-all">
                  {showRawKey ? newKey.raw_key : "•".repeat(newKey.raw_key.length)}
                </code>
              </div>

              {/* Copy-paste configs per client */}
              <div className="space-y-4">
                <ConfigBlock
                  label="Claude Desktop"
                  hint="Add to ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%/Claude/claude_desktop_config.json (Windows). Restart Claude after editing."
                  code={claudeDesktopConfig}
                  fieldId="claude-desktop"
                  copy={copy}
                  copiedField={copiedField}
                />
                <ConfigBlock
                  label="Claude Code (CLI)"
                  hint="Run this in your terminal once. The key is stored in ~/.claude.json."
                  code={claudeCodeConfig}
                  fieldId="claude-code"
                  copy={copy}
                  copiedField={copiedField}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Generate new key card */}
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg,12px)] p-6 mb-8">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Generate a new key
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value.slice(0, 80))}
              placeholder="Key name (e.g. 'My Claude Desktop')"
              disabled={generating}
              className="flex-1 h-10 px-3 bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[10px] text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)]/40 transition-all"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className={cn(
                "h-10 px-5 rounded-[10px] bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-[var(--color-text-on-primary)] text-sm font-semibold transition-all shrink-0",
                generating && "opacity-60 cursor-wait"
              )}
            >
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>

        {/* Existing keys list */}
        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-[var(--radius-lg,12px)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--color-border-primary)]">
            <h2 className="font-semibold">Your keys</h2>
          </div>
          {loading ? (
            <div className="px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
              Loading…
            </div>
          ) : keys.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
              No keys yet. Generate one above to get started.
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-primary)]">
              {keys.map((k) => (
                <div key={k.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                        {k.name}
                      </span>
                      {(k.scopes ?? []).map((s) => (
                        <span
                          key={s}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-primary)] text-[var(--color-text-muted)] font-mono uppercase"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span className="font-mono">nuro_mcp_{k.key_prefix}…</span>
                      <span>•</span>
                      <span>Created {new Date(k.created_at).toLocaleDateString()}</span>
                      {k.last_used_at && (
                        <>
                          <span>•</span>
                          <span>Last used {new Date(k.last_used_at).toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors shrink-0"
                    aria-label="Revoke key"
                    title="Revoke key"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Help / docs */}
        <div className="mt-8 text-center">
          <a
            href="https://modelcontextprotocol.io/docs/concepts/tools"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] inline-flex items-center gap-1"
          >
            What is MCP?
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function ConfigBlock({
  label,
  hint,
  code,
  fieldId,
  copy,
  copiedField,
}: {
  label: string;
  hint: string;
  code: string;
  fieldId: string;
  copy: (text: string, field: string) => void;
  copiedField: string | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-[var(--color-text-primary)]">{label}</span>
        <button
          type="button"
          onClick={() => copy(code, fieldId)}
          className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary)]/80 flex items-center gap-1 font-medium"
        >
          {copiedField === fieldId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedField === fieldId ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] mb-2">{hint}</p>
      <pre className="bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] rounded-[8px] p-3 text-[11px] font-mono text-[var(--color-text-primary)] overflow-x-auto select-all">
        {code}
      </pre>
    </div>
  );
}

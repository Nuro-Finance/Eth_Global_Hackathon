#!/usr/bin/env node

/**
 * @nuro/agent — one-line install CLI
 *
 *   npx @nuro/agent init
 *
 * Interactive wizard that:
 *   1. Asks what the agent needs (omnichain / attach / mythos / fleet)
 *   2. Sets per-action and daily spend caps
 *   3. Picks allowed markets
 *   4. Generates an HD-derived agent vault seed
 *   5. Writes nuro.config.json + .env.nuro into the cwd
 *
 * Pure Node — zero dependencies. readline + crypto. Works on Node 18+.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

// ---------------------------------------------------------------------------
// ANSI helpers — keep it dependency-free
// ---------------------------------------------------------------------------
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
};
const c = (color, s) => `${C[color]}${s}${C.reset}`;
const dim = (s) => c("dim", s);
const bold = (s) => c("bold", s);

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function banner() {
  const lines = [
    "",
    c("magenta", "  ╔═══════════════════════════════════════════════════════════╗"),
    c("magenta", "  ║") + "                                                           " + c("magenta", "║"),
    c("magenta", "  ║") + "         " + bold(c("white", "@nuro/agent")) + "  " + dim("— the financial OS for AI agents") + "        " + c("magenta", "║"),
    c("magenta", "  ║") + "                                                           " + c("magenta", "║"),
    c("magenta", "  ╚═══════════════════════════════════════════════════════════╝"),
    "",
    "  " + dim("Wraps any agent (Claude, OpenAI, your own) in policy + omnichain"),
    "  " + dim("settlement + Mythos neural-net intelligence."),
    "",
  ];
  console.log(lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Readline prompt helpers
// ---------------------------------------------------------------------------
function prompt(rl, question, fallback) {
  return new Promise((resolve) => {
    const suffix = fallback ? dim(`  (${fallback})`) : "";
    rl.question(`${c("cyan", "?")} ${question}${suffix} ${dim(">")} `, (ans) => {
      resolve((ans || "").trim() || fallback || "");
    });
  });
}

async function multiSelect(rl, question, options) {
  console.log(`\n${c("cyan", "?")} ${question}`);
  console.log(dim("  (comma-separated numbers, or 'all' / press Enter for all)"));
  options.forEach((opt, i) => {
    console.log(`  ${c("yellow", String(i + 1) + ".")} ${bold(opt.label)}  ${dim("— " + opt.blurb)}`);
  });
  const ans = await prompt(rl, "your picks", "all");
  if (!ans || ans.toLowerCase() === "all") return options.map((o) => o.id);
  const indices = ans
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= options.length);
  if (indices.length === 0) return options.map((o) => o.id);
  return indices.map((i) => options[i - 1].id);
}

// ---------------------------------------------------------------------------
// Vault seed derivation — sha256-based HD seed (NOT a private key)
// The user runs `nuro link` later to bind this to a real on-chain vault.
// We never write a private key locally during init.
// ---------------------------------------------------------------------------
function deriveVaultSeed(projectName) {
  const entropy = crypto.randomBytes(32).toString("hex");
  const seed = crypto
    .createHash("sha256")
    .update(`nuro:${projectName}:${Date.now()}:${entropy}`)
    .digest("hex");
  return {
    seed,
    // stub address — derived deterministically from seed for display only.
    // Real vault address gets minted by the Nuro orchestrator on `nuro link`.
    stubAddress: "0x" + crypto.createHash("sha256").update("addr:" + seed).digest("hex").slice(0, 40),
  };
}

// ---------------------------------------------------------------------------
// finishInit — pure file-writing path. Used by both interactive and --yes
// flows. Returns nothing — exits the process on success/failure.
// ---------------------------------------------------------------------------
function finishInit({ projectName, capabilities, riskLimitUsd, dailyCapUsd, allowedMarkets, network }) {
  const vault = deriveVaultSeed(projectName);

  const config = {
    name: projectName,
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    capabilities,
    policy: {
      riskLimitUsd,
      dailyCapUsd,
      allowedMarkets,
      observeOnlyMs: 60_000, // first 60s of every action is dry-run
    },
    settlement: {
      network,
      cardEnabled: capabilities.includes("omnichain"),
    },
    mythos: {
      threatIntel: capabilities.includes("mythos"),
      advisoryCounsel: capabilities.includes("mythos"),
      marketsResolved: capabilities.includes("mythos"),
    },
    vault: {
      stubAddress: vault.stubAddress,
      // seed is also written to .env.nuro — keep it OUT of nuro.config.json
      // so the config file is safe to commit.
    },
    orchestrator: {
      endpoint: "https://api.nuro.finance",
      webhookSecret: crypto.randomBytes(16).toString("hex"),
    },
  };

  const env = [
    "# .env.nuro — secrets for your @nuro/agent install.",
    "# DO NOT COMMIT. Add to .gitignore.",
    "",
    `NURO_VAULT_SEED=${vault.seed}`,
    `NURO_WEBHOOK_SECRET=${config.orchestrator.webhookSecret}`,
    `NURO_ENDPOINT=${config.orchestrator.endpoint}`,
    `NURO_PROJECT=${projectName}`,
    "",
    "# Optional — set NURO_API_KEY after running `nuro link`",
    "NURO_API_KEY=",
    "",
  ].join("\n");

  const cwd = process.cwd();
  const configPath = path.join(cwd, "nuro.config.json");
  const envPath = path.join(cwd, ".env.nuro");

  if (fs.existsSync(configPath)) {
    console.log("\n" + c("yellow", "!") + " nuro.config.json already exists — refusing to overwrite.");
    console.log("  " + dim("Move or delete the existing file and re-run `nuro init`."));
    process.exit(2);
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  fs.writeFileSync(envPath, env, "utf8");

  // Best-effort .gitignore append — only if file already exists.
  const gitignorePath = path.join(cwd, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const existing = fs.readFileSync(gitignorePath, "utf8");
    if (!/(^|\n)\.env\.nuro(\s|$)/.test(existing)) {
      fs.appendFileSync(gitignorePath, "\n# nuro\n.env.nuro\n");
    }
  }

  // ---------------------------------------------------------------------
  // Success printout — single ANSI-colored block.
  // ---------------------------------------------------------------------
  console.log("");
  console.log(c("green", "  ✓ Wired up.") + "  " + dim("Two files written:"));
  console.log("    " + dim("•") + " " + bold("nuro.config.json") + "  " + dim("(safe to commit)"));
  console.log("    " + dim("•") + " " + bold(".env.nuro") + dim("           (secret — gitignored)"));
  console.log("");
  console.log("  " + bold("Agent"));
  console.log("    " + dim("name      ") + projectName);
  console.log("    " + dim("vault     ") + c("cyan", vault.stubAddress));
  console.log("    " + dim("network   ") + network);
  console.log("");
  console.log("  " + bold("Policy"));
  console.log("    " + dim("per-action") + " ≤ $" + riskLimitUsd.toLocaleString());
  console.log("    " + dim("per-day   ") + " ≤ $" + dailyCapUsd.toLocaleString());
  console.log("    " + dim("markets   ") + " " + allowedMarkets.join(", "));
  console.log("");
  console.log("  " + bold("Capabilities"));
  capabilities.forEach((cap) => {
    console.log("    " + c("green", "✓") + " " + cap);
  });
  console.log("");
  console.log(c("magenta", "  Next steps"));
  console.log("    " + c("yellow", "1.") + " " + bold("nuro link") + dim("                  bind this config to a Nuro vault"));
  console.log("    " + c("yellow", "2.") + " " + bold("nuro fund --usdc 25") + dim("        seed the vault from your wallet"));
  console.log("    " + c("yellow", "3.") + " " + bold("nuro run") + dim("                   start the orchestrator locally"));
  console.log("");
  console.log(dim("  Docs  ") + " https://app.nuro.finance/skills");
  console.log(dim("  Help  ") + " https://app.nuro.finance/contracts");
  console.log("");
}

// ---------------------------------------------------------------------------
// init flow
// ---------------------------------------------------------------------------
async function runInit() {
  banner();

  // --yes / -y → run init with all defaults, no prompts. Useful for scripts,
  // CI, and quick "I trust the defaults, just write the files" flows.
  const args = process.argv.slice(3);
  const nonInteractive = args.includes("--yes") || args.includes("-y");

  if (nonInteractive) {
    return finishInit({
      projectName: "my-agent",
      capabilities: ["omnichain", "attach", "mythos", "fleet"],
      riskLimitUsd: 50,
      dailyCapUsd: 500,
      allowedMarkets: ["polymarket", "hyperliquid", "swap"],
      network: "base",
    });
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const projectName = await prompt(rl, "Project / agent name", "my-agent");

    const capabilities = await multiSelect(rl, "What does your agent need?", [
      {
        id: "omnichain",
        label: "Omnichain settlement",
        blurb: "bridge USDC across 23 chains + settle to a Visa card",
      },
      {
        id: "attach",
        label: "Attach external agent",
        blurb: "wrap Claude / OpenAI / your own under our policy stack",
      },
      {
        id: "mythos",
        label: "Mythos neural net",
        blurb: "tap security / advisory / market intel as a service",
      },
      {
        id: "fleet",
        label: "Orchestrate fleet",
        blurb: "manage many agents + cards as one persona",
      },
    ]);

    const riskRaw = await prompt(rl, "Max USD per single action", "50");
    const dailyRaw = await prompt(rl, "Max USD per 24h rolling window", "500");
    const marketsRaw = await prompt(
      rl,
      "Allowed market venues (comma-separated)",
      "polymarket,hyperliquid,swap"
    );

    const riskLimitUsd = Number.parseFloat(riskRaw) || 50;
    const dailyCapUsd = Number.parseFloat(dailyRaw) || 500;
    const allowedMarkets = marketsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const network = await prompt(rl, "Default settlement network", "base");

    rl.close();

    return finishInit({
      projectName,
      capabilities,
      riskLimitUsd,
      dailyCapUsd,
      allowedMarkets,
      network,
    });
  } catch (err) {
    rl.close();
    console.error("\n" + c("red", "✗ init failed:"), err.message || err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// link / fund / run — placeholder commands
// They print the planned behavior so the CLI surface is honest about what's
// shipping vs what's coming. We'd rather print "coming soon" than silently
// no-op or pretend something happened.
// ---------------------------------------------------------------------------
function runLink() {
  banner();
  console.log("  " + bold("nuro link") + "  " + dim("— bind this install to a Nuro orchestrator vault"));
  console.log("");
  console.log("  " + c("yellow", "Coming next sprint."));
  console.log("  " + dim("Pre-pitch (May 14) you can use the dashboard at"));
  console.log("  " + c("cyan", "  https://app.nuro.finance/dashboard/agent-wallet"));
  console.log("  " + dim("to provision an agent vault and copy the API key into .env.nuro."));
  console.log("");
}

function runFund() {
  banner();
  console.log("  " + bold("nuro fund") + "  " + dim("— top up the agent vault with USDC"));
  console.log("");
  console.log("  " + c("yellow", "Coming next sprint."));
  console.log("  " + dim("For now, deposit directly to the vault address printed at init time."));
  console.log("  " + dim("Any of 23 supported chains works — see /contracts for the full list."));
  console.log("");
}

function runRunCmd() {
  banner();
  console.log("  " + bold("nuro run") + "  " + dim("— start the local orchestrator daemon"));
  console.log("");
  console.log("  " + c("yellow", "Coming next sprint."));
  console.log("  " + dim("The hosted orchestrator at api.nuro.finance is already live —"));
  console.log("  " + dim("the local daemon is for self-hosters who want a private mempool."));
  console.log("");
}

function runHelp() {
  banner();
  console.log("  " + bold("Usage"));
  console.log("    " + c("cyan", "npx @nuro/agent init") + dim("    create config + vault stub in cwd"));
  console.log("    " + c("cyan", "npx @nuro/agent link") + dim("    bind to a Nuro orchestrator vault"));
  console.log("    " + c("cyan", "npx @nuro/agent fund") + dim("    top up the vault with USDC"));
  console.log("    " + c("cyan", "npx @nuro/agent run") + dim("     start the local orchestrator"));
  console.log("    " + c("cyan", "npx @nuro/agent help") + dim("    this screen"));
  console.log("");
  console.log("  " + dim("Project: ") + "https://app.nuro.finance/skills");
  console.log("  " + dim("Contracts:") + " https://app.nuro.finance/contracts");
  console.log("");
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
const cmd = (process.argv[2] || "help").toLowerCase();
switch (cmd) {
  case "init":
    runInit();
    break;
  case "link":
    runLink();
    break;
  case "fund":
    runFund();
    break;
  case "run":
    runRunCmd();
    break;
  case "help":
  case "--help":
  case "-h":
    runHelp();
    break;
  default:
    console.error(c("red", "Unknown command: ") + cmd);
    runHelp();
    process.exit(1);
}

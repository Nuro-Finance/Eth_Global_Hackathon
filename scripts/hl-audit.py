#!/usr/bin/env python3
"""S31 H2 — Initial HL vault audit. Pulls the public vault leaderboard,
filters to active >= $1M TVL, scores against the rubric in
Neural Net/Claude Memory/Hyperliquid Audit Rubric.md, and prints a
sign-off-ready summary.

Per-vault drawdown isn't reliable from the public Info API (the
accountValueHistory mixes deposits/withdrawals into the equity series,
producing junk APR/dd numbers). For the first pass we use:
  - TVL + APR + age from the public leaderboard (HL-canonical numbers)
  - Drawdown is left as 'manual-followup' for the candidates that
    pass the other axes
"""
import json
import subprocess
import time

# Filtered candidate set — top 25 active >= $1M, hand-pruned to skip
# obvious "internal" vaults (HLP variants — verified protocol team but
# concentrate risk on HL's own house edge; their APR is near-zero or
# negative in current market conditions and they don't fit our
# diversified-yield thesis).
EXCLUDED_NAMES = {
    "Hyperliquidity Provider (HLP)",
    "HLP Strategy A",
    "HLP Strategy B",
    "HLP Strategy X",
    "HLP Liquidator",
    "HLP Liquidator 2",
    "HLP Liquidator 4",
}


def score_tvl(tvl):
    if tvl >= 25_000_000: return 10, "≥ $25M"
    if tvl >= 10_000_000: return 8,  "$10-25M"
    if tvl >= 5_000_000:  return 7,  "$5-10M"
    if tvl >= 2_000_000:  return 5,  "$2-5M"
    if tvl >= 1_000_000:  return 3,  "$1-2M"
    return 0, "< $1M REJECT"


def score_age(age_days):
    if age_days >= 365: return 10, "≥ 1y"
    if age_days >= 180: return 8,  "6-12mo"
    if age_days >= 90:  return 6,  "3-6mo"
    if age_days >= 60:  return 4,  "60-90d"
    if age_days >= 30:  return 2,  "30-60d"
    return 0, "< 30d REJECT"


def main():
    raw = subprocess.run(
        ["curl", "-sS", "-m", "30",
         "https://stats-data.hyperliquid.xyz/Mainnet/vaults"],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(raw)

    now_ms = int(time.time() * 1000)
    rows = []
    for v in data:
        s = v["summary"]
        if s.get("isClosed"):
            continue
        tvl = float(s["tvl"])
        if tvl < 1_000_000:
            continue
        if s["name"] in EXCLUDED_NAMES:
            continue
        age_days = (now_ms - s["createTimeMillis"]) // 86400000
        rows.append({
            "name": s["name"],
            "addr": s["vaultAddress"],
            "leader": s["leader"],
            "tvl": tvl,
            "apr_pct": v["apr"] * 100,
            "age_days": age_days,
        })

    rows.sort(key=lambda r: r["tvl"], reverse=True)
    rows = rows[:15]

    print(f"{'name':35s} {'tvl':>13s} {'apr%':>8s} {'age':>5s} {'tvl':>4s} {'age':>4s} {'leader':>8s}  notes")
    print("-" * 120)
    for r in rows:
        s_tvl, _ = score_tvl(r["tvl"])
        s_age, _ = score_age(r["age_days"])
        # Leader scoring: address-only without external research → 3/10 pseudonymous
        # default. HLP variants would be 10 (verified protocol team).
        # "Systemic Strategies" prefix suggests known group; bump to 5.
        # Name-pattern heuristic only — full leader doxx requires manual
        # Twitter/Discord/website verification per rubric.
        if "Systemic Strategies" in r["name"]:
            s_lead = 5
        elif "HLP" in r["name"]:
            s_lead = 10
        else:
            s_lead = 3
        # Drawdown not reliably extractable from public data — leave
        # as manual-followup placeholder. Score 5 (mid-tier) until
        # auditor verifies via per-vault history.
        s_dd = 5
        total = s_tvl + s_age + s_dd + s_lead
        print(f"{r['name'][:35]:35s} ${r['tvl']:>12,.0f} {r['apr_pct']:>7.1f}% {r['age_days']:>4d}d {s_tvl:>4d} {s_age:>4d} {s_lead:>8d}  total={total}/40 {'PASS' if total >= 28 else 'rev'}")
        print(f"   addr={r['addr']}  leader={r['leader']}")


if __name__ == "__main__":
    main()

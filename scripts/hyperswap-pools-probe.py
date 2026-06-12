#!/usr/bin/env python3
"""S31 H2 — probe DefiLlama yields endpoint for HyperSwap pools.
One-off. Run on VPS where curl works.
"""
import json
import subprocess

raw = subprocess.run(
    ["curl", "-sS", "-m", "20", "https://yields.llama.fi/pools"],
    capture_output=True, text=True, check=True,
).stdout
d = json.loads(raw)
data = d.get("data", [])
hs = [p for p in data if "hyperswap" in (p.get("project", "") or "").lower()]
hs.sort(key=lambda p: p.get("tvlUsd", 0) or 0, reverse=True)
print(f"hyperswap pools tracked: {len(hs)}")
print()
print(f"{'symbol':28s} {'project':18s} {'chain':18s} {'tvlUsd':>13s} {'apy%':>7s} {'apyBase%':>9s} pool-id")
print("-" * 130)
for p in hs[:30]:
    sym = p.get("symbol", "")[:28]
    proj = p.get("project", "")[:18]
    chain = p.get("chain", "")[:18]
    tvl = p.get("tvlUsd", 0) or 0
    apy = p.get("apy", 0) or 0
    base = p.get("apyBase", 0) or 0
    pid = p.get("pool", "")[:36]
    print(f"{sym:28s} {proj:18s} {chain:18s} ${tvl:>12,.0f} {apy:>7.2f}% {base:>8.2f}%  {pid}")

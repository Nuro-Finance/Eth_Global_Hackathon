"""
Nuro Resolved Markets Feed — LangChain tool wrapper.

Drop this file into your LangChain agent's tools/. The tool calls Nuro's
x402-protected /markets/resolved endpoint; payment is handled
automatically by the x402-py SDK using the agent's signing key.

Designed for high-volume training-data pulls (cheapest endpoint at
0.001 USDC / call). Use the standalone `bulk_pull` helper at the bottom
of this file to incrementally sync the full resolved-market history
into a local store.

Install:
    pip install langchain x402-py eth-account

Usage:
    from wrapper import ResolvedMarketsTool

    agent_key = "0x..."  # your agent's Base-network signing key (USDC funded)
    tool = ResolvedMarketsTool(agent_signing_key=agent_key)

    # Use it in a LangChain agent
    from langchain.agents import initialize_agent
    agent = initialize_agent([tool], llm, agent_type="...")

    # Or call directly for backtesting / ML
    result = await tool.arun({
        "limit": 200,
        "since": "2026-01-01T00:00:00Z",
        "category": "crypto",
    })
    print(result)

Cost: 0.001 USDC per call, settled on Base via x402.
Revenue vault: 0x050cdf3608664bD667586393986cF8803f1Cd1B8
Skill manifest: https://app.nuro.finance/skills/manifest.json
"""

from typing import Optional, Any, List, Dict
from langchain.tools import BaseTool
from pydantic import BaseModel, Field
from eth_account import Account
import asyncio
import json

try:
    from x402_py import X402Client
except ImportError:
    raise ImportError(
        "x402-py not installed. Run: pip install x402-py"
    )


RESOLVED_MARKETS_ENDPOINT = "https://api.nuro.finance/api/x402/markets/resolved"
DEFAULT_NETWORK = "base"  # use "base-sepolia" for testnet


class ResolvedMarketsInput(BaseModel):
    """Input schema for the resolved-markets tool."""

    limit: int = Field(
        default=50,
        description="Max rows (1-500). Default 50.",
        ge=1,
        le=500,
    )
    since: Optional[str] = Field(
        default=None,
        description="ISO-8601 lower bound for resolvedAt (e.g. '2026-01-01T00:00:00Z')",
    )
    category: Optional[str] = Field(
        default=None,
        description="Optional filter: politics | crypto | sports | other",
    )


class ResolvedMarketsTool(BaseTool):
    """LangChain tool: fetch historical resolved-market data from Nuro.

    Useful for ML training datasets, sentiment-correlation analysis,
    post-mortem analytics, and backtesting frameworks. 0.001 USDC per
    call — the cheapest endpoint in the catalog, designed for batch
    usage. Payment handled by x402-py SDK using the `agent_signing_key`
    provided at construction time.
    """

    name = "nuro_markets_resolved"
    description = (
        "Fetch historical resolved-market data (Polymarket + expanding) "
        "for ML training, sentiment-correlation, backtesting. Returns "
        "question, resolvedAt, winningSide, totalVolumeUsd, "
        "topTradersCount. 0.001 USDC per call (auto-paid via x402). "
        "Limit 500 per call; use 'since' for incremental syncs."
    )
    args_schema = ResolvedMarketsInput

    agent_signing_key: str = Field(..., description="Hex-encoded private key")
    network: str = Field(default=DEFAULT_NETWORK)
    _client: Optional[X402Client] = None

    def _get_client(self) -> X402Client:
        if self._client is None:
            account = Account.from_key(self.agent_signing_key)
            self._client = X402Client(signer=account, network=self.network)
        return self._client

    async def _arun(
        self,
        limit: int = 50,
        since: Optional[str] = None,
        category: Optional[str] = None,
        **_: Any,
    ) -> str:
        """Async invocation — preferred path for LangChain agents."""
        client = self._get_client()

        params = [f"limit={limit}"]
        if since:
            params.append(f"since={since}")
        if category:
            params.append(f"category={category}")
        url = f"{RESOLVED_MARKETS_ENDPOINT}?{'&'.join(params)}"

        response = await client.fetch(url, method="GET")

        if response.status != 200:
            return json.dumps({
                "error": f"Resolved-markets endpoint returned {response.status}",
                "body": (await response.text())[:500],
            })

        data = await response.json()
        return json.dumps({
            "markets": data.get("markets", []),
            "count": len(data.get("markets", [])),
            "fetchedAt": data.get("fetchedAt"),
            "paidUsd": 0.001,
            "settlementTxHash": response.headers.get("X-PAYMENT-RESPONSE"),
        }, indent=2)

    def _run(self, *args, **kwargs) -> str:
        """Sync fallback — wraps the async path."""
        return asyncio.run(self._arun(*args, **kwargs))


# ─── Bulk-pull helper for training-data scenarios ─────────────────────────────

async def bulk_pull(
    agent_signing_key: str,
    page_size: int = 500,
    start_since: str = "2024-01-01T00:00:00Z",
    category: Optional[str] = None,
    max_pages: int = 100,
    sleep_seconds: float = 0.1,
) -> List[Dict[str, Any]]:
    """Pull resolved markets incrementally until exhausted or max_pages hit.

    Strategy: page through using the LATEST resolvedAt as the next 'since'.
    Stops when a page returns fewer than `page_size` rows. At 0.001 USDC
    per page and 500 rows per page, full-history sync costs ~$0.10-0.30.

    Returns the concatenated list of market objects.
    """
    tool = ResolvedMarketsTool(agent_signing_key=agent_signing_key)
    all_markets: List[Dict[str, Any]] = []
    current_since = start_since

    for _ in range(max_pages):
        raw = await tool._arun(limit=page_size, since=current_since, category=category)
        page = json.loads(raw)
        markets = page.get("markets", [])
        if not markets:
            break
        all_markets.extend(markets)
        # Advance cursor to the most recent resolvedAt seen in this page
        latest = max(m.get("resolvedAt", "") for m in markets)
        if not latest or latest <= current_since:
            break
        current_since = latest
        if len(markets) < page_size:
            break
        await asyncio.sleep(sleep_seconds)

    return all_markets


# ─── Standalone test ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os
    key = os.environ.get("NURO_AGENT_KEY")
    if not key:
        print("Set NURO_AGENT_KEY environment variable to your hex private key.")
        print("The address must be USDC-funded on Base (or Base Sepolia for testnet).")
        exit(1)

    tool = ResolvedMarketsTool(agent_signing_key=key)
    result = asyncio.run(tool._arun(limit=10, category="crypto"))
    print(result)

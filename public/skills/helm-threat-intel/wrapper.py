"""
Nuro Heimdall Threat Intelligence — LangChain tool wrapper.

Drop this file into your LangChain agent's tools/. The tool calls Nuro's
x402-protected /heimdall/threat-intel endpoint; payment is handled
automatically by the x402-py SDK using the agent's signing key.

Install:
    pip install langchain x402-py eth-account

Usage:
    from wrapper import HeimdallThreatIntelTool

    agent_key = "0x..."  # your agent's Base-network signing key (USDC funded)
    tool = HeimdallThreatIntelTool(agent_signing_key=agent_key)

    # Use it in a LangChain agent
    from langchain.agents import initialize_agent
    agent = initialize_agent([tool], llm, agent_type="...")

    # Or call directly
    result = await tool.arun({"armedOnly": True, "minSeverity": "high"})
    print(result)

Cost: 0.10 USDC per call, settled on Base via x402.
Revenue vault: 0x050cdf3608664bD667586393986cF8803f1Cd1B8
Skill manifest: https://app.nuro.finance/skills/manifest.json
"""

from typing import Optional, List, Dict, Any
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


HEIMDALL_ENDPOINT = "https://api.nuro.finance/api/x402/heimdall/threat-intel"
DEFAULT_NETWORK = "base"  # use "base-sepolia" for testnet


class HeimdallThreatIntelInput(BaseModel):
    """Input schema for the Heimdall threat-intel tool."""

    ruleFilter: Optional[str] = Field(
        default=None,
        description="Rule-id prefix filter (e.g. 'HEIM-1' for HEIM-100..199)",
    )
    minSeverity: Optional[str] = Field(
        default=None,
        description="Minimum severity: low, medium, high, critical",
    )
    armedOnly: Optional[bool] = Field(
        default=False,
        description="If True, return only rules with armed=true",
    )


class HeimdallThreatIntelTool(BaseTool):
    """LangChain tool: fetch Heimdall threat intelligence from Nuro.

    Costs 0.10 USDC per call. Payment handled by x402-py SDK using the
    `agent_signing_key` provided at construction time. The agent's vault
    must have USDC + ETH on the configured network (default Base).
    """

    name = "nuro_heimdall_threat_intel"
    description = (
        "Get live security-rule status from Nuro's Heimdall plane: "
        "53 rules with mode (observe/enforce), 24h fire count, FP rate, "
        "ready-to-enforce flag. Use for security audits, posture checks, "
        "SIEM exports. 0.10 USDC per call (auto-paid via x402)."
    )
    args_schema = HeimdallThreatIntelInput

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
        ruleFilter: Optional[str] = None,
        minSeverity: Optional[str] = None,
        armedOnly: bool = False,
        **_: Any,
    ) -> str:
        """Async invocation — preferred path for LangChain agents."""
        client = self._get_client()
        response = await client.fetch(HEIMDALL_ENDPOINT, method="GET")

        if response.status != 200:
            return json.dumps({
                "error": f"Heimdall endpoint returned {response.status}",
                "body": (await response.text())[:500],
            })

        data = await response.json()
        rules = data.get("rules", [])

        # Apply filters client-side (server returns the full set)
        if ruleFilter:
            rules = [r for r in rules if r.get("id", "").startswith(ruleFilter)]
        if minSeverity:
            severity_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
            min_idx = severity_order.get(minSeverity, 0)
            rules = [
                r for r in rules
                if severity_order.get(r.get("severity", "low"), 0) >= min_idx
            ]
        if armedOnly:
            rules = [r for r in rules if r.get("armed")]

        return json.dumps({
            "summary": data.get("summary", {}),
            "rules": rules,
            "fetchedAt": data.get("fetchedAt"),
            "filteredCount": len(rules),
            "paidUsd": 0.10,
            "settlementTxHash": response.headers.get("X-PAYMENT-RESPONSE"),
        }, indent=2)

    def _run(self, *args, **kwargs) -> str:
        """Sync fallback — wraps the async path."""
        return asyncio.run(self._arun(*args, **kwargs))


# ─── Standalone test ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os
    key = os.environ.get("NURO_AGENT_KEY")
    if not key:
        print("Set NURO_AGENT_KEY environment variable to your hex private key.")
        print("The address must be USDC-funded on Base (or Base Sepolia for testnet).")
        exit(1)

    tool = HeimdallThreatIntelTool(agent_signing_key=key)
    result = asyncio.run(tool._arun(armedOnly=True, minSeverity="high"))
    print(result)

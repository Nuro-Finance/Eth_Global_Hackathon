"""
Nuro Huginn Counsel — LangChain tool wrapper.

Drop this file into your LangChain agent's tools/. The tool POSTs to
Nuro's x402-protected /huginn/counsel endpoint; payment is handled
automatically by the x402-py SDK using the agent's signing key.

Install:
    pip install langchain x402-py eth-account

Usage:
    from wrapper import HuginnCounselTool

    agent_key = "0x..."  # your agent's Base-network signing key (USDC funded)
    tool = HuginnCounselTool(agent_signing_key=agent_key)

    # Use it in a LangChain agent
    from langchain.agents import initialize_agent
    agent = initialize_agent([tool], llm, agent_type="...")

    # Or call directly
    result = await tool.arun({
        "proposerAgentId": "0xYOUR_AGENT",
        "actionType": "swap",
        "actionSubject": "swap 500 USDC -> WBTC on Base",
        "valueUsd": 500,
        "chainId": 8453,
    })
    print(result)

Cost: 0.005 USDC per call, settled on Base via x402.
Revenue vault: 0x050cdf3608664bD667586393986cF8803f1Cd1B8
Skill manifest: https://app.nuro.finance/skills/manifest.json
"""

from typing import Optional, Dict, Any
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


HUGINN_ENDPOINT = "https://api.nuro.finance/api/x402/huginn/counsel"
DEFAULT_NETWORK = "base"  # use "base-sepolia" for testnet


class HuginnCounselInput(BaseModel):
    """Input schema for the Huginn counsel tool."""

    proposerAgentId: str = Field(
        ...,
        description="Your agent's UUID or wallet address (used to look up reputation tier)",
    )
    actionType: str = Field(
        ...,
        description="One of: transfer, bet, swap, bridge, message, spend",
    )
    actionSubject: str = Field(
        ...,
        description="Human-readable description (e.g. 'place 100 USDC on Polymarket Trump-2028')",
    )
    valueUsd: float = Field(
        ...,
        description="USD value of the action — folds into Heimdall tx-cap + tier caution checks",
        ge=0,
    )
    chainId: Optional[int] = Field(
        default=None,
        description="EVM chain id (or -1 for Solana). Helps Huginn assess chain-specific risk.",
    )
    reasoning: Optional[str] = Field(
        default=None,
        description="Optional: your agent's own reasoning for the action",
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional arbitrary context (market id, counterparty info, etc.)",
    )


class HuginnCounselTool(BaseTool):
    """LangChain tool: get an advisory verdict from Nuro's Huginn.

    Returns one of {endorse, caution, dissent, block-recommend} with
    reasoning + confidence + the Heimdall rules that fired. Costs 0.005
    USDC per call (cheap — designed to be called liberally before any
    high-value action). Payment handled by x402-py SDK using the
    `agent_signing_key` provided at construction time.
    """

    name = "nuro_huginn_counsel"
    description = (
        "POST a proposed action to Huginn — Nuro's rule-bank advisory "
        "agent — and get a verdict (endorse/caution/dissent/block-recommend) "
        "with reasoning + confidence. Use BEFORE high-value transfers, "
        "unusual swaps, novel-destination bridges, or any action where a "
        "second opinion is cheap insurance. 0.005 USDC per call (auto-paid "
        "via x402)."
    )
    args_schema = HuginnCounselInput

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
        proposerAgentId: str,
        actionType: str,
        actionSubject: str,
        valueUsd: float,
        chainId: Optional[int] = None,
        reasoning: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **_: Any,
    ) -> str:
        """Async invocation — preferred path for LangChain agents."""
        client = self._get_client()

        body = {
            "proposerAgentId": proposerAgentId,
            "actionType": actionType,
            "actionSubject": actionSubject,
            "valueUsd": valueUsd,
        }
        if chainId is not None:
            body["chainId"] = chainId
        if reasoning:
            body["reasoning"] = reasoning
        if metadata:
            body["metadata"] = metadata

        response = await client.fetch(
            HUGINN_ENDPOINT,
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps(body),
        )

        if response.status != 200:
            return json.dumps({
                "error": f"Huginn endpoint returned {response.status}",
                "body": (await response.text())[:500],
            })

        data = await response.json()
        return json.dumps({
            "verdict": data.get("verdict"),
            "confidence": data.get("confidence"),
            "reasoning": data.get("reasoning"),
            "rulesFired": data.get("rulesFired", []),
            "tier": data.get("tier"),
            "tierMultiplier": data.get("tierMultiplier"),
            "predictionId": data.get("predictionId"),
            "paidUsd": 0.005,
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

    tool = HuginnCounselTool(agent_signing_key=key)
    result = asyncio.run(tool._arun(
        proposerAgentId=Account.from_key(key).address,
        actionType="swap",
        actionSubject="swap 500 USDC -> WBTC on Base",
        valueUsd=500,
        chainId=8453,
        reasoning="rebalance into majors per strategy",
    ))
    print(result)

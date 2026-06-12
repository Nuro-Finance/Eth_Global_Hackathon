"""
Nuro Sandbox Spawn — LangChain tool wrapper.

Drop this file into your LangChain agent's tools/. The tool POSTs to
Nuro's x402-protected /sandbox/spawn endpoint; payment is handled
automatically by the x402-py SDK using the agent's signing key.

Spawning a sandbox is "pay now, exercise later" — once the session is
live, you can hit the returned rpcUrl with any RPC client (web3.py,
ethers, viem) and run your agent's full execution path against real
on-chain state for the TTL window. No further x402 charges during the
session.

Install:
    pip install langchain x402-py eth-account web3

Usage:
    from wrapper import SandboxSpawnTool

    agent_key = "0x..."  # your agent's Base-network signing key (USDC funded)
    tool = SandboxSpawnTool(agent_signing_key=agent_key)

    # Use it in a LangChain agent
    from langchain.agents import initialize_agent
    agent = initialize_agent([tool], llm, agent_type="...")

    # Or call directly + use the returned rpcUrl
    spawn = json.loads(await tool.arun({"fork": "base", "ttlMinutes": 60}))
    from web3 import Web3
    w3 = Web3(Web3.HTTPProvider(spawn["rpcUrl"]))
    # ... drive your agent against the sandbox ...

Cost: 0.50 USDC per spawn, settled on Base via x402.
Revenue vault: 0x050cdf3608664bD667586393986cF8803f1Cd1B8
Skill manifest: https://app.nuro.finance/skills/manifest.json
"""

from typing import Optional, Any, Dict
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


SANDBOX_SPAWN_ENDPOINT = "https://api.nuro.finance/api/x402/sandbox/spawn"
SANDBOX_BASE = "https://api.nuro.finance/sandbox"  # for status / destroy
DEFAULT_NETWORK = "base"  # use "base-sepolia" for testnet


class SandboxSpawnInput(BaseModel):
    """Input schema for the sandbox-spawn tool."""

    fork: str = Field(
        ...,
        description="Mainnet chain to fork: 'base' | 'arbitrum' | 'polygon'",
    )
    blockNumber: Optional[int] = Field(
        default=None,
        description="Block number to fork from (null = latest)",
    )
    ttlMinutes: int = Field(
        default=60,
        description="Session lifetime in minutes (1-240). Default 60.",
        ge=1,
        le=240,
    )
    label: Optional[str] = Field(
        default=None,
        description="Optional human-readable tag for debugging",
        max_length=64,
    )


class SandboxSpawnTool(BaseTool):
    """LangChain tool: spawn an isolated Anvil mainnet-fork sandbox.

    Returns sessionId + rpcUrl + scratchSchema + expiresAt. Use rpcUrl
    with any RPC client to drive your agent's full execution path
    against real on-chain state. The agentic-finance differentiator
    nobody else offers. 0.50 USDC per spawn (priciest endpoint —
    reflects real compute cost). Payment handled by x402-py SDK using
    the `agent_signing_key` provided at construction time.
    """

    name = "nuro_sandbox_spawn"
    description = (
        "Spawn an isolated Anvil mainnet-fork sandbox (default 1-hr TTL) "
        "for safe agent testing. Returns RPC endpoint + scratch schema + "
        "pre-funded test wallet. Exercise your agent against real on-chain "
        "state — approvals, swaps, settlement, bridge attestations — without "
        "risking real money. 0.50 USDC per spawn (auto-paid via x402)."
    )
    args_schema = SandboxSpawnInput

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
        fork: str,
        blockNumber: Optional[int] = None,
        ttlMinutes: int = 60,
        label: Optional[str] = None,
        **_: Any,
    ) -> str:
        """Async invocation — preferred path for LangChain agents."""
        client = self._get_client()

        body: Dict[str, Any] = {"fork": fork, "ttlMinutes": ttlMinutes}
        if blockNumber is not None:
            body["blockNumber"] = blockNumber
        if label:
            body["label"] = label

        response = await client.fetch(
            SANDBOX_SPAWN_ENDPOINT,
            method="POST",
            headers={"Content-Type": "application/json"},
            body=json.dumps(body),
        )

        if response.status != 200:
            return json.dumps({
                "error": f"Sandbox-spawn endpoint returned {response.status}",
                "body": (await response.text())[:500],
            })

        data = await response.json()
        return json.dumps({
            "sessionId": data.get("sessionId"),
            "rpcUrl": data.get("rpcUrl"),
            "scratchSchema": data.get("scratchSchema"),
            "expiresAt": data.get("expiresAt"),
            "fundingTxHash": data.get("fundingTxHash"),
            "statusUrl": f"{SANDBOX_BASE}/{data.get('sessionId')}/status",
            "destroyUrl": f"{SANDBOX_BASE}/{data.get('sessionId')}/destroy",
            "paidUsd": 0.50,
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

    tool = SandboxSpawnTool(agent_signing_key=key)
    result = asyncio.run(tool._arun(
        fork="base",
        ttlMinutes=60,
        label="standalone-wrapper-test",
    ))
    print(result)
    print()
    print("Next: point your web3 / ethers / viem client at rpcUrl and drive your agent.")

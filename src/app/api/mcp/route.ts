/**
 * Nuro MCP Server — JSON-RPC 2.0 endpoint
 *
 * External AI clients (Claude Desktop, Cursor, Claude Code, etc.) POST here
 * with bearer-token auth. Supports MCP protocol methods:
 *   - initialize        → returns server capabilities
 *   - tools/list        → returns the 6 tool schemas
 *   - tools/call        → dispatches a tool by name with args
 *
 * GET returns a minimal capability descriptor for clients that discover via GET.
 *
 * Auth: Authorization: Bearer nuro_mcp_<32hex>
 */

import { NextRequest, NextResponse } from "next/server";
import { extractMcpToken, resolveMcpKey } from "@/lib/mcp-auth";
import { MCP_TOOLS, dispatchMcpTool } from "@/lib/mcp-tools";

const NURO_MCP_SERVER_INFO = {
  name: "Nuro Finance",
  version: "0.1.0",
  description:
    "Query your Nuro Finance account, view transactions, manage card limits, freeze cards. BYOK pattern: bring your own AI; we expose the data + tools.",
};

const NURO_MCP_CAPABILITIES = {
  tools: { listChanged: false },
  // Add resources/prompts capabilities here when we ship those.
};

function jsonRpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message, data } },
    { status: code === -32600 || code === -32700 ? 400 : code === -32601 ? 404 : 200 }
  );
}

export async function GET(_request: NextRequest) {
  // Discovery: returns server identity + capabilities without auth.
  // Auth is required for actual tool calls (POST).
  return NextResponse.json({
    server: NURO_MCP_SERVER_INFO,
    capabilities: NURO_MCP_CAPABILITIES,
    transport: "http",
    endpoint: "/api/mcp",
    auth: "Bearer token (Authorization header)",
    docs: "/dashboard/connect-ai",
  });
}

export async function POST(request: NextRequest) {
  // Parse the JSON-RPC envelope
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: any };
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return jsonRpcError(body.id ?? null, -32600, "Invalid Request");
  }

  // initialize is the only method that doesn't strictly require auth — clients
  // call it before they have a key to learn what the server offers. We still
  // return server info without auth so discovery works.
  if (body.method === "initialize") {
    return jsonRpcResult(body.id, {
      protocolVersion: "2024-11-05",
      capabilities: NURO_MCP_CAPABILITIES,
      serverInfo: NURO_MCP_SERVER_INFO,
    });
  }

  // Everything else requires auth
  const token = extractMcpToken(request.headers.get("authorization"));
  if (!token) {
    return jsonRpcError(body.id ?? null, -32001, "Missing or malformed bearer token", {
      hint: "Set Authorization: Bearer nuro_mcp_<32hex>",
    });
  }

  const auth = await resolveMcpKey(token);
  if (!auth.ok) {
    return jsonRpcError(body.id ?? null, -32001, "Unauthorized", { detail: auth.error });
  }

  const ctx = {
    user_id: auth.user_id!,
    key_id: auth.key_id!,
    scopes: auth.scopes ?? ["read"],
  };

  // tools/list
  if (body.method === "tools/list") {
    // Filter to scopes — write tools only surface if the key has 'write' scope.
    const hasWrite = ctx.scopes.includes("write");
    const tools = MCP_TOOLS.filter((t) => {
      const isWrite = t.name === "set_card_limit" || t.name === "freeze_card";
      return !isWrite || hasWrite;
    });
    return jsonRpcResult(body.id, { tools });
  }

  // tools/call
  if (body.method === "tools/call") {
    const toolName = body.params?.name;
    const toolArgs = body.params?.arguments ?? {};
    if (typeof toolName !== "string") {
      return jsonRpcError(body.id ?? null, -32602, "Invalid params: missing name");
    }
    const isWrite = toolName === "set_card_limit" || toolName === "freeze_card";
    if (isWrite && !ctx.scopes.includes("write")) {
      return jsonRpcError(body.id ?? null, -32001, "Key does not have write scope");
    }
    const result = await dispatchMcpTool(toolName, toolArgs, ctx);
    if (!result.ok) {
      return jsonRpcResult(body.id, {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      });
    }
    // MCP expects content as an array of {type, ...}
    const textContent =
      typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content, null, 2);
    return jsonRpcResult(body.id, {
      content: [{ type: "text", text: textContent }],
    });
  }

  return jsonRpcError(body.id ?? null, -32601, `Method not found: ${body.method}`);
}

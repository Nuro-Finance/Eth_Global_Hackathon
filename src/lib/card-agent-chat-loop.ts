/**
 * Per-card agent chat - multi-provider BYOK tool loop (OpenAI / Anthropic / Gemini).
 * Extracted from nuro-routes.ts; tool registry + execution unchanged.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  getToolByName,
  toolsForAnthropic,
  toolsForGemini,
  toolsForOpenAI,
  type AgentToolResult,
  type CardChatContext,
} from "./agent-tools";
import {
  CHAT_PROVIDER_MODELS,
  type ChatLlmProvider,
  type ChatModelTier,
} from "./chat-provider-models";

const MAX_TURNS = 5;

export type CardAgentChatTurnResult = {
  assistantText: string;
  toolsFired: string[];
  stateChanges: Array<{ entity: string; id: string; patch: Record<string, unknown> }>;
  inputTokensTotal: number;
  outputTokensTotal: number;
  model: string;
};

type SimpleMessage = { role: "user" | "assistant"; content: string };

async function runAgentTool(
  toolName: string,
  input: unknown,
  toolCtx: CardChatContext,
  toolsFired: string[],
  stateChanges: CardAgentChatTurnResult["stateChanges"],
): Promise<{ content: string; isError: boolean }> {
  const tool = getToolByName(toolName);
  if (!tool) {
    return { content: `Tool '${toolName}' is not registered.`, isError: true };
  }

  if (tool.tier === "confirms-on-execute") {
    return {
      content:
        "CONFIRM_REQUIRED: this tool needs user confirmation. Pause and wait for click. (Day 2 UI work pending.)",
      isError: false,
    };
  }

  const out: AgentToolResult = await tool.execute(input, toolCtx);
  if (out.ok) {
    toolsFired.push(toolName);
    if (out.stateChange) {
      stateChanges.push(out.stateChange);
    }
  }
  return {
    content: JSON.stringify(out.ok ? (out.result ?? { ok: true }) : { error: out.error }),
    isError: !out.ok,
  };
}

async function runAnthropicTurn(
  apiKey: string,
  tier: ChatModelTier,
  system: string,
  messages: SimpleMessage[],
  toolCtx: CardChatContext,
): Promise<CardAgentChatTurnResult> {
  const client = new Anthropic({ apiKey });
  const model = CHAT_PROVIDER_MODELS.anthropic[tier];
  const tools = toolsForAnthropic();
  const conversation: Array<{ role: "user" | "assistant"; content: unknown }> = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolsFired: string[] = [];
  const stateChanges: CardAgentChatTurnResult["stateChanges"] = [];
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let finalCompletion: Anthropic.Message | null = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      messages: conversation as Anthropic.MessageParam[],
      tools: tools as Anthropic.Tool[],
    });
    finalCompletion = completion;
    inputTokensTotal += completion.usage?.input_tokens ?? 0;
    outputTokensTotal += completion.usage?.output_tokens ?? 0;

    if (completion.stop_reason !== "tool_use") break;

    const toolUses = completion.content.filter((b) => b.type === "tool_use");
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      if (tu.type !== "tool_use") continue;
      const { content, isError } = await runAgentTool(
        tu.name,
        tu.input,
        toolCtx,
        toolsFired,
        stateChanges,
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content,
        is_error: isError,
      });
    }

    conversation.push({ role: "assistant", content: completion.content });
    conversation.push({ role: "user", content: toolResults });
  }

  const assistantText = ((finalCompletion?.content ?? []) as Anthropic.ContentBlock[])
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  return {
    assistantText,
    toolsFired,
    stateChanges,
    inputTokensTotal,
    outputTokensTotal,
    model,
  };
}

type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

async function runOpenAiTurn(
  apiKey: string,
  tier: ChatModelTier,
  system: string,
  messages: SimpleMessage[],
  toolCtx: CardChatContext,
): Promise<CardAgentChatTurnResult> {
  const model = CHAT_PROVIDER_MODELS.openai[tier];
  const tools = toolsForOpenAI();
  const conversation: OpenAiMessage[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolsFired: string[] = [];
  const stateChanges: CardAgentChatTurnResult["stateChanges"] = [];
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let assistantText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: conversation,
        tools,
        tool_choice: "auto",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{ message?: OpenAiMessage & { tool_calls?: OpenAiToolCall[] } }>;
    };
    if (!res.ok) {
      const errText =
        typeof data?.error?.message === "string"
          ? data.error.message
          : JSON.stringify(data).slice(0, 200);
      throw new Error(`OpenAI HTTP ${res.status}: ${errText}`);
    }

    inputTokensTotal += data.usage?.prompt_tokens ?? 0;
    outputTokensTotal += data.usage?.completion_tokens ?? 0;

    const choice = data.choices?.[0];
    const assistantMsg = choice?.message;
    if (!assistantMsg) throw new Error("OpenAI returned no message");

    conversation.push(assistantMsg as OpenAiMessage);

    const toolCalls: OpenAiToolCall[] = assistantMsg.tool_calls ?? [];
    if (!toolCalls.length) {
      assistantText = String(assistantMsg.content ?? "").trim();
      break;
    }

    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      let args: unknown = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      const { content, isError } = await runAgentTool(
        tc.function.name,
        args,
        toolCtx,
        toolsFired,
        stateChanges,
      );
      conversation.push({
        role: "tool",
        tool_call_id: tc.id,
        content: isError ? content : content,
      });
    }
  }

  return {
    assistantText,
    toolsFired,
    stateChanges,
    inputTokensTotal,
    outputTokensTotal,
    model,
  };
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

async function runGeminiTurn(
  apiKey: string,
  tier: ChatModelTier,
  system: string,
  messages: SimpleMessage[],
  toolCtx: CardChatContext,
): Promise<CardAgentChatTurnResult> {
  const model = CHAT_PROVIDER_MODELS.gemini[tier];
  const declarations = toolsForGemini();

  const contents: GeminiContent[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const toolsFired: string[] = [];
  const stateChanges: CardAgentChatTurnResult["stateChanges"] = [];
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let assistantText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
      `?key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: declarations }],
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    if (!res.ok) {
      const errText =
        typeof data?.error?.message === "string"
          ? data.error.message
          : JSON.stringify(data).slice(0, 200);
      throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
    }

    inputTokensTotal += data.usageMetadata?.promptTokenCount ?? 0;
    outputTokensTotal += data.usageMetadata?.candidatesTokenCount ?? 0;

    const parts: GeminiPart[] = data.candidates?.[0]?.content?.parts ?? [];
    const textParts = parts.filter((p): p is { text: string } => "text" in p && typeof p.text === "string");
    const functionCalls = parts.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
        "functionCall" in p && !!p.functionCall?.name,
    );

    if (!functionCalls.length) {
      assistantText = textParts.map((p) => p.text).join("").trim();
      break;
    }

    contents.push({ role: "model", parts });

    const responseParts: GeminiPart[] = [];
    for (const fc of functionCalls) {
      const { content, isError } = await runAgentTool(
        fc.functionCall.name,
        fc.functionCall.args ?? {},
        toolCtx,
        toolsFired,
        stateChanges,
      );
      let parsed: Record<string, unknown> = { result: content };
      try {
        parsed = JSON.parse(content) as Record<string, unknown>;
      } catch {
        parsed = isError ? { error: content } : { result: content };
      }
      responseParts.push({
        functionResponse: {
          name: fc.functionCall.name,
          response: parsed,
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });

    if (textParts.length) {
      assistantText = textParts.map((p) => p.text).join("").trim();
    }
  }

  return {
    assistantText,
    toolsFired,
    stateChanges,
    inputTokensTotal,
    outputTokensTotal,
    model,
  };
}

/** Run one user turn through the card agent tool loop (BYOK or server Anthropic key). */
export async function runCardAgentChatTurn(opts: {
  provider: ChatLlmProvider;
  apiKey: string;
  tier?: ChatModelTier;
  system: string;
  messages: SimpleMessage[];
  toolCtx: CardChatContext;
}): Promise<CardAgentChatTurnResult> {
  const tier: ChatModelTier = opts.tier === "smart" ? "smart" : "fast";
  const key = opts.apiKey.trim();
  if (!key) {
    throw new Error(`API key required for ${opts.provider}`);
  }

  if (opts.provider === "anthropic") {
    return runAnthropicTurn(key, tier, opts.system, opts.messages, opts.toolCtx);
  }
  if (opts.provider === "openai") {
    return runOpenAiTurn(key, tier, opts.system, opts.messages, opts.toolCtx);
  }
  return runGeminiTurn(key, tier, opts.system, opts.messages, opts.toolCtx);
}

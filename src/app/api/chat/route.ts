/**
 * POST /api/chat
 *
 * Multi-provider streaming chat proxy. Accepts a Bring-Your-Own-Key (BYOK)
 * apiKey from the request body and proxies the message to the selected
 * provider (OpenAI / Anthropic / Gemini), streaming the response back as
 * server-sent events shaped: `data: {"text": "..."}\n\n` then `data: [DONE]\n\n`.
 *
 * Why one route serves all 3:
 *   - Same SSE shape on the wire — the FE consumer (scheduleAssistant) doesn't
 *     have to branch per provider
 *   - Same auth model (req.user via NextAuth) — same rate-limit / audit posture
 *   - Different upstream APIs handled internally — Anthropic via SDK, OpenAI
 *     and Gemini via raw fetch (no extra deps)
 *
 * Security:
 *   - apiKey is in the request body (over HTTPS); never logged
 *   - Never persisted server-side — frontend stores in localStorage only
 *   - Auth-gated via NextAuth session; only signed-in users can proxy
 */

import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import type { NextRequest } from "next/server";

type Provider = "openai" | "anthropic" | "gemini";

interface ChatRequestBody {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  provider: Provider;
  apiKey: string;
  /** Frontend-supplied tier hint: "fast" | "smart". Maps to provider-specific model id. */
  tier?: "fast" | "smart";
}

const SYSTEM_PROMPT =
  `You are the Nuro.Finance AI assistant — a smart, concise financial copilot embedded in the Nuro dashboard. ` +
  `You help users understand their spending, manage their virtual Visa cards, track transactions, and navigate the Nuro.Finance platform. ` +
  `Key facts: Nuro is the financial control plane for autonomous AI agents. Users hold virtual Visa cards that lock/unlock instantly. ` +
  `CCTP enables multi-chain crypto deposits. Powered by Nuro middleware. ` +
  `Guidelines: Be concise and actionable. Plain language. USD by default. If unsure about account specifics, tell them to check their dashboard.`;

const ANTHROPIC_MODELS = {
  fast: "claude-haiku-4-5-20251001",
  smart: "claude-opus-4-6",
} as const;

// OpenAI doesn't ship "GPT-5.5" — Chris's UX labels it that way for the demo.
// Map fast/smart to the current top-of-line OpenAI models.
const OPENAI_MODELS = {
  fast: "gpt-4o-mini",
  smart: "gpt-4o",
} as const;

// Gemini's free-tier flash + pro tier.
const GEMINI_MODELS = {
  fast: "gemini-2.5-flash",
  smart: "gemini-2.5-pro",
} as const;

const encoder = new TextEncoder();

function sseEvent(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseDone(): Uint8Array {
  return encoder.encode(`data: [DONE]\n\n`);
}

/** Stream text deltas from the Anthropic SDK. */
async function streamAnthropic(
  controller: ReadableStreamDefaultController<Uint8Array>,
  apiKey: string,
  tier: "fast" | "smart",
  messages: ChatRequestBody["messages"],
) {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.stream({
    model: ANTHROPIC_MODELS[tier],
    max_tokens: tier === "smart" ? 8192 : 2048,
    system: SYSTEM_PROMPT,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  for await (const chunk of response) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      controller.enqueue(sseEvent({ text: chunk.delta.text }));
    }
  }
}

/** Stream text deltas from OpenAI's SSE chat-completions endpoint. */
async function streamOpenAi(
  controller: ReadableStreamDefaultController<Uint8Array>,
  apiKey: string,
  tier: "fast" | "smart",
  messages: ChatRequestBody["messages"],
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODELS[tier],
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // OpenAI SSE: each event terminated by `\n\n`. Lines start with `data: `.
    let nl;
    while ((nl = buffer.indexOf("\n\n")) >= 0) {
      const eventBlock = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      for (const line of eventBlock.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) {
            controller.enqueue(sseEvent({ text: delta }));
          }
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}

/** Stream text deltas from Gemini's streamGenerateContent SSE endpoint. */
async function streamGemini(
  controller: ReadableStreamDefaultController<Uint8Array>,
  apiKey: string,
  tier: "fast" | "smart",
  messages: ChatRequestBody["messages"],
) {
  // Gemini wants alternating user/model turns under `contents`, with the
  // system prompt as a separate top-level field.
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODELS[tier]}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    }),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n\n")) >= 0) {
      const eventBlock = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      for (const line of eventBlock.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          // Gemini's response shape: candidates[0].content.parts[*].text
          const parts = parsed?.candidates?.[0]?.content?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (typeof part?.text === "string" && part.text) {
                controller.enqueue(sseEvent({ text: part.text }));
              }
            }
          }
        } catch {
          /* ignore malformed event */
        }
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, provider, apiKey, tier = "fast" } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages[] is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (provider !== "openai" && provider !== "anthropic" && provider !== "gemini") {
    return new Response(JSON.stringify({ error: "Unknown provider" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof apiKey !== "string" || apiKey.trim().length < 10) {
    return new Response(JSON.stringify({ error: "Missing or short apiKey" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const tierResolved: "fast" | "smart" = tier === "smart" ? "smart" : "fast";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (provider === "anthropic") {
          await streamAnthropic(controller, apiKey, tierResolved, messages);
        } else if (provider === "openai") {
          await streamOpenAi(controller, apiKey, tierResolved, messages);
        } else {
          await streamGemini(controller, apiKey, tierResolved, messages);
        }
        controller.enqueue(sseDone());
        controller.close();
      } catch (err: any) {
        const message = err?.message?.slice(0, 200) ?? "stream failed";
        controller.enqueue(sseEvent({ error: message }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

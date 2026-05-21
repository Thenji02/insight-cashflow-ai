import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/* ---------------- Extract transactions from raw text (PDF / messy XLSX) --------------- */

const extractInput = z.object({
  text: z.string().min(10).max(120_000),
});

export const extractTransactionsFromText = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => extractInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              'Extract bank/credit-card transactions from the provided document text. Return JSON only: {"transactions":[{"date":"YYYY-MM-DD","description":"...","amount":number}, ...]}. Use negative amounts for debits/spending and positive for credits/income. Skip headers, totals, and balances. Max 200 transactions.',
          },
          { role: "user", content: data.text.slice(0, 120_000) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
      throw new Error(`AI extract failed: ${res.status}`);
    }
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    try {
      const p = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
      const out = Array.isArray(p.transactions) ? p.transactions : [];
      return {
        transactions: out
          .filter(
            (t: unknown): t is { date: string; description: string; amount: number } =>
              !!t &&
              typeof (t as { date?: unknown }).date === "string" &&
              typeof (t as { description?: unknown }).description === "string" &&
              typeof (t as { amount?: unknown }).amount === "number"
          )
          .slice(0, 300),
      };
    } catch {
      throw new Error("AI returned invalid JSON");
    }
  });

/* ------------------------------ Chat assistant ----------------------------- */

const chatInput = z.object({
  question: z.string().min(1).max(1000),
  context: z.object({
    totalSpent: z.number(),
    totalIncome: z.number(),
    months: z.number(),
    byCategory: z.array(z.object({ name: z.string(), value: z.number() })).max(30),
    byMonth: z.array(z.object({ month: z.string(), spent: z.number() })).max(36),
    recentTransactions: z
      .array(
        z.object({
          date: z.string(),
          description: z.string(),
          amount: z.number(),
          category: z.string(),
        })
      )
      .max(50),
  }),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .optional(),
});

export const askFinancialAssistant = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => chatInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const system = `You are FinLens, a friendly and sharp personal-finance assistant.
You answer the user's questions strictly using the JSON spending data provided in the first user message.
Be concise (under 140 words), use plain numbers with $ signs, and reference categories/months from the data.
If asked to save money, give 2-4 specific, prioritized actions tied to actual top categories.
If the data can't answer the question, say so briefly and suggest what info is missing.
Never invent transactions or amounts that are not in the data.`;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: system },
      {
        role: "user",
        content:
          "Here is my spending data as JSON:\n" + JSON.stringify(data.context),
      },
      ...(data.history ?? []),
      { role: "user", content: data.question },
    ];

    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
      throw new Error(`AI chat failed: ${res.status}`);
    }
    const j = (await res.json()) as { choices: { message: { content: string } }[] };
    const answer = j.choices?.[0]?.message?.content?.trim() ?? "I couldn't generate a response.";
    return { answer };
  });
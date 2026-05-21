import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const txInput = z.object({
  transactions: z
    .array(
      z.object({
        date: z.string(),
        description: z.string(),
        amount: z.number(),
      })
    )
    .min(1)
    .max(500),
});

const CATEGORIES = [
  "Groceries",
  "Dining",
  "Transport",
  "Shopping",
  "Entertainment",
  "Bills & Utilities",
  "Housing",
  "Health",
  "Travel",
  "Education",
  "Income",
  "Transfers",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const categorizeTransactions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => txInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const system = `You are a financial assistant. Categorize each bank transaction into EXACTLY ONE of: ${CATEGORIES.join(", ")}. Respond ONLY with a JSON object: {"categories": ["Cat1", "Cat2", ...]} where the array length and order matches the input transactions.`;

    const user = data.transactions
      .map(
        (t, i) =>
          `${i + 1}. ${t.date} | ${t.description} | ${t.amount.toFixed(2)}`
      )
      .join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("AI rate limit reached. Try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
      throw new Error(`AI request failed: ${res.status}`);
    }

    const json = (await res.json()) as { choices: { message: { content: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { categories?: string[] } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI returned invalid JSON");
    }
    const cats = parsed.categories ?? [];
    const valid: Category[] = data.transactions.map((_, i) => {
      const c = cats[i];
      return (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : "Other";
    });

    // Insights
    const insightRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a sharp personal-finance analyst. Given a JSON of category totals and monthly totals, return 3 concise, actionable insights as JSON: {\"insights\": [\"...\", \"...\", \"...\"]}. Use plain numbers (no markdown). Keep each under 140 chars.",
          },
          {
            role: "user",
            content: JSON.stringify({
              byCategory: aggregateByCategory(data.transactions, valid),
              byMonth: aggregateByMonth(data.transactions),
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    let insights: string[] = [];
    if (insightRes.ok) {
      const ij = (await insightRes.json()) as { choices: { message: { content: string } }[] };
      try {
        const p = JSON.parse(ij.choices?.[0]?.message?.content ?? "{}");
        if (Array.isArray(p.insights)) insights = p.insights.slice(0, 5);
      } catch {
        /* ignore */
      }
    }

    return { categories: valid, insights };
  });

function aggregateByCategory(
  txs: { amount: number }[],
  cats: Category[]
): Record<string, number> {
  const out: Record<string, number> = {};
  txs.forEach((t, i) => {
    if (t.amount >= 0) return;
    const c = cats[i] ?? "Other";
    out[c] = (out[c] ?? 0) + Math.abs(t.amount);
  });
  return out;
}

function aggregateByMonth(txs: { date: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  txs.forEach((t) => {
    if (t.amount >= 0) return;
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out[key] = (out[key] ?? 0) + Math.abs(t.amount);
  });
  return out;
}
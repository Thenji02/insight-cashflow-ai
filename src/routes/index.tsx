import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Upload,
  Sparkles,
  TrendingUp,
  Wallet,
  Brain,
  FileText,
  Loader2,
  Lightbulb,
  Send,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { SAMPLE_CSV, parseTransactionsCsv, type RawTx } from "@/lib/csv";
import { parseFileToTransactions } from "@/lib/parsers";
import { categorizeTransactions } from "@/lib/categorize.functions";
import { askFinancialAssistant, extractTransactionsFromText } from "@/lib/assistant.functions";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "FinLens — AI Expense Categorizer" },
      {
        name: "description",
        content:
          "Upload bank transactions and let AI categorize spending, surface insights, and predict next month's expenses.",
      },
    ],
  }),
});

type Categorized = RawTx & { category: string };
type Recommendation = { title: string; detail: string; impact: string };
type ChatMsg = { role: "user" | "assistant"; content: string };

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "oklch(0.75 0.18 50)",
  "oklch(0.68 0.2 200)",
  "oklch(0.7 0.2 350)",
  "oklch(0.72 0.18 120)",
  "oklch(0.65 0.2 60)",
  "oklch(0.72 0.18 290)",
  "oklch(0.7 0.2 180)",
  "oklch(0.68 0.15 30)",
];

function Index() {
  const [txs, setTxs] = useState<Categorized[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState<string>("USD");
  const fileRef = useRef<HTMLInputElement>(null);
  const categorize = useServerFn(categorizeTransactions);
  const extract = useServerFn(extractTransactionsFromText);

  async function handleRaw(raw: RawTx[]) {
    if (!raw.length) {
      toast.error("No transactions found in file.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const limited = raw.slice(0, 300);
      const {
        categories,
        insights: ins,
        recommendations: recs,
      } = await categorize({
        data: {
          transactions: limited.map(({ date, description, amount }) => ({
            date,
            description,
            amount,
          })),
        },
      });
      setTxs(limited.map((t, i) => ({ ...t, category: categories[i] ?? "Other" })));
      setInsights(ins);
      setRecommendations(recs ?? []);
      toast.success(`Categorized ${limited.length} transactions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to categorize");
    } finally {
      setLoading(false);
    }
  }

  async function onFile(file: File) {
    setLoading(true);
    try {
      const result = await parseFileToTransactions(file, async (text) => {
        toast.message("Reading document with AI…");
        const { transactions } = await extract({ data: { text } });
        return transactions;
      });
      setCurrency(result.currency);
      await handleRaw(result.transactions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read file");
      setLoading(false);
    }
  }

  function loadSample() {
    setCurrency("USD");
    handleRaw(parseTransactionsCsv(SAMPLE_CSV));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors theme="dark" />
      <Header />
      <main className="mx-auto max-w-7xl px-6 pb-24">
        {txs.length === 0 ? (
          <Landing loading={loading} onFile={onFile} onSample={loadSample} fileRef={fileRef} />
        ) : (
          <Dashboard
            txs={txs}
            insights={insights}
            recommendations={recommendations}
            loading={loading}
            currency={currency}
            onReset={() => {
              setTxs([]);
              setInsights([]);
              setRecommendations([]);
            }}
          />
        )}
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Wallet className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold tracking-tight">FinLens</span>
      </div>
      <span className="rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground">
        AI-powered · Private
      </span>
    </header>
  );
}

function Landing({
  loading,
  onFile,
  onSample,
  fileRef,
}: {
  loading: boolean;
  onFile: (f: File) => void;
  onSample: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <section className="mt-10">
      <div
        className="relative overflow-hidden rounded-3xl border border-border p-12 text-center"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="h-3 w-3 text-primary" /> Powered by Lovable AI
        </div>
        <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight md:text-6xl">
          See where your money really goes.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
          Upload your bank statement. AI categorizes every transaction, finds patterns, and predicts
          next month's spending — in seconds.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          className={`mx-auto mt-10 flex max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card/40 px-8 py-12 backdrop-blur transition ${
            drag ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.currentTarget.value = "";
            }}
          />
          {loading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                AI is analyzing your transactions…
              </p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-primary" />
              <p className="mt-4 font-medium">Drop a CSV, Excel, or PDF statement</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Bank exports, .xlsx, or PDF statements all work
              </p>
            </>
          )}
        </label>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Button size="lg" variant="secondary" disabled={loading} onClick={onSample}>
            <FileText className="mr-2 h-4 w-4" /> Try with sample data
          </Button>
        </div>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        <Feature
          icon={<Brain className="h-5 w-5" />}
          title="AI categorization"
          body="Every line item sorted into smart categories — no rules to write."
        />
        <Feature
          icon={<TrendingUp className="h-5 w-5" />}
          title="Spending insights"
          body="Plain-English observations that show where money leaks."
        />
        <Feature
          icon={<Sparkles className="h-5 w-5" />}
          title="Forecast next month"
          body="A statistical projection of your expenses for the month ahead."
        />
      </div>
    </section>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="border-border bg-card/60 p-6 backdrop-blur">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}

function Dashboard({
  txs,
  insights,
  recommendations,
  loading,
  currency,
  onReset,
}: {
  txs: Categorized[];
  insights: string[];
  recommendations: Recommendation[];
  loading: boolean;
  currency: string;
  onReset: () => void;
}) {
  const stats = useMemo(() => computeStats(txs), [txs]);
  const fmt = useMemo(() => makeFmt(currency), [currency]);
  const symbol = useMemo(() => currencySymbol(currency), [currency]);

  return (
    <section className="mt-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your money, decoded</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {txs.length} transactions · {stats.months} month{stats.months === 1 ? "" : "s"} analyzed
          </p>
        </div>
        <Button variant="secondary" onClick={onReset} disabled={loading}>
          Upload another file
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Total spent" value={fmt(stats.totalSpent)} accent />
        <Stat label="Total income" value={fmt(stats.totalIncome)} />
        <Stat label="Avg / month" value={fmt(stats.avgMonth)} />
        <Stat label="Next month forecast" value={fmt(stats.forecast)} hint="Linear projection" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="border-border bg-card/60 p-6 lg:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground">Spending by category</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={stats.byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  stroke="var(--background)"
                  strokeWidth={2}
                >
                  {stats.byCategory.map((_entry: { name: string; value: number }, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--foreground)",
                  }}
                  formatter={(v: number) => fmt(v)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-4 space-y-2">
            {stats.byCategory.slice(0, 6).map((c: { name: string; value: number }, i: number) => (
              <li key={c.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  {c.name}
                </span>
                <span className="font-medium tabular-nums">{fmt(c.value)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="border-border bg-card/60 p-6 lg:col-span-3">
          <h3 className="text-sm font-medium text-muted-foreground">Monthly spending trend</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer>
              <LineChart data={stats.byMonth}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickFormatter={(v) => `${symbol}${v}`}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => fmt(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="spent"
                  name="Spent"
                  stroke="var(--chart-1)"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Forecast"
                  stroke="var(--chart-3)"
                  strokeDasharray="6 4"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="border-border bg-card/60 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-muted-foreground">AI insights</h3>
        </div>
        {insights.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No insights generated.</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {insights.map((s, i) => (
              <li
                key={i}
                className="rounded-xl border border-border bg-background/40 p-4 text-sm leading-relaxed"
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-border bg-card/60 p-6">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium text-muted-foreground">Smart recommendations</h3>
        </div>
        {recommendations.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No recommendations yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {recommendations.map((r, i) => (
              <li key={i} className="rounded-xl border border-border bg-background/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{r.title}</p>
                  <ImpactBadge impact={r.impact} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{r.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ChatAssistant stats={stats} txs={txs} currency={currency} fmt={fmt} />

      <Card className="border-border bg-card/60 p-6">
        <h3 className="text-sm font-medium text-muted-foreground">Recent transactions</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Description</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txs.slice(0, 25).map((t, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-2 pr-4 text-muted-foreground">{t.date}</td>
                  <td className="py-2 pr-4">{t.description}</td>
                  <td className="py-2 pr-4">
                    <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs">
                      {t.category}
                    </span>
                  </td>
                  <td
                    className={`py-2 pr-4 text-right font-medium tabular-nums ${
                      t.amount < 0 ? "text-foreground" : "text-primary"
                    }`}
                  >
                    {fmt(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card className={`border-border p-5 ${accent ? "bg-primary/10" : "bg-card/60"}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

function makeFmt(currency: string) {
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  } catch {
    nf = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  }
  return (n: number) => nf.format(n);
}

function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return "$";
  }
}

function computeStats(txs: Categorized[]) {
  const spent = txs.filter((t) => t.amount < 0);
  const income = txs.filter((t) => t.amount > 0);
  const totalSpent = spent.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);

  const byCatMap = new Map<string, number>();
  spent.forEach((t) =>
    byCatMap.set(t.category, (byCatMap.get(t.category) ?? 0) + Math.abs(t.amount)),
  );
  const byCategory = [...byCatMap.entries()]
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value);

  const byMonthMap = new Map<string, number>();
  spent.forEach((t) => {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) return;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonthMap.set(k, (byMonthMap.get(k) ?? 0) + Math.abs(t.amount));
  });
  const monthEntries = [...byMonthMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const byMonth: { month: string; spent: number; forecast: number | null }[] = monthEntries.map(
    ([month, spent]) => ({
      month: prettyMonth(month),
      spent: Number(spent.toFixed(2)),
      forecast: null,
    }),
  );

  // Forecast: weighted recent average (last 3 months, more weight to recent).
  let forecast = 0;
  if (monthEntries.length) {
    const vals = monthEntries.map(([, v]) => v);
    const recent = vals.slice(-3);
    const weights = recent.length === 3 ? [1, 2, 3] : recent.length === 2 ? [1, 2] : [1];
    const num = recent.reduce((s, v, i) => s + v * weights[i], 0);
    const den = weights.reduce((s, w) => s + w, 0);
    forecast = num / den;

    // Add forecast point as the month after the last
    const [lastKey] = monthEntries[monthEntries.length - 1];
    const [y, m] = lastKey.split("-").map(Number);
    const next = new Date(y, m, 1);
    byMonth.push({
      month: prettyMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`),
      spent: 0,
      forecast: Number(forecast.toFixed(2)),
    });
    // connect line: set forecast on last actual point too
    byMonth[byMonth.length - 2].forecast = byMonth[byMonth.length - 2].spent;
  }

  const months = monthEntries.length;
  const avgMonth = months ? totalSpent / months : 0;

  return { totalSpent, totalIncome, byCategory, byMonth, months, avgMonth, forecast };
}

function prettyMonth(k: string) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function ImpactBadge({ impact }: { impact: string }) {
  const i = impact?.toLowerCase();
  const cls =
    i === "high"
      ? "bg-primary/15 text-primary border-primary/30"
      : i === "medium"
        ? "bg-chart-3/15 text-chart-3 border-chart-3/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${cls}`}>
      {impact || "info"}
    </span>
  );
}

type StatsShape = ReturnType<typeof computeStats>;

function ChatAssistant({ stats, txs }: { stats: StatsShape; txs: Categorized[] }) {
  const ask = useServerFn(askFinancialAssistant);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        'Hi! I\'m your finance assistant. Ask me anything about your spending — try "Where did I spend the most?" or "How can I save money?"',
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const context = useMemo(
    () => ({
      totalSpent: Number(stats.totalSpent.toFixed(2)),
      totalIncome: Number(stats.totalIncome.toFixed(2)),
      months: stats.months,
      byCategory: stats.byCategory.slice(0, 20),
      byMonth: stats.byMonth
        .filter((m) => m.spent > 0)
        .map((m) => ({ month: m.month, spent: m.spent })),
      recentTransactions: txs.slice(0, 40).map((t) => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category,
      })),
    }),
    [stats, txs],
  );

  async function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const history = next.slice(-10, -1).map((m) => ({ role: m.role, content: m.content }));
      const { answer } = await ask({ data: { question: q, context, history } });
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: e instanceof Error ? e.message : "Something went wrong.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  const suggestions = [
    "Where did I spend the most?",
    "How can I save money?",
    "What's my biggest recurring expense?",
  ];

  return (
    <Card className="border-border bg-card/60 p-6">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-medium text-muted-foreground">Ask your AI assistant</h3>
      </div>
      <div
        ref={scrollRef}
        className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border bg-background/40 p-4"
      >
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-secondary px-4 py-2 text-sm text-muted-foreground">
              <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => send(s)}
            disabled={pending}
            className="rounded-full border border-border bg-background/40 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/60 hover:text-foreground disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your spending…"
          disabled={pending}
          className="flex-1 rounded-xl border border-border bg-background/40 px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
        <Button type="submit" disabled={pending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}

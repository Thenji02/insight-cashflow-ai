# FinLens

FinLens is a personal finance assistant. Upload a bank or credit-card statement (CSV, Excel, or PDF) and the app parses your transactions, detects the currency, categorizes spending with AI, visualizes your money, and answers questions in a chat assistant.

## Features

- Upload statements in CSV, XLSX/XLS, or text-based PDF
- Automatic currency detection across 25+ currencies (USD, EUR, GBP, JPY, INR, ZAR, AUD, CAD, …) — every amount is formatted in the detected currency
- AI-powered transaction extraction for messy PDFs and spreadsheets
- AI categorization of every transaction (Food, Transport, Housing, …)
- Interactive dashboard with monthly trends and category breakdowns
- Smart insights and recommendations grounded in your actual data
- Conversational chat assistant with persistent history (last 50 messages)
- Sample data mode to explore without uploading a file

## Tech stack

- TanStack Start v1 (React 19, SSR, file-based routing)
- Vite 7
- Tailwind CSS v4 + shadcn/ui (Radix primitives)
- Recharts for charts
- Lovable Cloud (managed backend) with TanStack server functions
- Lovable AI Gateway (`google/gemini-2.5-flash`) for extraction, categorization, insights, and chat
- `pdfjs-dist` for client-side PDF parsing, SheetJS for spreadsheets
- Zod-validated server functions, deployed to Cloudflare Workers

## Project structure

```text
src/
  routes/
    __root.tsx          Root layout, providers, head metadata
    index.tsx           Home dashboard: upload, charts, chat
  lib/
    parsers.ts          File parsing + currency detection
    csv.ts              CSV-to-transaction parser
    assistant.functions.ts    AI extract + chat server fns
    categorize.functions.ts   AI categorize + insights + recs
  components/ui/        shadcn/ui components
  integrations/supabase/    Auto-generated backend clients
  styles.css            Design tokens
```

## Getting started

```bash
bun install
bun run dev      # start the Vite dev server
bun run build    # production build for Cloudflare Workers
bun run lint     # ESLint
```

## How it works

1. The user uploads a file (or loads sample data).
2. `parseFileToTransactions()` dispatches on the file type — CSV is parsed directly, XLSX is converted via SheetJS, and PDFs are extracted with `pdfjs-dist`. If deterministic parsing finds too few rows, the text is sent to the AI extractor as a fallback.
3. `detectCurrency()` scans the same text for ISO codes and symbols and returns the most frequent currency (defaulting to USD).
4. The `categorize` server function assigns a category to each transaction and generates insights and recommendations in the detected currency.
5. The dashboard renders monthly and category aggregates with `Intl.NumberFormat`.
6. The chat assistant sends the spending context plus the latest question (and the last 20 chat turns) to the AI gateway.

## Configuration

- `LOVABLE_API_KEY` — server-side secret for the AI gateway
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` — auto-injected by Lovable Cloud

## Notes & limitations

- Scanned / image-only PDFs are not supported — please export a text-based PDF, CSV, or Excel file from your bank.
- AI calls are rate-limited (HTTP 429) and credit-metered (HTTP 402); both are surfaced in the UI.
- Currency detection is heuristic; ambiguous symbols default to USD when no stronger signal is present.
- Statement files are parsed entirely in the browser — only aggregated data and your questions are sent to the AI gateway.
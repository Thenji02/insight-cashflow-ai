import { parseTransactionsCsv, type RawTx } from "./csv";

export type { RawTx };

export type ParseResult = { transactions: RawTx[]; currency: string };

const CURRENCY_PATTERNS: { code: string; regex: RegExp }[] = [
  { code: "USD", regex: /\b(USD|US\$)\b|(?<![A-Za-z])\$/g },
  { code: "EUR", regex: /\b(EUR)\b|€/g },
  { code: "GBP", regex: /\b(GBP)\b|£/g },
  { code: "JPY", regex: /\b(JPY)\b|¥/g },
  { code: "CNY", regex: /\b(CNY|RMB)\b/g },
  { code: "INR", regex: /\b(INR)\b|₹/g },
  { code: "ZAR", regex: /\b(ZAR)\b|(?<![A-Za-z])R(?=\s*\d)/g },
  { code: "AUD", regex: /\b(AUD|A\$)\b/g },
  { code: "CAD", regex: /\b(CAD|C\$)\b/g },
  { code: "CHF", regex: /\b(CHF)\b/g },
  { code: "NZD", regex: /\b(NZD|NZ\$)\b/g },
  { code: "SEK", regex: /\b(SEK|kr)\b/g },
  { code: "NOK", regex: /\b(NOK)\b/g },
  { code: "DKK", regex: /\b(DKK)\b/g },
  { code: "BRL", regex: /\b(BRL|R\$)\b/g },
  { code: "MXN", regex: /\b(MXN)\b/g },
  { code: "SGD", regex: /\b(SGD|S\$)\b/g },
  { code: "HKD", regex: /\b(HKD|HK\$)\b/g },
  { code: "KRW", regex: /\b(KRW)\b|₩/g },
  { code: "TRY", regex: /\b(TRY)\b|₺/g },
  { code: "RUB", regex: /\b(RUB)\b|₽/g },
  { code: "AED", regex: /\b(AED|د\.إ)\b/g },
  { code: "NGN", regex: /\b(NGN)\b|₦/g },
  { code: "PLN", regex: /\b(PLN|zł)\b/g },
];

export function detectCurrency(text: string): string {
  let best = "USD";
  let bestCount = 0;
  for (const { code, regex } of CURRENCY_PATTERNS) {
    const matches = text.match(regex);
    const n = matches ? matches.length : 0;
    if (n > bestCount) {
      bestCount = n;
      best = code;
    }
  }
  return bestCount > 0 ? best : "USD";
}

export async function parseFileToTransactions(
  file: File,
  extractFromText: (text: string) => Promise<RawTx[]>,
): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    return { transactions: parseTransactionsCsv(text), currency: detectCurrency(text) };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const currency = detectCurrency(csv);
    const rows = parseTransactionsCsv(csv);
    if (rows.length) return { transactions: rows, currency };
    // Fallback: use AI to extract from the raw sheet text
    return { transactions: await extractFromText(csv), currency };
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdfText(file);
    const currency = detectCurrency(text);
    const parsed = parseTransactionsFromStatementText(text);
    if (parsed.length >= 3) return { transactions: parsed, currency };

    if (text.replace(/\s/g, "").length < 250) {
      throw new Error(
        "This PDF appears to be scanned or image-only. Please upload a text-based PDF, CSV, or Excel export.",
      );
    }

    return { transactions: await extractFromText(compactStatementText(text)), currency };
  }
  // Last-ditch: try CSV parse on text
  const text = await file.text();
  return { transactions: parseTransactionsCsv(text), currency: detectCurrency(text) };
}

export function parseTransactionsFromStatementText(text: string): RawTx[] {
  const scoped = compactStatementText(text, 80_000);
  const matches = [
    ...scoped.matchAll(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g),
  ];
  const out: RawTx[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const dateRaw = match[1];
    const start = match.index ?? 0;
    const end = matches[i + 1]?.index ?? scoped.length;
    const segment = scoped.slice(start, end).replace(/\s+/g, " ").trim();
    const lowered = segment.toLowerCase();

    if (
      /fee summary|money (in|out) summary|spending summary|statement information|clientcare|capitec bank|page\s+\d+|date\s+description\s+category|from date|to date|print date|vat registration/.test(
        lowered,
      )
    ) {
      continue;
    }

    const amounts = extractMoneyValues(segment);
    if (amounts.length < 2) continue;

    const amount = amounts[0].value;
    if (!Number.isFinite(amount) || amount === 0) continue;

    const description = segment
      .replace(dateRaw, "")
      .replace(MONEY_TOKEN_REGEX, "")
      .replace(/\* Includes VAT.*$/i, "")
      .replace(/\b(Money In|Money Out|Fee\*?|Balance)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    if (description.length < 3 || description.length > 180) continue;
    out.push({ date: normalizeStatementDate(dateRaw), description, amount });
  }

  return dedupeTransactions(out).slice(0, 500);
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Load the worker from the bundled package via Vite's ?url import so it
  // works offline and isn't subject to CDN availability/CORS issues.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; str: string }[]>();

    for (const item of content.items) {
      const it = item as { str?: string; transform?: number[] };
      const str = it.str?.trim();
      if (!str) continue;
      const x = it.transform?.[4] ?? 0;
      const y = it.transform?.[5] ?? 0;
      const row = Math.round(y / 3) * 3;
      const current = lines.get(row) ?? [];
      current.push({ x, str });
      lines.set(row, current);
    }

    const pageText = [...lines.entries()]
      .sort(([a], [b]) => b - a)
      .map(([, items]) =>
        items
          .sort((a, b) => a.x - b.x)
          .map((item) => item.str)
          .join(" "),
      )
      .join("\n");
    parts.push(pageText);
  }
  return parts.join("\n");
}

const MONEY_TOKEN_REGEX =
  /(?<![A-Za-z])(?:[-+]?\s*(?:R\s*)?\d[\d\s,]*\.\d{2}|\(\s*(?:R\s*)?\d[\d\s,]*\.\d{2}\s*\))/gi;

function extractMoneyValues(segment: string): { token: string; value: number }[] {
  return [...segment.matchAll(MONEY_TOKEN_REGEX)]
    .map((match) => ({ token: match[0], value: parseStatementAmount(match[0]) }))
    .filter((item) => Number.isFinite(item.value));
}

function parseStatementAmount(token: string): number {
  const trimmed = token.trim();
  const negative = /^-/.test(trimmed) || /^\(/.test(trimmed);
  const cleaned = trimmed.replace(/[R,\s()]/gi, "").replace(/^[-+]/, "");
  const n = Number.parseFloat(cleaned);
  return negative ? -n : n;
}

function normalizeStatementDate(value: string): string {
  const parts = value.split(/[/-]/).map(Number);
  if (parts[0] > 1900) {
    const [year, month, day] = parts;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const [day, month, year] = parts;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compactStatementText(text: string, maxChars = 35_000): string {
  const normalized = text.replace(/\u00a0/g, " ");
  const transactionStart = normalized.search(/transaction history/i);
  const scoped = transactionStart >= 0 ? normalized.slice(transactionStart) : normalized;
  return scoped.slice(0, maxChars);
}

function dedupeTransactions(rows: RawTx[]): RawTx[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.date}|${row.description.toLowerCase()}|${row.amount.toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

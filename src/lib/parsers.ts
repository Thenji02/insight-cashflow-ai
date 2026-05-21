import { parseTransactionsCsv, type RawTx } from "./csv";

export type { RawTx };

export async function parseFileToTransactions(
  file: File,
  extractFromText: (text: string) => Promise<RawTx[]>
): Promise<RawTx[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || file.type === "text/csv") {
    return parseTransactionsCsv(await file.text());
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const rows = parseTransactionsCsv(csv);
    if (rows.length) return rows;
    // Fallback: use AI to extract from the raw sheet text
    return extractFromText(csv);
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdfText(file);
    const parsed = parseTransactionsFromStatementText(text);
    if (parsed.length >= 3) return parsed;

    return extractFromText(compactStatementText(text));
  }
  // Last-ditch: try CSV parse on text
  return parseTransactionsCsv(await file.text());
}

export function parseTransactionsFromStatementText(text: string): RawTx[] {
  const scoped = compactStatementText(text, 80_000);
  const matches = [...scoped.matchAll(/\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g)];
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
        lowered
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
          .join(" ")
      )
      .join("\n");
    parts.push(pageText);
  }
  return parts.join("\n");
}

const MONEY_TOKEN_REGEX = /(?<![A-Za-z])(?:[-+]?\s*(?:R\s*)?\d[\d\s,]*\.\d{2}|\(\s*(?:R\s*)?\d[\d\s,]*\.\d{2}\s*\))/gi;

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
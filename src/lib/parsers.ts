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
    return extractFromText(text);
  }
  // Last-ditch: try CSV parse on text
  return parseTransactionsCsv(await file.text());
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
    const line = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ("str" in it ? it.str : ""))
      .join(" ");
    parts.push(line);
  }
  return parts.join("\n");
}
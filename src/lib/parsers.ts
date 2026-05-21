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
  // Use a CDN worker matching the installed version for reliability across bundlers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (pdfjs as any).version ?? "5.7.284";
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.worker.min.mjs`;
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
export type RawTx = { date: string; description: string; amount: number };

// Minimal CSV parser handling quoted fields and commas inside quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim().length));
}

function findIdx(headers: string[], names: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    const i = norm.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

export function parseTransactionsCsv(text: string): RawTx[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const dateIdx = findIdx(headers, ["date", "posted", "transaction date"]);
  const descIdx = findIdx(headers, ["description", "details", "merchant", "memo", "name"]);
  const amtIdx = findIdx(headers, ["amount", "value"]);
  const debitIdx = findIdx(headers, ["debit", "withdrawal"]);
  const creditIdx = findIdx(headers, ["credit", "deposit"]);

  const out: RawTx[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    const date = dateIdx >= 0 ? cols[dateIdx] : cols[0];
    const desc = descIdx >= 0 ? cols[descIdx] : cols[1] ?? "";
    let amount = 0;
    if (amtIdx >= 0) {
      amount = parseAmount(cols[amtIdx]);
    } else {
      const d = debitIdx >= 0 ? parseAmount(cols[debitIdx]) : 0;
      const c = creditIdx >= 0 ? parseAmount(cols[creditIdx]) : 0;
      amount = c - d;
    }
    if (!date || isNaN(amount)) continue;
    out.push({ date: date.trim(), description: (desc ?? "").trim(), amount });
  }
  return out;
}

function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[$,€£\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export const SAMPLE_CSV = `Date,Description,Amount
2024-09-02,Whole Foods Market,-84.32
2024-09-03,Shell Gas Station,-52.10
2024-09-04,Netflix Subscription,-15.99
2024-09-05,Salary ACME Corp,3200.00
2024-09-06,Uber Trip,-18.40
2024-09-08,Starbucks,-6.75
2024-09-10,Rent Payment,-1450.00
2024-09-12,Amazon Order,-67.20
2024-09-14,Trader Joe's,-58.91
2024-09-15,Electric Bill,-92.40
2024-09-18,Spotify,-9.99
2024-09-20,Chipotle,-13.45
2024-09-22,CVS Pharmacy,-22.80
2024-09-25,Delta Airlines,-312.00
2024-09-27,Target,-44.10
2024-10-01,Salary ACME Corp,3200.00
2024-10-02,Rent Payment,-1450.00
2024-10-03,Whole Foods Market,-78.50
2024-10-04,Shell Gas Station,-48.20
2024-10-05,Netflix Subscription,-15.99
2024-10-06,Uber Trip,-22.10
2024-10-08,Chipotle,-14.20
2024-10-10,Amazon Order,-129.99
2024-10-12,Trader Joe's,-62.30
2024-10-15,Electric Bill,-88.10
2024-10-18,Spotify,-9.99
2024-10-20,AMC Theatres,-32.50
2024-10-22,Walgreens,-18.40
2024-10-25,Airbnb Stay,-245.00
2024-10-28,Target,-51.20
2024-11-01,Salary ACME Corp,3300.00
2024-11-02,Rent Payment,-1450.00
2024-11-03,Whole Foods Market,-91.10
2024-11-04,Shell Gas Station,-55.00
2024-11-05,Netflix Subscription,-15.99
2024-11-06,Lyft Ride,-19.80
2024-11-08,Sweetgreen,-16.25
2024-11-10,Amazon Order,-89.40
2024-11-12,Trader Joe's,-71.20
2024-11-15,Electric Bill,-101.30
2024-11-18,Spotify,-9.99
2024-11-20,Apple Store,-199.00
2024-11-22,CVS Pharmacy,-15.60
2024-11-25,United Airlines,-420.00
2024-11-28,Target,-62.40
`;
/** CSV 解析器 */
export function parseCSV(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\r') {
        // skip
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows.filter(r => r.length > 0 && r.some(f => f !== ''));
}

/** CSV 行转 JSON */
export function csvRowsToJson(rows: string[][], hasHeader = true): { columns: string[]; rows: Record<string, unknown>[] } {
  if (rows.length === 0) return { columns: [], rows: [] };

  const columns = hasHeader
    ? rows[0].map((c, i) => c.trim() || `col_${i}`)
    : rows[0].map((_, i) => `col_${i}`);

  const dataRows = hasHeader ? rows.slice(1) : rows;
  const jsonRows = dataRows.map(row => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? '';
    });
    return obj;
  });

  return { columns, rows: jsonRows };
}

/** JSON 转 CSV */
export function jsonToCSV(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (val: unknown): string => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = columns.map(escape).join(',');
  const dataRows = rows.map(row => columns.map(col => escape(row[col])).join(','));
  return [header, ...dataRows].join('\n');
}

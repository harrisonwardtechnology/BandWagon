const CSV_FORMULA_PREFIX = /^[=+\-@]/;

export function safeCsvCell(value: unknown) {
  let text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  if (CSV_FORMULA_PREFIX.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export function auditEventsCsv(rows: Array<Record<string, unknown>>) {
  const headers = ["occurred_at","action","outcome","organization","actor","target_type","target_id","metadata"];
  const lines = [headers.map(safeCsvCell).join(",")];
  for (const row of rows) {
    lines.push([
      row.occurred_at,row.action,row.outcome,row.organization_name,row.actor_name,
      row.target_type,row.target_id,row.metadata,
    ].map(safeCsvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

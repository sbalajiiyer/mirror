import "server-only";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";
import { DomainError } from "@/lib/errors";

export const MAX_IMPORT_BYTES = 1024 * 1024; // 1 MB is far more than a questionnaire needs
const MAX_ROWS = 2000;
const MAX_COLS = 200;

/** Read the first non-empty sheet of an .xlsx or .csv file into rows of strings. */
export async function readSpreadsheet(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<string[][]> {
  if (file.size > MAX_IMPORT_BYTES) throw new DomainError("That file is over 1 MB. A questionnaire file should be much smaller. Try exporting just the questions.");
  const ext = file.name.toLowerCase().split(".").pop();
  const buf = Buffer.from(await file.arrayBuffer());
  let rows: unknown[][] = [];
  if (ext === "csv" || ext === "txt" || ext === "tsv") {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter: ext === "tsv" ? "\t" : "" });
    rows = parsed.data;
  } else if (ext === "xlsx") {
    try {
      const sheets = await readXlsxFile(buf);
      rows = (sheets.find((s) => s.data.some((r) => r.some((c) => c != null && String(c).trim()))) ?? sheets[0])?.data ?? [];
    } catch {
      throw new DomainError("We couldn't read that Excel file. Open it and save it again as .xlsx or .csv.");
    }
  } else if (ext === "xls") {
    throw new DomainError("Old .xls files aren't supported. Open it in Excel or Google Sheets and save it as .xlsx or .csv.");
  } else {
    throw new DomainError("Please upload an .xlsx or .csv file.");
  }
  return rows.slice(0, MAX_ROWS).map((r) => (Array.isArray(r) ? r.slice(0, MAX_COLS) : []).map((c) => (c == null ? "" : c instanceof Date ? c.toISOString() : String(c))));
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readSpreadsheet } from "@/lib/import/read-spreadsheet";
import { importQuestionnaire } from "@/lib/import/questionnaire-import";

const file = (name: string, data: Buffer | string) => {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return { name, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) as ArrayBuffer };
};

describe("reading uploaded spreadsheets", () => {
  it("reads a real .xlsx (Microsoft Forms export) and imports only its questions", async () => {
    const rows = await readSpreadsheet(file("microsoft-forms-export.xlsx", readFileSync("tests/fixtures/microsoft-forms-export.xlsx")));
    const r = importQuestionnaire(rows, "microsoft-forms-export.xlsx");
    expect(r.ok && r.layout).toBe("form_export");
    expect(r.ok && r.draft.competencies[0].questions.map((q) => q.text)).toContain("{name} supports teammates when they are stuck");
    expect(JSON.stringify(r)).not.toContain("Keep the weekly demos");
  });

  it("reads CSV with quotes, commas and a BOM", async () => {
    const rows = await readSpreadsheet(file("t.csv", '﻿Section,Statement\nTeam,"Helps others, even when busy"\n'));
    expect(rows).toEqual([["Section", "Statement"], ["Team", "Helps others, even when busy"]]);
  });

  it("rejects old .xls, other types and files over 1 MB with helpful messages", async () => {
    await expect(readSpreadsheet(file("old.xls", "x"))).rejects.toThrow(/save it as .xlsx or .csv/);
    await expect(readSpreadsheet(file("doc.pdf", "x"))).rejects.toThrow(/\.xlsx or \.csv/);
    await expect(readSpreadsheet({ name: "big.csv", size: 2 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) })).rejects.toThrow(/over 1 MB/);
    await expect(readSpreadsheet(file("broken.xlsx", "not a zip"))).rejects.toThrow(/couldn't read that Excel file/);
  });
});

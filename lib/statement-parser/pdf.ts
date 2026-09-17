import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { parseStatementLines } from "./core";
import type { StatementLine, StatementParseResult, TextFragment } from "./core";

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
};

type PositionedFragment = TextFragment & { y: number };

export class StatementPdfError extends Error {
// Attach a machine-readable reason to a user-facing PDF error.
  constructor(
    message: string,
    readonly code: "file-too-large" | "image-only" | "invalid-pdf",
  ) {
    super(message);
    this.name = "StatementPdfError";
  }
}

// Keep only PDF.js text items with usable text and position data.
function isPdfTextItem(item: unknown): item is PdfTextItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<PdfTextItem>;
  return typeof candidate.str === "string"
    && Array.isArray(candidate.transform)
    && candidate.transform.length >= 6
    && typeof candidate.width === "number";
}

// Reduce tiny PDF coordinate differences before grouping text.
function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

// Group positioned PDF fragments into reading-order lines.
export function groupPdfTextItems(items: unknown[], page: number): StatementLine[] {
  const fragments: PositionedFragment[] = items
    .filter(isPdfTextItem)
    .map((item) => ({
      text: item.str.replace(/\s+/g, " ").trim(),
      x: roundCoordinate(item.transform[4]),
      y: roundCoordinate(item.transform[5]),
      width: Math.abs(roundCoordinate(item.width)),
    }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const groups: Array<{ y: number; items: PositionedFragment[] }> = [];
  for (const fragment of fragments) {
    const nearest = groups.find((group) => Math.abs(group.y - fragment.y) <= 2.25);
    if (nearest) {
      nearest.items.push(fragment);
      continue;
    }
    groups.push({ y: fragment.y, items: [fragment] });
  }

  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => {
      const orderedItems = group.items.sort((a, b) => a.x - b.x);
      return {
        page,
        y: group.y,
        items: orderedItems.map(({ text, x, width }) => ({ text, x, width })),
        text: orderedItems.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim(),
      };
    });
}

// Read every PDF page and reject scans that contain too little selectable text.
export async function extractPdfLines(data: ArrayBuffer): Promise<StatementLine[]> {
  let pdfjs: typeof import("pdfjs-dist");
  try {
    pdfjs = await import("pdfjs-dist");
  } catch {
    throw new StatementPdfError("The PDF reader could not start in this browser.", "invalid-pdf");
  }

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  try {
    const document = await loadingTask.promise;
    const lines: StatementLine[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      lines.push(...groupPdfTextItems(content.items, pageNumber));
      page.cleanup();
    }
    if (lines.reduce((count, line) => count + line.items.length, 0) < 5) {
      throw new StatementPdfError(
        "This PDF appears to be a scan or image. Export a searchable PDF or use CSV for now.",
        "image-only",
      );
    }
    return lines;
  } catch (error) {
    if (error instanceof StatementPdfError) throw error;
    throw new StatementPdfError(
      error instanceof Error ? `The PDF could not be read: ${error.message}` : "The PDF could not be read.",
      "invalid-pdf",
    );
  } finally {
    await loadingTask.destroy();
  }
}

// Enforce the upload size limit, extract text, and parse its transactions.
export async function parsePdfStatement(file: File): Promise<StatementParseResult> {
  if (file.size > 10 * 1024 * 1024) {
    throw new StatementPdfError("Choose a PDF smaller than 10 MB.", "file-too-large");
  }
  const lines = await extractPdfLines(await file.arrayBuffer());
  return parseStatementLines(lines, file.name);
}

import "server-only";

/** Renders a URL to PDF. Swap the implementation per host (see docs/STATUS.md). */
export interface PdfRenderer {
  render(url: string): Promise<Buffer>;
}

/**
 * Default: headless Chromium via Playwright (free, best fidelity — the PDF is the real report
 * page with print CSS). Needs a Chromium binary on the server: fine locally, in Docker or on
 * Azure Container Apps; on Vercel use @sparticuz/chromium (open decision).
 */
export const playwrightRenderer: PdfRenderer = {
  async render(url) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
      await page.emulateMedia({ media: "print" });
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForSelector("[data-testid=report]", { timeout: 15_000 });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:8px;width:100%;padding:0 12mm;color:#888;display:flex;justify-content:space-between"><span>Mirror · Confidential development feedback</span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>',
      });
    } finally {
      await browser.close();
    }
  },
};

export function getPdfRenderer(): PdfRenderer {
  return playwrightRenderer;
}

import "server-only";

/** Renders a URL to PDF. Swap the implementation per host (see docs/STATUS.md). */
export interface PdfRenderer {
  render(url: string): Promise<Buffer>;
}

async function launchBrowser() {
  // Serverless (Vercel / AWS Lambda): no system Chromium, so use the compressed build
  // shipped in @sparticuz/chromium and drive it with playwright-core.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const [{ default: chromium }, { chromium: pw }] = await Promise.all([import("@sparticuz/chromium"), import("playwright-core")]);
    return pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  }
  // Local / containers: Playwright's own Chromium (`npx playwright install chromium`).
  const { chromium } = await import("playwright");
  return chromium.launch();
}

/**
 * Headless Chromium renders the real report page with print CSS, so the PDF matches the
 * web report exactly. Free on every host we use.
 */
export const playwrightRenderer: PdfRenderer = {
  async render(url) {
    const browser = await launchBrowser();
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

/** Health check: start Chromium and print a tiny static page (no user data). */
export async function pdfSelfTest() {
  const started = Date.now();
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent('<main data-testid="report"><h1>Mirror PDF check</h1></main>');
    const pdf = await page.pdf({ format: "A4" });
    return { bytes: pdf.length, ms: Date.now() - started };
  } finally {
    await browser.close();
  }
}

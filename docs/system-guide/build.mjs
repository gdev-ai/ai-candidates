// Renders every HTML in ./src (except partials) to a PDF in ./ using the locally installed Chrome.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire("C:/Users/zeyad/AI-Candidate/package.json");
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "src");
const only = process.argv.slice(2);
const files = readdirSync(srcDir).filter((f) => f.endsWith(".html") && (only.length === 0 || only.some((o) => f.includes(o))));

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const f of files) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(join(srcDir, f)).href, { waitUntil: "load" });
  const out = join(here, f.replace(/\.html$/, ".pdf"));
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: `<div style="font-size:8px;color:#7b8794;width:100%;padding:0 14mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial"><span>AI Candidate Sourcing Platform — ${f.replace(/\.html$/, "").replace(/^\d+_/, "").replace(/_/g, " ")}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  console.log("wrote", out);
  await page.close();
}
await browser.close();

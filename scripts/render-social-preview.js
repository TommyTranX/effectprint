import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const browserName = process.env.EFFECTPRINT_BROWSER ?? "chrome";
const launchOptions = { headless: true };
if (browserName !== "chromium") launchOptions.channel = browserName;

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(root, "assets", "hero.svg")).href);
  await page.screenshot({ path: join(root, "assets", "social-preview.png") });
} finally {
  await browser.close();
}

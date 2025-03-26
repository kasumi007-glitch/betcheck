import puppeteer from "puppeteer-extra";
import { executablePath, Browser, Page } from "puppeteer";

import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin()); // Bypass bot detection

// ✅ List of rotating proxies (format: host:port:username:password)
const proxies: string[] = [
  "rotating.proxyempire.io:9000:GqZ2J3RuCdTrACE5:wifi;ci;orange+cote+divoire;abidjan+autonomous+district;abidjan",
];

/**
 * Randomly selects a proxy from the list.
 *
 * @returns {string} A proxy string.
 */
function getRandomProxy(): string {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

/**
 * Launches Puppeteer with a rotating proxy.
 *
 * Proxy format: "host:port:username:password"
 *
 * @returns {Promise<{ browser: puppeteer.Browser, page: puppeteer.Page }>}
 */
export async function launchBrowser(headless: boolean = false): Promise<{
  browser: Browser;
  page: Page;
}> {
  // ✅ Select a random proxy string
  const proxyStr = getRandomProxy();

  // ✅ Extract Proxy Credentials (host, port, username, password)
  const parts = proxyStr.split(":");
  if (parts.length < 4) {
    throw new Error(
      "Invalid proxy format. Expected format: host:port:username:password"
    );
  }
  const host = parts[0];
  const port = parts[1];
  const username = parts[2];
  const password = parts.slice(3).join(":"); // Captures full password if colons are present

  console.log(`🌍 Using Proxy: ${host}:${port} with username: ${username}`);

  // ✅ Launch Puppeteer with the selected proxy (credentials will be provided via page.authenticate)
  const browser = await puppeteer.launch({
    headless: headless, // Change to true for production use
    defaultViewport: null,
    args: [`--proxy-server=${host}:${port}`, "--start-maximized"],
    executablePath: executablePath(),
  });

  const page = await browser.newPage();

  // ✅ Authenticate proxy using credentials
  await page.authenticate({
    username,
    password,
  });

  return { browser, page };
}

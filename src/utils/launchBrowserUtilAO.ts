import puppeteer from "puppeteer-extra";
import { executablePath, Browser, Page } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin()); // Bypass bot detection

// ✅ List of rotating proxies (format: host:port:username:password)
const proxies = [
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-a0ka2dbg:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-e3eg1d1e:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-b026ik37:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-23036gkh:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-iafh7376:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-0h4b7j5j:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-ek16757d:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-ek91bb8k:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-h4k5ak7d:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ao-sid-1j21e9hf:77dc4d16bf",
];

/**
 * Randomly selects a proxy from the list.
 */
function getRandomProxy(): string {
  return proxies[Math.floor(Math.random() * proxies.length)];
}

/**
 * Launches Puppeteer with a rotating proxy.
 */
export async function launchBrowserWithProxy(headless: boolean = false): Promise<{
  browser: Browser;
  page: Page;
}> {
  const proxyStr = getRandomProxy();
  const parts = proxyStr.split(":");

  if (parts.length < 4) {
    throw new Error("Invalid proxy format. Expected format: host:port:username:password");
  }

  const host = parts[0];
  const port = parts[1];
  const username = parts[2];
  const password = parts.slice(3).join(":"); // Handles ":" in password

  console.log(`🌍 Using Proxy: ${host}:${port} with username: ${username}`);

  const browser = await puppeteer.launch({
    headless,
    defaultViewport: null,
    args: [
      `--proxy-server=${host}:${port}`, 
      "--no-sandbox",
      "--disable-setuid-sandbox", 
      "--start-maximized"],
    executablePath: executablePath(),
  });

  const page = await browser.newPage();

  await page.authenticate({ username, password });

  return { browser, page };
}

/**
 * Launches Puppeteer without using a proxy.
 */
export async function launchBrowserWithoutProxy(headless: boolean = false): Promise<{
  browser: Browser;
  page: Page;
}> {
  const browser = await puppeteer.launch({
    headless,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--start-maximized"
    ],
    executablePath: executablePath(),
  });

  const page = await browser.newPage();

  return { browser, page };
}

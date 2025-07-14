import puppeteer from "puppeteer-extra";
import { executablePath, Browser, Page } from "puppeteer";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin()); // Bypass bot detection

// ✅ List of rotating proxies (format: host:port:username:password)
const proxies = [
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-b367c8dh:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-2142kgfe:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-i0fb28e3:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-dahj2fg4:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-ig3fg33k:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-ca0d571h:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-09aij4c8:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-2i5k7g9c:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-e7k42kaf:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-zw-sid-hib4c25i:77dc4d16bf",
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

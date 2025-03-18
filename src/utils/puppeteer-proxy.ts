import puppeteer, { Browser } from "puppeteer";

// ✅ Proxy list (rotating)
const proxies = [
  "rotating.proxyempire.io:9000:GqZ2J3RuCdTrACE5:wifi;ci;orange+cote+divoire;abidjan+autonomous+district;abidjan",
];

let proxyIndex = 0; // ✅ Track which proxy is being used

export const openWebsiteWithProxy = async () => {
  let browser: Browser | null = null;

  try {
    // ✅ Select Proxy & Rotate
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length; // Rotate proxies

    // ✅ Extract Proxy Details Safely
    const [host, port, ...authParts] = proxy.split(":");
    const username = authParts.shift() ?? ""; // Extract username
    const password = authParts.join(":"); // Ensure the full password remains intact

    // ✅ Launch Puppeteer with Proxy
    browser = await puppeteer.launch({
      headless: false, // Change to true for headless mode
      args: [`--proxy-server=${host}:${port}`], // Set proxy server
    });

    const page = await browser.newPage();

    // ✅ Authenticate Proxy if Needed
    if (username && password) {
      await page.authenticate({ username, password });
    }

    // ✅ Target Website
    const targetUrl = "https://example.com";
    console.log(`🌍 Opening: ${targetUrl} via Proxy: ${host}:${port}`);

    await page.goto(targetUrl, { waitUntil: "networkidle2" });

    // ✅ Take Screenshot (Optional)
    await page.screenshot({ path: `screenshot-${proxyIndex}.png` });

    console.log("✅ Website opened successfully!");
  } catch (error) {
    console.error("❌ Error opening website with proxy:", error);
  } finally {
    // ✅ Close Browser
    if (browser) await browser.close();
  }
};

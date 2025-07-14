// src/services/launchers/launchPremierBetWithProxy.ts
import { launchBrowserWithProxy } from "../../utils/launchBrowserUtilAO";

export async function launchPremierBetWithProxy(url: string): Promise<void> {
    console.log("🚀 Launching PremierBet with proxy...");

    const { browser, page } = await launchBrowserWithProxy(false); // headless = false

    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    // await page.goto("https://www.premierbet.com/ci", { waitUntil: "networkidle2" });

    console.log("✅ PremierBet loaded via proxy. Browser will stay open.");
}

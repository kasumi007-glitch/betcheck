import { Page } from "puppeteer";
import { launchBrowser } from "../../utils/launchBrowserUtil";

class GetAccessTokenService {
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // Initial delay in ms

  /**
   * Launches the browser, navigates to the betting page, and retrieves the "access_token"
   * cookie value with retry logic in case of failures.
   */
  async getAccessToken(): Promise<string> {
    let attempt = 0;

    while (attempt < this.maxRetries) {
      const { browser, page } = await launchBrowser(true);
      try {
        await this.setupPage(page);

        // Get cookies
        const cookies = await page.browserContext().cookies();
        const accessTokenCookie = cookies.find((cookie) => cookie.name === "access_token");

        if (accessTokenCookie) {
          console.log(`✅ Access token found on attempt ${attempt + 1}`);
          return accessTokenCookie.value;
        } else {
          throw new Error("Access token not found");
        }
      } catch (error) {
        attempt++;
        console.error(`⚠️ Attempt ${attempt} failed: ${error}`);

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
          console.log(`🔄 Retrying in ${delay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error("❌ All retries failed. Unable to retrieve access token.");
          throw error;
        }
      } finally {
        await browser.close();
      }
    }

    throw new Error("Unexpected error: getAccessToken() failed after retries.");
  }

  /**
   * Prepares the page with necessary settings (like user agent) and preloads the target URL.
   */
  private async setupPage(page: Page): Promise<void> {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    const url = "https://supergooal.cm/en/betting/football";

    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      console.log("✅ Soccer section loaded!");
    } catch (error) {
      console.error("❌ Failed to load the page:", error);
      throw new Error("Page navigation timeout");
    }
  }
}

export default new GetAccessTokenService();

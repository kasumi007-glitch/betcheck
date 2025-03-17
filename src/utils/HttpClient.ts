import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

// ✅ List of rotating proxies
const proxies = [
  "rotating.proxyempire.io:9000:GqZ2J3RuCdTrACE5:wifi;ci;orange+cote+divoire;abidjan+autonomous+district;abidjan",
];

let proxyIndex = 0; // ✅ Track which proxy is being used

export const httpClientFromApi = async (
  url: string,
  options?: AxiosRequestConfig,
  retries: number = 3
): Promise<any> => {
  try {
    // ✅ Select and rotate proxy
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length;

    // ✅ Extract proxy details safely
    const [host, port, ...authParts] = proxy.split(":");
    const username = authParts.shift() ?? "";
    const password = authParts.join(":"); // Ensure full password remains intact

    // ✅ Construct proxy URL and agent
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    console.log(`🌍 Using Proxy: ${proxyUrl}`);

    // ✅ Default Axios Request Configuration
    const defaultConfig: AxiosRequestConfig = {
      httpsAgent: proxyAgent,
      timeout: 20000, // 20 seconds timeout
    };

    // Merge provided options with default configuration.
    // The url property is added here to support axios.request
    const axiosConfig: AxiosRequestConfig = {
      ...defaultConfig,
      ...options,
      url,
    };

    // ✅ Make API call using axios.request to support all HTTP methods (GET, POST, etc.)
    const response = await axios.request(axiosConfig);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error fetching data: ${error.message}`);

    // // ✅ Handle specific error codes
    // if (error.code === "ECONNABORTED") {
    //   console.warn("⚠️ Request Timeout. Retrying...");
    // } else if (error.code === "ECONNREFUSED") {
    //   console.warn("⚠️ Connection Refused. Proxy might be down.");
    // }

    // // ✅ Retry with the next proxy
    // proxyIndex = (proxyIndex + 1) % proxies.length;

    // ✅ Handle specific error codes and retry if possible.
    if (
      retries > 0 &&
      (error.code === "ECONNABORTED" || error.code === "ECONNREFUSED")
    ) {
      console.warn(
        `⚠️ Request timed out or connection refused. Retrying... Attempts left: ${retries}`
      );
      // Rotate to the next proxy
      proxyIndex = (proxyIndex + 1) % proxies.length;
      return await httpClientFromApi(url, options, retries - 1);
    }

    return null;
  }
};

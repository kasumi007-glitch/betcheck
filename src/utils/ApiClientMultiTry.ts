import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

const proxies = [
  "http://GqZ2J3RuCdTrACE5:wifi;ci;orange+cote+divoire;abidjan+autonomous+district;abidjan@rotating.proxyempire.io:9000",
];

let proxyIndex = 0;

export const fetchFromApi = async (
  url: string,
  options?: AxiosRequestConfig,
  retries = 10
) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // ✅ Select and Rotate Proxy
      const proxy = proxies[proxyIndex];
      proxyIndex = (proxyIndex + 1) % proxies.length;

      console.log(`🌍 Attempt ${attempt}: Using Proxy - ${proxy}`);

      // ✅ Set Proxy Agent
      const proxyAgent = new HttpsProxyAgent(proxy);

      // ✅ Default Axios Config
      const axiosConfig: AxiosRequestConfig = {
        ...options,
        httpsAgent: proxyAgent,
        timeout: 20000, // 20 seconds timeout
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          ...(options?.headers || {}),
        },
      };

      // ✅ Make API Call
      const response = await axios.request({ url, ...axiosConfig });
      return response.data;
    } catch (error: any) {
      console.error(`❌ Error (Attempt ${attempt}): ${error.message}`);

      if (error.code === "ECONNABORTED") {
        console.warn("⚠️ Request Timeout. Retrying...");
      } else if (error.code === "ECONNREFUSED") {
        console.warn("⚠️ Connection Refused. Rotating Proxy...");
      } else if (attempt === retries) {
        console.warn("❌ Maximum retries reached.");
        return null;
      }
    }
  }
};

/**
 * Fetches from API directly without any proxy.
 */
export const fetchFromApiWithoutProxy = async (
  url: string,
  options?: AxiosRequestConfig
) => {
  try {
    const axiosConfig: AxiosRequestConfig = {
      ...options,
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        ...(options?.headers || {}),
      },
    };

    const response = await axios.request({ url, ...axiosConfig });
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error fetching without proxy: ${error.message}`);
    return null;
  }
};

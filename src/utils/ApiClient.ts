import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent"; // Ensure correct import

// ✅ List of rotating proxies
const proxies = [
  "rotating.proxyempire.io:9000:GqZ2J3RuCdTrACE5:wifi;ci;orange+cote+divoire;abidjan+autonomous+district;abidjan",
];

let proxyIndex = 0; // ✅ Track which proxy is being used

export const fetchFromApi = async (
  url: string,
  options?: AxiosRequestConfig
) => {
  try {
    // ✅ Select and Rotate Proxy
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length;

    // ✅ Extract Proxy Details Safely
    const [host, port, ...authParts] = proxy.split(":");
    const username = authParts.shift() ?? ""; // Extract username
    const password = authParts.join(":"); // Ensure the full password remains intact

    // ✅ Set Proxy Agent (Correct Usage)
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl); // Use function call, not `new`

    console.log(`🌍 Using Proxy: ${proxyUrl}`);

    // ✅ Default Axios Request Configuration
    const defaultConfig: AxiosRequestConfig = {
      httpsAgent: proxyAgent,
      timeout: 20000, // 20 seconds timeout,
    };

    // Merge any additional options (such as headers)
    const axiosConfig: AxiosRequestConfig = { ...defaultConfig, ...options };

    // ✅ Make API Call
    const response = await axios.get(url, axiosConfig);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error fetching data: ${error.message}`);

    // ✅ Handle Timeout Specifically
    if (error.code === "ECONNABORTED") {
      console.warn("⚠️ Request Timeout. Retrying...");
    } else if (error.code === "ECONNREFUSED") {
      console.warn("⚠️ Connection Refused. Proxy might be down.");
    }

    // ✅ Retry with the Next Proxy
    proxyIndex = (proxyIndex + 1) % proxies.length;
    return null;
  }
};

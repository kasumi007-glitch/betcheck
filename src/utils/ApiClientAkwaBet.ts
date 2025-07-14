import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

const proxies = [
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-3a3b7a48:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-baieag9e:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-jabc2g8b:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-cic2gf8c:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-ikb2i9jf:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-04dfg478:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-6kjh12e9:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-f5f4g8j0:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-56cbajfi:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-ci-sid-18g8gj7h:77dc4d16bf",
];

let proxyIndex = 0; // ✅ Track which proxy is being used
// ✅ Helper for random delay between retries
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const httpClientFromApiV2 = async (
  url: string,
  method: "GET" | "POST" = "GET", // Default to GET
  data: any = null, // Optional request body
  headers: Record<string, string> = {}, // Optional headers
  retries: number = 3
): Promise<any> => {
  try {
    console.log(`🌍 Fetching: ${url}`);

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

    // ✅ Axios Request Configuration
    const axiosConfig: AxiosRequestConfig = {
      method,
      url,
      timeout: 20000,
      httpsAgent: proxyAgent,
      headers,
      ...(data && { data }), // Add data only if present
    };

    // ✅ Make API Call
    const response = await axios(axiosConfig);
    return response.data;
  } catch (error: any) {
    const status = error?.response?.status;
    const code = error?.code;
    console.error(`❌ Error fetching data: ${error.message ?? status ?? code}`);

    const transientErrors = ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"];
    const shouldRetry = transientErrors.includes(code) || status === 502;

    if (retries > 0 && shouldRetry) {
      console.warn(`🔁 Retrying... Reason: ${code || status}, Attempts left: ${retries}`);
      await delay(1000 + Math.random() * 2000);
      proxyIndex = (proxyIndex + 1) % proxies.length;
      return await httpClientFromApiV2(url, method, data, headers, retries - 1);
    }

    // ✅ Optional fallback without proxy
    console.warn("🛑 All retries failed. Trying without proxy...");
    return await fetchFromApiWithoutProxyV2(url, method, data, headers);
  }
};



/**
 * Fetches from API directly without any proxy.
 */
export const fetchFromApiWithoutProxyV2 = async (
  url: string,
  method: "GET" | "POST" = "GET", // Default to GET
  data: any = null, // Optional request body
  headers: Record<string, string> = {}, // Optional headers
  retries: number = 3
): Promise<any> => {
  try {
    // ✅ Axios Request Configuration
    const axiosConfig: AxiosRequestConfig = {
      method,
      url,
      timeout: 20000,
      headers,
      ...(data && { data }), // Add data only if present
    };

    const response = await axios(axiosConfig);
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error fetching without proxy: ${error.message}`);
    if (
      retries > 0 &&
      (error.code === "ECONNABORTED" || error.code === "ECONNREFUSED")
    ) {
      console.warn(
        `⚠️ Request timed out or connection refused. Retrying... Attempts left: ${retries}`
      );
      // Rotate to the next proxy
      proxyIndex = (proxyIndex + 1) % proxies.length;
      return await fetchFromApiWithoutProxyV2(url, method, data, headers, retries - 1);
    }
    return null;
  }
};
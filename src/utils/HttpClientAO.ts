import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

// ✅ List of rotating proxies
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

let proxyIndex = 0; // ✅ Track which proxy is being used
// ✅ Helper for random delay between retries
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const httpClientFromApi = async (
  url: string,
  options?: AxiosRequestConfig,
  retries: number = 9
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
      httpAgent: proxyAgent, // ✅ add this
      httpsAgent: proxyAgent, // ✅ still keep this for fallback
      proxy: false,
      timeout: 20000,
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
    const status = error?.response?.status;
    const code = error?.code;
    console.error(`❌ Error fetching data: ${error.message || status || code}`);

    const transientErrors = ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"];
    const shouldRetry = transientErrors.includes(code) || status === 502 || status === 403;

    if (retries > 0 && shouldRetry) {
      console.warn(`🔁 Retrying... Reason: ${code || status}, Attempts left: ${retries}`);
      await delay(1000 + Math.random() * 2000);
      proxyIndex = (proxyIndex + 1) % proxies.length;
      return await httpClientFromApi(url, options, retries - 1);
    }

    console.warn("🛑 All retries failed. Trying without proxy...");
    return await fetchFromApiWithoutProxy(url, options);
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
      timeout: 20000
    };

    const response = await axios.request({ url, ...axiosConfig });
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error fetching without proxy: ${error.message}`);
    return null;
  }
};
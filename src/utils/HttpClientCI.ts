import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

// ✅ List of rotating proxies
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

export interface RequestOptions extends AxiosRequestConfig {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: any;
}

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
    const shouldRetry = transientErrors.includes(code) || status === 502;

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

/**
 * Fetches from API directly without any proxy.
 */
export const fetchFromApiWithoutProxyy = async (
  url: string,
  options: RequestOptions = {},
  retries: number = 3  // no-proxy retry limit
): Promise<any> => {
  const {
    method = "GET",
    headers,
    params,
    data,
    timeout = 20_000,
    ...restConfig
  } = options;

  try {
    console.log(`👉 No-proxy ${method} ${url}`);
    const response = await axios.request({
      url,
      method,
      headers,
      params,
      data,
      timeout,
      ...restConfig,
    });
    return response.data;
  } catch (error: any) {
    const status = error?.response?.status;
    const code = error?.code;
    console.error(`❌ No-proxy error: ${error.message ?? status ?? code}`);

    const transientErrors = ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"];
    const shouldRetry = transientErrors.includes(code) || status === 502;

    if (retries > 0 && shouldRetry) {
      console.warn(`🔁 No-proxy retry... Reason: ${code ?? status}, Attempts left: ${retries}`);
      await delay(1_000 + Math.random() * 2_000);
      return fetchFromApiWithoutProxyy(url, options, retries - 1);
    }

    console.warn("🛑 No-proxy retries exhausted.");
    return null;
  }
};
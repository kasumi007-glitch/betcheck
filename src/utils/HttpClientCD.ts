import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { RequestOptions } from "./HttpClientCI";

// ✅ List of rotating proxies
const proxies = [
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-k5j19die:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-b5ek67jg:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-i6cabh1b:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-83999hie:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-hgggih6j:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-25gc7did:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-81hk7fk9:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-a7555c2e:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-572cf77i:77dc4d16bf",
  "v2.proxyempire.io:5000:r_5bc8550750-country-cd-sid-d7e673fh:77dc4d16bf",
];

let proxyIndex = 0; // ✅ Track which proxy is being used
// ✅ Helper for random delay between retries
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const httpClientFromApi = async (
  url: string,
  options: RequestOptions = {},
  retries: number = 9
): Promise<any> => {
  // Mirror fetchFromApiWithoutProxy option handling
  const {
    method = "GET",
    headers,
    params,
    data,
    timeout = 20_000,
    ...restConfig
  } = options;

  try {
    // ✅ Select and rotate proxy
    const proxy = proxies[proxyIndex];
    proxyIndex = (proxyIndex + 1) % proxies.length;

    // ✅ Extract proxy details safely
    const [host, port, ...authParts] = proxy.split(":");
    const username = authParts.shift() ?? "";
    const password = authParts.join(":"); // keep full password intact

    // ✅ Construct proxy URL and agent
    const proxyUrl = `http://${username}:${password}@${host}:${port}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    console.log(`🌍 Using Proxy: ${proxyUrl}`);

    // ✅ Build axios config just like no-proxy version, but with proxy agents
    const axiosConfig: AxiosRequestConfig = {
      url,
      method,
      headers,
      params,
      data,
      timeout,
      httpAgent: proxyAgent,
      httpsAgent: proxyAgent,
      proxy: false, // important when supplying custom agents
      ...restConfig,
    };

    const response = await axios.request(axiosConfig);
    return response.data;
  } catch (error: any) {
    // Enhanced error logging (parity with no-proxy)
    if (error.response) {
      console.error("❌ Full Error Response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
        },
      });
    } else if (error.request) {
      console.error("❌ No response received:", error.request);
    } else {
      console.error("❌ Request setup error:", error.message);
    }

    const status = error?.response?.status;
    const code = error?.code;
    console.error(`❌ Proxy error: ${error.message || status || code}`);

    // Keep your retry conditions (incl. 403 & 502)
    const transientErrors = ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"];
    const shouldRetry = transientErrors.includes(code) || status === 502 || status === 403;

    if (retries > 0 && shouldRetry) {
      console.warn(`🔁 Retrying with next proxy... Reason: ${code || status}, Attempts left: ${retries}`);
      await delay(1_000 + Math.random() * 2_000);
      proxyIndex = (proxyIndex + 1) % proxies.length; // rotate again before retry
      return await httpClientFromApi(url, options, retries - 1);
    }

    console.warn("🛑 All proxy retries failed. Trying without proxy...");
    return await fetchFromApiWithoutProxy(url, options, retries);
  }
};

/**
 * Fetches from API directly without any proxy.
 */
export const fetchFromApiWithoutProxy = async (
  url: string,
  options: RequestOptions = {},
  retries: number = 3
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
    // Enhanced error logging
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error('❌ Full Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data, // This is often the most important part
        config: {
          url: error.config.url,
          method: error.config.method,
          headers: error.config.headers,
        }
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('❌ No response received:', error.request);
    } else {
      // Something happened in setting up the request
      console.error('❌ Request setup error:', error.message);
    }

    const status = error?.response?.status;
    const code = error?.code;
    console.error(`❌ No-proxy error: ${error.message ?? status ?? code}`);

    const transientErrors = ["ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"];
    const shouldRetry = transientErrors.includes(code) || status === 502;

    if (retries > 0 && shouldRetry) {
      console.warn(`🔁 No-proxy retry... Reason: ${code ?? status}, Attempts left: ${retries}`);
      await delay(1_000 + Math.random() * 2_000);
      return fetchFromApiWithoutProxy(url, options, retries - 1);
    }

    console.warn("🛑 No-proxy retries exhausted.");
    return null;
  }
};
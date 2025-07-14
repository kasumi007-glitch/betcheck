import axios, { AxiosRequestConfig } from "axios";
import tunnel from "tunnel";

// ✅ List of rotating proxies
const proxies = [
  "proxy.soax.com:9000:WqCb6CokJIWnXEXI:wifi;ci;;;",
];

let proxyIndex = 0;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const tunnelClientFromApi = async (
  url: string,
  options?: AxiosRequestConfig,
  retries: number = 9
): Promise<any> => {
  try {
    // ✅ Rotate proxy
    const proxy = proxies[proxyIndex];  
    proxyIndex = (proxyIndex + 1) % proxies.length;

    // ✅ Extract proxy parts
    const [host, port, ...authParts] = proxy.split(":");
    const username = authParts.shift() ?? "";
    const password = authParts.join(":");

    // ✅ Setup tunnel agent
    const agent = tunnel.httpsOverHttp({
      proxy: {
        host,
        port: parseInt(port),
        proxyAuth: `${username}:${password}`,
      },
    });

    console.log(`🌍 Using Proxy: ${username}@${host}:${port}`);

    const defaultConfig: AxiosRequestConfig = {
      httpsAgent: agent,
      proxy: false, // disable default axios proxy
      timeout: 20000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        Origin: "https://sport.akwabet.com",
        Referer: "https://sport.akwabet.com/",
        "Content-Type": "application/json; charset=UTF-8",
        "sec-ch-ua": "\"Chromium\";v=\"136\", \"Google Chrome\";v=\"136\", \"Not.A/Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
      },
    };

    const axiosConfig: AxiosRequestConfig = {
      ...defaultConfig,
      ...options,
      url,
    };

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
      return await tunnelClientFromApi(url, options, retries - 1);
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
      timeout: 20000,
    };

    const response = await axios.request({ url, ...axiosConfig });
    return response.data;
  } catch (error: any) {
    console.error(`❌ Error fetching without proxy: ${error.message}`);
    return null;
  }
};

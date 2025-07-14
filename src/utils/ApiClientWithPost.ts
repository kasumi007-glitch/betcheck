import axios, { AxiosRequestConfig } from "axios";
import { HttpsProxyAgent } from "https-proxy-agent"; // Ensure correct import

// ✅ List of rotating proxies
const proxies = [
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-2e975ea8:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-3ii5094j:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-ij2ifk77:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-2ke23i5a:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-2e5g61ad:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-0j11eh6k:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-2eda99f9:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-gfh76i62:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-dd2d95i3:77dc4d16bf",
    "v2.proxyempire.io:5000:r_5bc8550750-country-gn-sid-85ig69ha:77dc4d16bf",
];

let proxyIndex = 0; // ✅ Track which proxy is being used
export const fetchFromApi = async (
    url: string,
    method: "GET" | "POST" = "GET", // Default to GET
    data: any = null, // Optional request body
    headers: Record<string, string> = {} // Optional headers
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

        // ✅ Axios Request Configuration
        const axiosConfig: AxiosRequestConfig = {
            method,
            url,
            httpsAgent: proxyAgent,
            timeout: 20000,
            headers,
            ...(data && { data }), // Add data only if present
        };

        // ✅ Make API Call
        const response = await axios(axiosConfig);
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

/**
 * Fetches from API directly without any proxy.
 */
export const fetchFromApiWithoutProxy = async (
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
            return await fetchFromApiWithoutProxy(url, method, data, headers, retries - 1);
        }
        return null;
    }
};
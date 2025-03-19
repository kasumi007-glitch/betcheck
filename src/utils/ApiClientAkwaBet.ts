import axios, { AxiosRequestConfig } from "axios";

export const fetchFromApi = async (
    url: string,
    method: "GET" | "POST" = "GET", // Default to GET
    data: any = null, // Optional request body
    headers: Record<string, string> = {} // Optional headers
) => {
  try {
    console.log(`🌍 Fetching: ${url}`);

    // ✅ Axios Request Configuration
    const axiosConfig: AxiosRequestConfig = {
      method,
      url,
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
      console.warn("⚠️ Connection Refused. Server might be down.");
    }

    return null;
  }
};
import axios from "axios";
import toast from "react-hot-toast";

// Get the base URL - check if we're in development
const getBaseURL = () => {
  if (import.meta.env.MODE === "development") {
    // Try to detect the backend port from environment or use default
    const backendPort = import.meta.env.VITE_BACKEND_PORT || "3000";
    return `http://localhost:${backendPort}/api`;
  }
  return "/api";
};

export const axiosInstance = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  timeout: 10000, // 10 second timeout
});

// Add request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.code === "ECONNABORTED") {
      toast.error("Request timeout. Please check your connection.");
    } else if (error.code === "ERR_NETWORK" || !error.response) {
      toast.error(
        "Network error. Please make sure the backend server is running on port 3000."
      );
      console.error("Network Error:", error.message);
    } else if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      if (status === 401) {
        // Unauthorized - might need to handle logout
        console.log("Unauthorized access");
      } else if (status >= 500) {
        toast.error("Server error. Please try again later.");
      }
    }
    return Promise.reject(error);
  }
);

import axios, { InternalAxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    config.headers = config.headers ?? {};

    // Pega o token do localStorage
    const token = localStorage.getItem("authToken") ?? "";

    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    config.headers["Accept"] = "application/json";

    return config;
  },
  (error) => Promise.reject(error)
);

export default api;


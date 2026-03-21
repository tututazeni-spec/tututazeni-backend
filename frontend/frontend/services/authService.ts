import axios, { InternalAxiosRequestConfig } from "axios";

export const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    config.headers = config.headers ?? {};
    const token = localStorage.getItem("authToken") ?? "";
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
    config.headers["Accept"] = "application/json";
    return config;
  },
  (error) => Promise.reject(error)
);

import axios from "axios";
import { useAuthStore } from "@/store/authStore";

const API_BASE = "http://localhost:8000";

export const api = axios.create({ baseURL: API_BASE });

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 (e.g. backend restarted, token wiped from memory)
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Auth
export const loginApi = (username: string, password: string) =>
  api.post<{ token: string; username: string }>("/login", { username, password });

// Image detection
export const detectImageApi = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post<{
    detections: { label: string; confidence: number; bbox: number[] }[];
    image_b64: string;
  }>("/detect/image", form);
};

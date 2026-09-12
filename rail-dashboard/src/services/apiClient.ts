import axios from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && !window.location.hostname.includes('render.com')
    ? `http://${window.location.hostname}:5000`
    : 'https://rpb-backend.onrender.com');

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('rail_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Plain client for health/status checks — no auth headers, no redirect interceptors.
// Used to probe the AI engine health proxy without affecting auth state.
export const healthCheckClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 6000,
});

export default apiClient;

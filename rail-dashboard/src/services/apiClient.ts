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

// Inject Bearer token on every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('rail_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rail_token');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// Plain client for health/status checks — no auth headers, no redirect interceptors.
// Used to probe the AI engine health proxy without affecting auth state.
export const healthCheckClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 6000,
});

export default apiClient;

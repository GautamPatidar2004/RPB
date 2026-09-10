import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://rpb-backend.onrender.com';

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

export default apiClient;

import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 45000, // 45s for AI calls
  headers: { 'Content-Type': 'application/json' }
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rezona_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally (expired/invalid token) + network errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('rezona_token');
      localStorage.removeItem('rezona_user');
      window.location.href = '/login';
    }
    // Provide better error messages for common failures
    if (!error.response && error.code === 'ECONNABORTED') {
      error.message = 'Request timed out. The AI service may be slow — please try again.';
    } else if (!error.response) {
      error.message = 'Network error. Please check your connection and try again.';
    }
    return Promise.reject(error);
  }
);

export default api;

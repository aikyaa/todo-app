import axios from 'axios';

// ── Auth API (no token needed) ────────────────────────────────────────────────
const BASE = process.env.REACT_APP_API_URL || 'http://localhost:8080';

const AUTH = axios.create({ baseURL: `${BASE}/auth` });

export const register = (name, email, password) => AUTH.post('/register', { name, email, password });
export const login    = (email, password)        => AUTH.post('/login',    { email, password });

// ── Task API (JWT required) ───────────────────────────────────────────────────
const API = axios.create({ baseURL: `${BASE}/api` });

// Attach JWT token to every outgoing request
API.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Handle expired or invalid token — clear storage and reload to show login screen
API.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            window.location.reload();
        }
        return Promise.reject(error);
    }
);

export const createTask = (rawInput)  => API.post('/tasks', { rawInput });
export const getAllTasks = (status)   => API.get('/tasks', { params: status ? { status } : {} });
export const updateTask = (id, data) => API.put(`/tasks/${id}`, data);
export const deleteTask = (id)       => API.delete(`/tasks/${id}`);

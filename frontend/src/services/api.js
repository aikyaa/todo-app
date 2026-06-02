import axios from 'axios';

// ── Auth API (no token needed) ────────────────────────────────────────────────
const AUTH = axios.create({ baseURL: 'http://localhost:8080/auth' });

export const register = (name, email, password) => AUTH.post('/register', { name, email, password });
export const login    = (email, password)        => AUTH.post('/login',    { email, password });

// ── Task API (JWT required) ───────────────────────────────────────────────────
const API = axios.create({ baseURL: 'http://localhost:8080/api' });

// Interceptor — attaches the JWT token from localStorage to every task request
// Runs automatically before each request is sent
API.interceptors.request.use(config => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export const createTask  = (rawInput)  => API.post('/tasks', { rawInput });
export const getAllTasks  = (status)    => API.get('/tasks', { params: status ? { status } : {} });
export const getTask     = (id)        => API.get(`/tasks/${id}`);
export const updateTask  = (id, data)  => API.put(`/tasks/${id}`, data);
export const deleteTask  = (id)        => API.delete(`/tasks/${id}`);

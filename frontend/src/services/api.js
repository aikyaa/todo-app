import axios from 'axios';

// Axios instance with the backend base URL pre-configured
// All API calls go through this so the base URL is defined in one place
const API = axios.create({ baseURL: 'http://localhost:8080/api' });

// POST /api/tasks — creates a new task from raw natural language input
export const createTask  = (rawInput)  => API.post('/tasks', { rawInput });

// GET /api/tasks          — fetch all tasks
// GET /api/tasks?status=X — fetch only tasks with a specific status
export const getAllTasks  = (status)   => API.get('/tasks', { params: status ? { status } : {} });

// GET /api/tasks/:id — fetch a single task by ID (used by the polling loop)
export const getTask     = (id)        => API.get(`/tasks/${id}`);

// PUT /api/tasks/:id — update one or more fields on an existing task
export const updateTask  = (id, data)  => API.put(`/tasks/${id}`, data);

// DELETE /api/tasks/:id — permanently remove a task
export const deleteTask  = (id)        => API.delete(`/tasks/${id}`);

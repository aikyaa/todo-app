import { useState, useEffect, useCallback } from 'react';
import { createTask, getAllTasks, getTask, updateTask, deleteTask, login, register } from './services/api';

const STATUSES = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];
const POLL_MS  = 3000;

export default function App() {
  // Auth state — token comes from localStorage so it persists across page refreshes
  const [token,    setToken]    = useState(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState('login');   // 'login' or 'register'
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  // Core state
  const [tasks,    setTasks]    = useState([]);
  const [filter,   setFilter]   = useState('ALL');
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Edit state
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

  // Plain object used as a map of taskId → interval ID for polling
  // Not in useState because changes to it shouldn't trigger re-renders
  const pollingRef = {};

  // Fetches tasks from the backend based on the current filter tab
  // ── Auth handlers ──────────────────────────────────────────────────────────

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = authMode === 'login'
        ? await login(authForm.email, authForm.password)
        : await register(authForm.name, authForm.email, authForm.password);
      localStorage.setItem('token', res.data.token);
      setToken(res.data.token);
    } catch (e) {
      setAuthError(e.response?.data?.error || 'Something went wrong');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setTasks([]);
  };

  // Show login/register screen if not authenticated
  if (!token) {
    return (
      <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px', fontFamily: 'sans-serif' }}>
        <h1 style={{ marginBottom: 4 }}>📝 TodoAI</h1>
        <p style={{ color: '#666', marginBottom: 24 }}>{authMode === 'login' ? 'Sign in to continue' : 'Create an account'}</p>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {authMode === 'register' && (
            <input placeholder="Name" value={authForm.name}
              onChange={e => setAuthForm(p => ({ ...p, name: e.target.value }))} style={inputSt} />
          )}
          <input placeholder="Email" type="email" value={authForm.email}
            onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} style={inputSt} />
          <input placeholder="Password" type="password" value={authForm.password}
            onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))} style={inputSt} />
          {authError && <p style={{ color: 'red', margin: 0 }}>{authError}</p>}
          <button type="submit" style={{ ...btnSt, background: '#2563eb', padding: '10px' }}>
            {authMode === 'login' ? 'Sign In' : 'Register'}
          </button>
        </form>
        <p style={{ marginTop: 16, color: '#666', fontSize: 14 }}>
          {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
            style={{ color: '#2563eb', cursor: 'pointer' }}>
            {authMode === 'login' ? 'Register' : 'Sign In'}
          </span>
        </p>
      </div>
    );
  }

  // ── Task handlers ───────────────────────────────────────────────────────────

  // useCallback memoizes the function so it doesn't get recreated on every render
  const load = useCallback(async () => {
    try {
      const res = await getAllTasks(filter === 'ALL' ? null : filter);
      setTasks(res.data);
    } catch (e) {
      console.error(e);
    }
  }, [filter]);

  // Re-fetch tasks whenever the filter changes
  useEffect(() => { load(); }, [load]);

  // Polling: for any task still showing "Processing…", start a 3-second interval
  // that checks if the backend has finished AI enrichment yet
  useEffect(() => {
    tasks.forEach(t => {
      if (t.title === 'Processing…' && !pollingRef[t.id]) {
        pollingRef[t.id] = setInterval(async () => {
          try {
            const res = await getTask(t.id);
            if (res.data.title !== 'Processing…') {
              // AI enrichment done — stop polling and update this task in the list
              clearInterval(pollingRef[t.id]);
              delete pollingRef[t.id];
              setTasks(prev => prev.map(p => p.id === t.id ? res.data : p));
            }
          } catch {
            clearInterval(pollingRef[t.id]);
          }
        }, POLL_MS);
      }
    });
    // Cleanup: clear all running intervals when this component unmounts
    return () => Object.values(pollingRef).forEach(clearInterval);
  }, [tasks]); // eslint-disable-line

  // Called when the user submits the create form
  const handleCreate = async (e) => {
    e.preventDefault();                   // prevent page reload on form submit
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await createTask(input.trim());
      setTasks(prev => [res.data, ...prev]);  // prepend new task to the top of the list
      setInput('');
    } catch (e) {
      setError('Failed to create task.');
    } finally {
      setLoading(false);
    }
  };

  // Quick status change via the dropdown on each task card (no edit form needed)
  const handleStatusChange = async (id, status) => {
    try {
      const res = await updateTask(id, { status });
      setTasks(prev => prev.map(t => t.id === id ? res.data : t));
    } catch (e) {
      console.error(e);
    }
  };

  // Deletes a task after a confirmation prompt
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id)); // remove from list without re-fetching
    } catch (e) {
      console.error(e);
    }
  };

  // Puts a task into edit mode — copies its current values into editData
  const startEdit = (task) => {
    setEditId(task.id);
    setEditData({
      title:       task.title || '',
      description: task.description || '',
      status:      task.status || 'PENDING',
      priority:    task.priority || 'MEDIUM',
      category:    task.category || '',
      // slice(0, 16) trims the ISO string to "YYYY-MM-DDTHH:mm" which is what datetime-local inputs expect
      deadline:    task.deadline ? task.deadline.slice(0, 16) : '',
    });
  };

  // Saves the edited task — converts the deadline back to a full ISO string before sending
  const handleEditSave = async () => {
    try {
      const payload = { ...editData };
      if (payload.deadline) payload.deadline = new Date(payload.deadline).toISOString().slice(0, 19);
      const res = await updateTask(editId, payload);
      setTasks(prev => prev.map(t => t.id === editId ? res.data : t));
      setEditId(null); // exit edit mode
    } catch (e) {
      console.error(e);
    }
  };

  // Client-side filter — when filter is ALL we show everything, otherwise filter by status
  const displayed = tasks.filter(t =>
    filter === 'ALL' ? true : t.status === filter
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>📝 TodoAI</h1>
        <button onClick={handleLogout} style={{ ...btnSt, background: '#6b7280', fontSize: 12 }}>Sign Out</button>
      </div>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Describe a task in plain English — AI will extract the details.
      </p>

      {/* Create form */}
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder='e.g. "Finish report by Friday, high priority"'
          style={{ flex: 1, padding: '10px 12px', fontSize: 15, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <button type="submit" disabled={loading}
          style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 15 }}>
          {loading ? '…' : 'Add'}
        </button>
      </form>
      {error && <p style={{ color: 'red', marginBottom: 12 }}>{error}</p>}

      {/* Filter tabs — clicking a tab re-fetches tasks with that status filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: '1px solid #ccc',
              background: filter === s ? '#2563eb' : '#fff',
              color: filter === s ? '#fff' : '#333',
              cursor: 'pointer', fontSize: 13,
            }}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {displayed.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No tasks yet.</p>
      )}

      {/* Task list */}
      {displayed.map(task => (
        <div key={task.id} style={{
          border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px',
          marginBottom: 12, background: '#fff',
        }}>
          {editId === task.id ? (
            /* ── Edit form: shown when user clicks Edit on a task ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={editData.title} onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                placeholder="Title" style={inputSt} />
              <textarea value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                placeholder="Description" rows={2} style={{ ...inputSt, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={editData.status} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))} style={inputSt}>
                  {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={editData.priority} onChange={e => setEditData(p => ({ ...p, priority: e.target.value }))} style={inputSt}>
                  {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <option key={p}>{p}</option>)}
                </select>
                <input value={editData.category} onChange={e => setEditData(p => ({ ...p, category: e.target.value }))}
                  placeholder="Category" style={inputSt} />
                <input type="datetime-local" value={editData.deadline}
                  onChange={e => setEditData(p => ({ ...p, deadline: e.target.value }))} style={inputSt} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleEditSave} style={{ ...btnSt, background: '#16a34a' }}>Save</button>
                <button onClick={() => setEditId(null)} style={{ ...btnSt, background: '#6b7280' }}>Cancel</button>
              </div>
            </div>
          ) : (
            /* ── View mode: normal task card ── */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                {/* Title — greyed out while still processing */}
                <span style={{ fontWeight: 600, fontSize: 16, color: task.title === 'Processing…' ? '#94a3b8' : '#111' }}>
                  {task.title === 'Processing…' ? '⏳ Processing…' : task.title}
                </span>
                {/* Priority and category badges */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {task.priority && <Badge label={task.priority} color={priorityColor(task.priority)} />}
                  {task.category && <Badge label={task.category} color="#e0e7ff" textColor="#4338ca" />}
                </div>
              </div>

              {task.description && (
                <p style={{ margin: '6px 0 0', color: '#555', fontSize: 14 }}>{task.description}</p>
              )}
              {task.deadline && (
                <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>
                  📅 {new Date(task.deadline).toLocaleString()}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Quick status dropdown — saves immediately on change */}
                <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}
                  style={{ fontSize: 13, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}>
                  {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(s =>
                    <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <button onClick={() => startEdit(task)} style={{ ...btnSt, background: '#2563eb' }}>Edit</button>
                <button onClick={() => handleDelete(task.id)} style={{ ...btnSt, background: '#dc2626' }}>Delete</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// Shared inline styles for form inputs and buttons
const inputSt = { padding: '7px 10px', border: '1px solid #ccc', borderRadius: 5, fontSize: 14, width: '100%' };
const btnSt   = { padding: '6px 14px', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13 };

// Small coloured label shown on task cards for priority and category
function Badge({ label, color, textColor = '#fff' }) {
  return (
    <span style={{ padding: '2px 8px', background: color, color: textColor, borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

// Maps priority level to a colour for the badge
function priorityColor(p) {
  return { LOW: '#6b7280', MEDIUM: '#2563eb', HIGH: '#d97706', URGENT: '#dc2626' }[p] || '#6b7280';
}

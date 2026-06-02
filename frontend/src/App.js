import { useState, useEffect, useCallback, useRef } from 'react';
import { createTask, getAllTasks, getTask, updateTask, deleteTask, login, register } from './services/api';

const STATUSES = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];
const POLL_MS  = 3000;

export default function App() {
  const [token,     setToken]     = useState(localStorage.getItem('token'));
  const [authMode,  setAuthMode]  = useState('login');
  const [authForm,  setAuthForm]  = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [tasks,    setTasks]    = useState([]);
  const [filter,   setFilter]   = useState('ALL');
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

  // useRef persists the map across renders without triggering re-renders
  const pollingRef = useRef({});

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

  const load = useCallback(async () => {
    try {
      const res = await getAllTasks(filter === 'ALL' ? null : filter);
      setTasks(res.data);
    } catch (e) {
      console.error(e);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    tasks.forEach(t => {
      if (!t.enriched && !pollingRef.current[t.id]) {
        pollingRef.current[t.id] = setInterval(async () => {
          try {
            const res = await getTask(t.id);
            if (res.data.enriched) {
              clearInterval(pollingRef.current[t.id]);
              delete pollingRef.current[t.id];
              setTasks(prev => prev.map(p => p.id === t.id ? res.data : p));
            }
          } catch {
            clearInterval(pollingRef.current[t.id]);
          }
        }, POLL_MS);
      }
    });
    return () => Object.values(pollingRef.current).forEach(clearInterval);
  }, [tasks]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await createTask(input.trim());
      setTasks(prev => [res.data, ...prev]);
      setInput('');
    } catch (e) {
      setError('Failed to create task.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const res = await updateTask(id, { status });
      setTasks(prev => prev.map(t => t.id === id ? res.data : t));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const startEdit = (task) => {
    setEditId(task.id);
    setEditData({
      title:       task.title || '',
      description: task.description || '',
      status:      task.status || 'PENDING',
      priority:    task.priority || 'MEDIUM',
      category:    task.category || '',
      deadline:    task.deadline ? task.deadline.slice(0, 16) : '',
    });
  };

  const handleEditSave = async () => {
    try {
      const payload = { ...editData };
      if (payload.deadline) payload.deadline = new Date(payload.deadline).toISOString().slice(0, 19);
      const res = await updateTask(editId, payload);
      setTasks(prev => prev.map(t => t.id === editId ? res.data : t));
      setEditId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const displayed = tasks;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>📝 TodoAI</h1>
        <button onClick={handleLogout} style={{ ...btnSt, background: '#6b7280', fontSize: 12 }}>Sign Out</button>
      </div>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Describe a task in plain English — AI will extract the details.
      </p>

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

      {displayed.length === 0 && (
        <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No tasks yet.</p>
      )}

      {displayed.map(task => (
        <div key={task.id} style={{
          border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px',
          marginBottom: 12, background: '#fff',
        }}>
          {editId === task.id ? (
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
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontWeight: 600, fontSize: 16, color: !task.enriched ? '#94a3b8' : '#111' }}>
                  {!task.enriched ? `⏳ ${task.title}` : task.title}
                </span>
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

const inputSt = { padding: '7px 10px', border: '1px solid #ccc', borderRadius: 5, fontSize: 14, width: '100%' };
const btnSt   = { padding: '6px 14px', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 13 };

function Badge({ label, color, textColor = '#fff' }) {
  return (
    <span style={{ padding: '2px 8px', background: color, color: textColor, borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function priorityColor(p) {
  return { LOW: '#6b7280', MEDIUM: '#2563eb', HIGH: '#d97706', URGENT: '#dc2626' }[p] || '#6b7280';
}

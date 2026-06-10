import { useState, useEffect, useCallback, useRef } from 'react';
import { createTask, getAllTasks, updateTask, deleteTask, login, register } from './services/api';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const STATUSES   = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];
const PRIORITIES = ['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'];

// Priority sort order — URGENT first
const PRIORITY_ORDER = { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };

const GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; }

  .task-card {
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .task-card:hover {
    transform: translateY(-1px);
    border-color: #4b4e63 !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  }

  .btn { transition: opacity 0.15s ease, transform 0.12s ease, background 0.15s ease; }
  .btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
  .btn:active:not(:disabled) { transform: translateY(0); opacity: 1; }

  .filter-tab {
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .filter-tab:hover { border-color: #a78bfa60 !important; color: #a78bfa !important; }

  .field:focus {
    border-color: #a78bfa !important;
    box-shadow: 0 0 0 3px rgba(167,139,250,0.12);
    outline: none;
  }

  .signout-btn { transition: background 0.15s ease, color 0.15s ease; }
  .signout-btn:hover { background: #2e3140 !important; color: #e2e4f0 !important; }

  .auth-input:focus {
    border-color: #a78bfa !important;
    box-shadow: 0 0 0 3px rgba(167,139,250,0.1);
    outline: none;
  }

  .auth-btn { transition: opacity 0.15s ease, transform 0.12s ease; }
  .auth-btn:hover  { opacity: 0.88; transform: translateY(-1px); }
  .auth-btn:active { transform: translateY(0); }

  .task-card:hover .priority-bar { opacity: 1 !important; }

  .badge { transition: transform 0.15s ease; }
  .task-card:hover .badge { transform: scale(1.04); }

  .action-btn { transition: opacity 0.15s ease, transform 0.12s ease; }
  .action-btn:hover { opacity: 0.8; transform: translateY(-1px); }

  select.field:focus { outline: none; }

  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50%       { opacity: 1;   }
  }
  .btn-loading { animation: pulse 1.2s ease-in-out infinite; }
`;

function GlobalStyles() { return <style>{GLOBAL_CSS}</style>; }

// ── Soft dark palette ─────────────────────────────────────────────────────────
const C = {
  bg:          '#1c1e26',
  surface:     '#252731',
  surfaceHigh: '#2e3140',
  border:      '#383b4d',
  purple:      '#a78bfa',
  purpleDim:   '#2d2640',
  teal:        '#5eead4',
  tealDim:     '#1a2e2e',
  rose:        '#fb7185',
  roseDim:     '#2e1a20',
  amber:       '#fbbf24',
  amberDim:    '#2e2410',
  green:       '#4ade80',
  greenDim:    '#1a2e1a',
  text:        '#e2e4f0',
  textMuted:   '#7c7f96',
  textDim:     '#4b4e63',
};

export default function App() {
  const [token,     setToken]     = useState(localStorage.getItem('token'));
  const [authMode,  setAuthMode]  = useState('login');
  const [authForm,  setAuthForm]  = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [tasks,          setTasks]          = useState([]);
  const [statusFilter,   setStatusFilter]   = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [input,          setInput]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');

  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

  const stompRef = useRef(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');

    // Client-side validation — fast feedback before hitting the API
    if (authMode === 'register') {
      if (!authForm.name.trim())
        return setAuthError('Name is required');
      if (!authForm.email.trim())
        return setAuthError('Email is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authForm.email))
        return setAuthError('Please enter a valid email address');
      if (authForm.password.length < 6)
        return setAuthError('Password must be at least 6 characters');
    } else {
      if (!authForm.email.trim())
        return setAuthError('Email is required');
      if (!authForm.password)
        return setAuthError('Password is required');
    }

    try {
      const res = authMode === 'login'
        ? await login(authForm.email, authForm.password)
        : await register(authForm.name, authForm.email, authForm.password);
      localStorage.setItem('token', res.data.token);
      setToken(res.data.token);
    } catch (err) {
      const msg = err.response?.data?.error;
      setAuthError(msg || 'Something went wrong. Please try again.');
    }
  };

  const handleLogout = () => {
    // Explicitly close the WebSocket before clearing state
    stompRef.current?.deactivate();
    stompRef.current = null;
    localStorage.removeItem('token');
    setToken(null);
    setTasks([]);
    setStatusFilter('ALL');
    setPriorityFilter('ALL');
  };

  // ── Data loading ──────────────────────────────────────────────────────────
  // Fetch all tasks from server; client-side filtering handles status+priority.
  const load = useCallback(async () => {
    try {
      const res = await getAllTasks();
      setTasks(res.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (token) load(); }, [load, token]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const client = new Client({
      webSocketFactory: () =>
        new SockJS((process.env.REACT_APP_API_URL || 'http://localhost:8080') + '/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      onConnect: () => {
        client.subscribe('/user/queue/tasks', message => {
          const updated = JSON.parse(message.body);
          setTasks(prev => {
            const exists = prev.some(t => t.id === updated.id);
            return exists
              ? prev.map(t => t.id === updated.id ? updated : t)
              : [updated, ...prev];
          });
        });
        load();
      },
      onDisconnect: () => console.log('WebSocket disconnected'),
      onStompError:  frame => console.error('STOMP error', frame),
    });

    client.activate();
    stompRef.current = client;

    return () => {
      client.deactivate();
      stompRef.current = null;
    };
  }, [token]);

  // ── Derived: filtered + priority-sorted task list ─────────────────────────
  const displayedTasks = tasks
    .filter(t => statusFilter   === 'ALL' || t.status   === statusFilter)
    .filter(t => priorityFilter === 'ALL' || t.priority === priorityFilter)
    .sort((a, b) =>
      (PRIORITY_ORDER[a.priority] || 5) - (PRIORITY_ORDER[b.priority] || 5)
    );

  // ── Task actions ──────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await createTask(input.trim());
      setTasks(prev => [res.data, ...prev]);
      setInput('');
    } catch {
      setError('Failed to create task.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const res = await updateTask(id, { status });
      setTasks(prev => prev.map(t => t.id === id ? res.data : t));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await deleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
  };

  const statusLabel = s => ({
    PENDING: 'Pending', IN_PROGRESS: 'In Progress',
    COMPLETED: 'Done', FAILED: 'Failed', ALL: 'All',
  }[s] || s);

  // ── Auth screen ───────────────────────────────────────────────────────────
  if (!token) {
    return (
      <>
        <GlobalStyles />
        <div style={{
          minHeight: '100vh', background: C.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          <div style={{
            background: C.surface, borderRadius: 16, padding: '40px 36px',
            border: `1px solid ${C.border}`, width: '100%', maxWidth: 400,
          }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📝</div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.text }}>TodoAI</h1>
              <p style={{ margin: '6px 0 0', color: C.textMuted, fontSize: 14 }}>
                {authMode === 'login' ? 'Sign in to continue' : 'Create your account'}
              </p>
            </div>
            <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {authMode === 'register' && (
                <input className="auth-input" placeholder="Full name" value={authForm.name}
                  onChange={e => setAuthForm(p => ({ ...p, name: e.target.value }))} style={authInputSt} />
              )}
              <input className="auth-input" placeholder="Email address" type="email" value={authForm.email}
                onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} style={authInputSt} />
              <input className="auth-input" placeholder="Password" type="password" value={authForm.password}
                onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))} style={authInputSt} />
              {authError && (
                <div style={{
                  background: C.roseDim, border: `1px solid ${C.rose}33`,
                  borderRadius: 8, padding: '10px 12px', color: C.rose, fontSize: 13,
                }}>
                  {authError}
                </div>
              )}
              <button type="submit" className="auth-btn" style={{
                padding: '11px', background: C.purple, color: C.bg,
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 14, fontWeight: 700, marginTop: 4,
              }}>
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
            <p style={{ textAlign: 'center', marginTop: 20, color: C.textMuted, fontSize: 13 }}>
              {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <span onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
                style={{ color: C.purple, cursor: 'pointer', fontWeight: 500 }}>
                {authMode === 'login' ? 'Register' : 'Sign In'}
              </span>
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <>
    <GlobalStyles />
    <div style={{
      minHeight: '100vh', background: C.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: C.text,
    }}>
      {/* Header */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: '0 24px', height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: C.text, letterSpacing: '-0.01em' }}>
          📝 <span style={{ color: C.purple }}>Todo</span>AI
        </div>
        <button className="signout-btn" onClick={handleLogout} style={{
          padding: '5px 14px', background: 'transparent', color: C.textMuted,
          border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', fontSize: 12,
        }}>Sign Out</button>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>

        {/* Create input */}
        <div style={{
          background: C.surface, borderRadius: 12, padding: '18px',
          border: `1px solid ${C.border}`, marginBottom: 20,
        }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
            <input
              className="field"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Describe a task — AI will handle the rest..."
              style={{
                flex: 1, padding: '10px 14px', fontSize: 14,
                background: C.surfaceHigh, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text,
                transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
              }}
            />
            <button type="submit" disabled={loading}
              className={`btn ${loading ? 'btn-loading' : ''}`}
              style={{
                padding: '10px 20px', background: C.purple, color: C.bg,
                border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 700, minWidth: 64,
              }}>
              {loading ? '…' : 'Add'}
            </button>
          </form>
          {error && <p style={{ color: C.rose, fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
        </div>

        {/* Filters */}
        <div style={{
          background: C.surface, borderRadius: 10, padding: '12px 14px',
          border: `1px solid ${C.border}`, marginBottom: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Status filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.textDim, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 52 }}>
              Status
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <button key={s} className="filter-tab" onClick={() => setStatusFilter(s)} style={{
                  padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  border: `1px solid ${statusFilter === s ? statusColor(s) + '60' : C.border}`,
                  background: statusFilter === s ? statusDim(s) : 'transparent',
                  color: statusFilter === s ? statusColor(s) : C.textMuted,
                  cursor: 'pointer',
                }}>
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>

          {/* Priority filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.textDim, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 52 }}>
              Priority
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {PRIORITIES.map(p => (
                <button key={p} className="filter-tab" onClick={() => setPriorityFilter(p)} style={{
                  padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  border: `1px solid ${priorityFilter === p
                    ? (p === 'ALL' ? C.purple + '60' : priorityColor(p) + '60')
                    : C.border}`,
                  background: priorityFilter === p
                    ? (p === 'ALL' ? C.purpleDim : priorityDim(p))
                    : 'transparent',
                  color: priorityFilter === p
                    ? (p === 'ALL' ? C.purple : priorityColor(p))
                    : C.textMuted,
                  cursor: 'pointer',
                }}>
                  {p === 'ALL' ? 'All' : p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {(statusFilter !== 'ALL' || priorityFilter !== 'ALL') && (
              <button onClick={() => { setStatusFilter('ALL'); setPriorityFilter('ALL'); }} style={{
                marginLeft: 'auto', padding: '3px 9px', borderRadius: 6, fontSize: 11,
                background: 'transparent', color: C.textDim,
                border: `1px solid ${C.border}`, cursor: 'pointer',
              }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Task count */}
        {tasks.length > 0 && (
          <div style={{ color: C.textDim, fontSize: 12, marginBottom: 10, paddingLeft: 2 }}>
            {displayedTasks.length === tasks.length
              ? `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`
              : `${displayedTasks.length} of ${tasks.length} tasks`}
            {' · sorted by priority'}
          </div>
        )}

        {/* Empty state */}
        {displayedTasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.textDim }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.5 }}>✦</div>
            <p style={{ margin: 0, fontSize: 14 }}>
              {tasks.length === 0 ? 'No tasks yet.' : 'No tasks match the current filters.'}
            </p>
          </div>
        )}

        {/* Task list */}
        {displayedTasks.map(task => (
          <div key={task.id} className="task-card" style={{
            background: C.surface, borderRadius: 10, marginBottom: 8,
            border: `1px solid ${task.status === 'FAILED' ? C.rose + '30' : C.border}`,
            overflow: 'hidden',
          }}>
            {/* Priority accent bar */}
            {task.enriched && task.priority && (
              <div className="priority-bar" style={{
                height: 2, background: priorityColor(task.priority), opacity: 0.8,
                transition: 'opacity 0.18s ease',
              }} />
            )}

            <div style={{ padding: '13px 15px' }}>
              {editId === task.id ? (
                // ── Edit form ────────────────────────────────────────────
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editData.title}
                    onChange={e => setEditData(p => ({ ...p, title: e.target.value }))}
                    placeholder="Title" style={inputSt} />
                  <textarea value={editData.description}
                    onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                    placeholder="Description" rows={2} style={{ ...inputSt, resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <select aria-label="Status" value={editData.status}
                      onChange={e => setEditData(p => ({ ...p, status: e.target.value }))} style={selectSt}>
                      {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(s =>
                        <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select>
                    <select aria-label="Priority" value={editData.priority}
                      onChange={e => setEditData(p => ({ ...p, priority: e.target.value }))} style={selectSt}>
                      {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => <option key={p}>{p}</option>)}
                    </select>
                    <input value={editData.category}
                      onChange={e => setEditData(p => ({ ...p, category: e.target.value }))}
                      placeholder="Category" style={{ ...selectSt, flex: 1 }} />
                    <input type="datetime-local" value={editData.deadline}
                      onChange={e => setEditData(p => ({ ...p, deadline: e.target.value }))} style={selectSt} />
                  </div>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <button onClick={handleEditSave} style={{
                      padding: '6px 14px', background: C.teal, color: C.bg,
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}>Save</button>
                    <button onClick={() => setEditId(null)} style={{
                      padding: '6px 14px', background: 'transparent', color: C.textMuted,
                      border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', fontSize: 13,
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                // ── View mode ────────────────────────────────────────────
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{
                      fontWeight: 600, fontSize: 14, color: C.text, lineHeight: 1.45,
                      textDecoration: task.status === 'COMPLETED' ? 'line-through' : 'none',
                      opacity: task.status === 'COMPLETED' ? 0.6 : 1,
                    }}>
                      {task.title}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      {!task.enriched && task.status !== 'FAILED' &&
                        <Badge label="processing" color={C.surfaceHigh} textColor={C.textMuted} />}
                      {task.status === 'FAILED' &&
                        <Badge label="failed" color={C.roseDim} textColor={C.rose} className="badge" />}
                      {task.enriched && task.priority && task.status !== 'FAILED' && (
                        <Badge label={task.priority} color={priorityDim(task.priority)}
                          textColor={priorityColor(task.priority)} className="badge" />
                      )}
                      {task.enriched && task.category && (
                        <Badge label={task.category} color={C.tealDim} textColor={C.teal} className="badge" />
                      )}
                    </div>
                  </div>

                  {task.description && (
                    <p style={{ margin: '5px 0 0', color: C.textMuted, fontSize: 12, lineHeight: 1.5 }}>
                      {task.description}
                    </p>
                  )}

                  {task.deadline && (
                    <p style={{ margin: '4px 0 0', color: C.textDim, fontSize: 11 }}>
                      📅 {new Date(task.deadline).toLocaleString()}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, gap: 6 }}>
                    {task.status !== 'FAILED' ? (
                      <select aria-label="Task status" value={task.status}
                        onChange={e => handleStatusChange(task.id, e.target.value)}
                        style={{
                          ...selectSt, fontSize: 11, padding: '3px 8px',
                          color: statusColor(task.status),
                          borderColor: statusColor(task.status) + '40',
                          background: statusDim(task.status),
                        }}>
                        {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(s =>
                          <option key={s} value={s}>{statusLabel(s)}</option>)}
                      </select>
                    ) : (
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 6,
                        color: C.rose, background: C.roseDim,
                        border: `1px solid ${C.rose}30`,
                      }}>
                        Processing failed
                      </span>
                    )}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                      {task.status !== 'FAILED' && (
                        <button className="action-btn" onClick={() => startEdit(task)} style={{
                          padding: '3px 10px', background: C.purpleDim, color: C.purple,
                          border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                        }}>Edit</button>
                      )}
                      <button className="action-btn" onClick={() => handleDelete(task.id)} style={{
                        padding: '3px 10px', background: C.roseDim, color: C.rose,
                        border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                      }}>Delete</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const authInputSt = {
  padding: '10px 13px', border: '1px solid #383b4d', borderRadius: 8,
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  background: '#2e3140', color: '#e2e4f0',
};
const inputSt = {
  padding: '8px 10px', border: '1px solid #383b4d', borderRadius: 7,
  fontSize: 13, width: '100%', boxSizing: 'border-box',
  background: '#2e3140', color: '#e2e4f0', outline: 'none',
};
const selectSt = {
  padding: '6px 10px', border: '1px solid #383b4d', borderRadius: 7,
  fontSize: 12, background: '#2e3140', color: '#e2e4f0', cursor: 'pointer', outline: 'none',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ label, color, textColor, className = '' }) {
  return (
    <span className={className} style={{
      padding: '2px 8px', background: color, color: textColor,
      borderRadius: 20, fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
      textTransform: 'uppercase', display: 'inline-block',
    }}>
      {label}
    </span>
  );
}

function priorityColor(p) {
  return { LOW: '#7c7f96', MEDIUM: '#a78bfa', HIGH: '#fbbf24', URGENT: '#fb7185' }[p] || '#7c7f96';
}
function priorityDim(p) {
  return { LOW: '#2a2c38', MEDIUM: '#2d2640', HIGH: '#2e2410', URGENT: '#2e1a20' }[p] || '#2a2c38';
}
function statusColor(s) {
  return {
    PENDING:     '#7c7f96',
    IN_PROGRESS: '#fbbf24',
    COMPLETED:   '#4ade80',
    FAILED:      '#fb7185',
  }[s] || '#7c7f96';
}
function statusDim(s) {
  return {
    PENDING:     '#2a2c38',
    IN_PROGRESS: '#2e2410',
    COMPLETED:   '#1a2e1a',
    FAILED:      '#2e1a20',
  }[s] || '#2a2c38';
}

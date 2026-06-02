import { useState, useEffect, useCallback, useRef } from 'react';
import { createTask, getAllTasks, getTask, updateTask, deleteTask, login, register } from './services/api';

const STATUSES = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];
const POLL_MS  = 3000;

// Inject global CSS for hover/focus pseudo-classes and transitions
const GLOBAL_CSS = `
  * { box-sizing: border-box; }

  body { margin: 0; }

  /* Task cards lift subtly on hover */
  .task-card {
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  }
  .task-card:hover {
    transform: translateY(-1px);
    border-color: #4b4e63 !important;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  }

  /* Buttons fade smoothly */
  .btn {
    transition: opacity 0.15s ease, transform 0.12s ease, background 0.15s ease;
  }
  .btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
  .btn:active:not(:disabled) { transform: translateY(0); opacity: 1; }

  /* Filter tabs transition colours */
  .filter-tab {
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .filter-tab:hover { border-color: #a78bfa60 !important; color: #a78bfa !important; }

  /* Input focus glow */
  .field:focus {
    border-color: #a78bfa !important;
    box-shadow: 0 0 0 3px rgba(167,139,250,0.12);
    outline: none;
  }

  /* Sign out button */
  .signout-btn {
    transition: background 0.15s ease, color 0.15s ease;
  }
  .signout-btn:hover { background: #2e3140 !important; color: #e2e4f0 !important; }

  /* Auth input focus */
  .auth-input:focus {
    border-color: #a78bfa !important;
    box-shadow: 0 0 0 3px rgba(167,139,250,0.1);
    outline: none;
  }

  /* Auth submit button */
  .auth-btn {
    transition: opacity 0.15s ease, transform 0.12s ease;
  }
  .auth-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .auth-btn:active { transform: translateY(0); }

  /* Priority accent bar glow on card hover */
  .task-card:hover .priority-bar { opacity: 1 !important; }

  /* Badge subtle pop */
  .badge {
    transition: transform 0.15s ease;
  }
  .task-card:hover .badge { transform: scale(1.04); }

  /* Edit/delete action buttons */
  .action-btn {
    transition: opacity 0.15s ease, transform 0.12s ease;
  }
  .action-btn:hover { opacity: 0.8; transform: translateY(-1px); }

  /* Select focus */
  select.field:focus { outline: none; }

  /* Add button pulse when loading */
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50%       { opacity: 1; }
  }
  .btn-loading { animation: pulse 1.2s ease-in-out infinite; }
`;

function GlobalStyles() {
  return <style>{GLOBAL_CSS}</style>;
}

// ── Soft dark palette ─────────────────────────────────────────────────────────
const C = {
  // backgrounds
  bg:          '#1c1e26',   // page background
  surface:     '#252731',   // card / panel background
  surfaceHigh: '#2e3140',   // elevated surface (inputs, selects)
  border:      '#383b4d',   // subtle borders

  // accents — purple / teal pastels
  purple:      '#a78bfa',   // primary accent
  purpleDim:   '#2d2640',   // muted purple background
  teal:        '#5eead4',   // secondary accent
  tealDim:     '#1a2e2e',   // muted teal background
  rose:        '#fb7185',   // destructive / urgent
  roseDim:     '#2e1a20',
  amber:       '#fbbf24',   // high priority
  amberDim:    '#2e2410',
  green:       '#4ade80',   // success / completed
  greenDim:    '#1a2e1a',

  // text
  text:        '#e2e4f0',   // primary text
  textMuted:   '#7c7f96',   // secondary text
  textDim:     '#4b4e63',   // very muted

  white:       '#ffffff',
};

export default function App() {
  const [token,     setToken]     = useState(localStorage.getItem('token'));
  const [authMode,  setAuthMode]  = useState('login');
  const [authForm,  setAuthForm]  = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');

  const [tasks,   setTasks]   = useState([]);
  const [filter,  setFilter]  = useState('ALL');
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

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
                style={{ color: C.purple, cursor: 'pointer', fontWeight: 500, transition: 'opacity 0.15s' }}>
                {authMode === 'login' ? 'Register' : 'Sign In'}
              </span>
            </p>
          </div>
        </div>
      </>
    );
  }

  // ── Task handlers ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const res = await getAllTasks(filter === 'ALL' ? null : filter);
      setTasks(res.data);
    } catch (e) { console.error(e); }
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
            delete pollingRef.current[t.id];
          }
        }, POLL_MS);
      }
    });
    // only clear on component unmount, not on every tasks change
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const statusLabel = s => ({ PENDING: 'Pending', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', ALL: 'All' }[s] || s);

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

      <div style={{ maxWidth: 660, margin: '0 auto', padding: '24px 16px' }}>

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
              placeholder='Describe a task — AI will handle the rest...'
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

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
          {STATUSES.map(s => (
            <button key={s} className="filter-tab" onClick={() => setFilter(s)} style={{
              padding: '5px 13px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: `1px solid ${filter === s ? C.purple + '60' : C.border}`,
              background: filter === s ? C.purpleDim : 'transparent',
              color: filter === s ? C.purple : C.textMuted,
              cursor: 'pointer',
            }}>
              {statusLabel(s)}
            </button>
          ))}
          {tasks.length > 0 && (
            <span style={{ marginLeft: 'auto', color: C.textDim, fontSize: 12, alignSelf: 'center' }}>
              {tasks.length} task{tasks.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Empty state */}
        {tasks.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: C.textDim }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.5 }}>✦</div>
            <p style={{ margin: 0, fontSize: 14 }}>No tasks yet.</p>
          </div>
        )}

        {/* Task list */}
        {tasks.map(task => (
          <div key={task.id} className="task-card" style={{
            background: C.surface, borderRadius: 10, marginBottom: 8,
            border: `1px solid ${C.border}`, overflow: 'hidden',
          }}>
            {/* Priority accent */}
            {task.enriched && task.priority && (
              <div className="priority-bar" style={{ height: 2, background: priorityColor(task.priority), opacity: 0.8, transition: 'opacity 0.18s ease' }} />
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
                    <select value={editData.status}
                      onChange={e => setEditData(p => ({ ...p, status: e.target.value }))} style={selectSt}>
                      {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(s =>
                        <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select>
                    <select value={editData.priority}
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
                    <span style={{ fontWeight: 600, fontSize: 14, color: C.text, lineHeight: 1.45 }}>
                      {task.title}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      {!task.enriched && <Badge label="processing" color={C.surfaceHigh} textColor={C.textMuted} />}
                      {task.enriched && task.priority && (
                        <Badge label={task.priority} color={priorityDim(task.priority)} textColor={priorityColor(task.priority)} className="badge" />
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
                    <select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}
                      style={{
                        ...selectSt, fontSize: 11, padding: '3px 8px',
                        color: statusColor(task.status), borderColor: statusColor(task.status) + '40',
                        background: statusDim(task.status),
                      }}>
                      {['PENDING', 'IN_PROGRESS', 'COMPLETED'].map(s =>
                        <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
                      <button className="action-btn" onClick={() => startEdit(task)} style={{
                        padding: '3px 10px', background: C.purpleDim, color: C.purple,
                        border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                      }}>Edit</button>
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
  return { PENDING: '#7c7f96', IN_PROGRESS: '#a78bfa', COMPLETED: '#4ade80' }[s] || '#7c7f96';
}
function statusDim(s) {
  return { PENDING: '#2a2c38', IN_PROGRESS: '#2d2640', COMPLETED: '#1a2e1a' }[s] || '#2a2c38';
}

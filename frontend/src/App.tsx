import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Task {
    id: string;
    title: string;
    description: string;
    impact: number;
    effort: number;
    priority: number;
    assignee: string;
    createdAt: number;
    updatedAt: number;
}

interface SprintState {
    sprintId: string;
    sprintName: string;
    tasks: Task[];
    generatedPlan: any | null;
    chatHistory: any[];
    connectedUsers: string[];
    createdAt: number;
    lastUpdatedAt: number;
}

function resolveTaskIds(text: string, tasks: Task[]): string {
    let resolved = text;
    tasks.forEach(t => { resolved = resolved.replaceAll(t.id, `"${t.title}"`); });
    return resolved;
}

// Shared section header style
const sectionLabel: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-tertiary)',
    marginBottom: '12px',
};

function App() {
    const [userName, setUserName] = useState('');
    const [sprintId, setSprintId] = useState('');
    const [joined, setJoined] = useState(false);
    const [sprintState, setSprintState] = useState<SprintState | null>(null);
    const [error, setError] = useState('');

    const [taskTitle, setTaskTitle] = useState('');
    const [taskDescription, setTaskDescription] = useState('');
    const [taskImpact, setTaskImpact] = useState(3);
    const [taskEffort, setTaskEffort] = useState(3);
    const [taskPriority, setTaskPriority] = useState(3);
    const [taskAssignee, setTaskAssignee] = useState('');

    const ws = useRef<WebSocket | null>(null);

    function connectWebSocket() {
        if (!userName || !sprintId) { setError('Please enter both fields'); return; }
        const socket = new WebSocket(`ws://localhost:8787/agents/sprint-agent/${sprintId}?userName=${encodeURIComponent(userName)}`);
        socket.onopen = () => { setJoined(true); setError(''); };
        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case 'init': setSprintState(data.state); break;
                    case 'state_update': setSprintState(data.state); break;
                    case 'user_joined': setSprintState(prev => prev ? { ...prev, connectedUsers: data.connectedUsers } : null); break;
                    case 'user_left': setSprintState(prev => prev ? { ...prev, connectedUsers: data.connectedUsers } : null); break;
                    case 'error': setError(data.message); break;
                    case 'plan_stream_done': setSprintState(prev => prev ? { ...prev, generatedPlan: data.plan } : null); break;
                }
            } catch (err) { console.error(err); }
        };
        socket.onerror = () => setError('Connection failed');
        socket.onclose = () => setJoined(false);
        ws.current = socket;
    }

    function sendMessage(message: any) {
        if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(message));
        else setError('Not connected');
    }

    function handleAddTask() {
        if (!taskTitle.trim()) { setError('Task title is required'); return; }
        sendMessage({ type: 'add_task', task: { title: taskTitle, description: taskDescription, impact: taskImpact, effort: taskEffort, priority: taskPriority, assignee: taskAssignee || userName } });
        setTaskTitle(''); setTaskDescription(''); setTaskImpact(3); setTaskEffort(3); setTaskPriority(3); setTaskAssignee('');
    }

    function handleGeneratePlan() {
        if (!sprintState?.tasks.length) { setError('Add some tasks first'); return; }
        sendMessage({ type: 'generate_plan', userName, constraints: '' });
    }

    function handleDeleteTask(taskId: string) { sendMessage({ type: 'delete_task', taskId }); }

    useEffect(() => { return () => { ws.current?.close(); }; }, []);

    // ─── Login ────────────────────────────────────────────────────────────────
    if (!joined) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)' }}>
                <motion.div
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="glass-card"
                    style={{ maxWidth: '400px', width: '100%', padding: '36px 32px' }}
                >
                    <div style={{ marginBottom: '28px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: '6px' }}>
                            Sprint Planner
                        </p>
                        <h1 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.2 }}>
                            Plan your sprint,<br />ship with confidence.
                        </h1>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Sprint ID</label>
                        <input type="text" value={sprintId} onChange={(e) => setSprintId(e.target.value)}
                               placeholder="e.g. sprint-42" className="apple-input"
                               onKeyDown={(e) => e.key === 'Enter' && connectWebSocket()} />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Your Name</label>
                        <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)}
                               placeholder="e.g. Alice" className="apple-input"
                               onKeyDown={(e) => e.key === 'Enter' && connectWebSocket()} />
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                      style={{ fontSize: '13px', color: 'var(--red)', marginBottom: '12px', padding: '8px 12px', background: 'rgba(255,59,48,0.06)', borderRadius: '8px', border: '1px solid rgba(255,59,48,0.15)' }}>
                                {error}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    <button onClick={connectWebSocket} className="apple-button apple-button-primary" style={{ width: '100%' }}>
                        Join Sprint
                    </button>
                </motion.div>
            </div>
        );
    }

    const tasks = sprintState?.tasks || [];
    const plan = sprintState?.generatedPlan;
    const connectedUsers = sprintState?.connectedUsers || [];

    const includedTasks = plan
        ? [...plan.prioritizedTasks]
            .filter((pt: any) => pt.recommendation === 'include')
            .sort((a: any, b: any) => a.rank - b.rank)
            .map((pt: any) => ({ ...pt, task: tasks.find(t => t.id === pt.taskId) }))
        : [];

    // ─── Main ─────────────────────────────────────────────────────────────────
    return (
        <div className="container" style={{ paddingTop: '32px', paddingBottom: '64px' }}>

            {/* Top nav bar */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: '2px' }}>Sprint Planner</p>
                    <h1 style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.03em' }}>{sprintState?.sprintName || 'New Sprint'}</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{tasks.length} tasks</span>
                    <span style={{ color: 'var(--border)', fontSize: '18px' }}>|</span>
                    {connectedUsers.map(u => (
                        <span key={u} style={{ fontSize: '12px', fontWeight: 500, padding: '3px 10px', borderRadius: '20px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                            {u}
                        </span>
                    ))}
                </div>
            </motion.div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                style={{ padding: '10px 14px', marginBottom: '18px', background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.15)', borderRadius: '10px', color: 'var(--red)', fontSize: '13px' }}>
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main two-column layout */}
            <div className="grid grid-2" style={{ marginBottom: '20px' }}>

                {/* Left: Add Task + Generate */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                    {/* Add Task */}
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                                className="glass-card" style={{ padding: '22px' }}>
                        <p style={sectionLabel}>New Task</p>

                        <input type="text" placeholder="Title" value={taskTitle}
                               onChange={(e) => setTaskTitle(e.target.value)} className="apple-input"
                               style={{ marginBottom: '10px' }}
                               onKeyDown={(e) => e.key === 'Enter' && handleAddTask()} />

                        <textarea placeholder="Description (optional)" value={taskDescription}
                                  onChange={(e) => setTaskDescription(e.target.value)} className="apple-input"
                                  style={{ marginBottom: '10px', minHeight: '56px', resize: 'vertical' }} />

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                            {([['Impact', taskImpact, setTaskImpact], ['Effort', taskEffort, setTaskEffort], ['Priority', taskPriority, setTaskPriority]] as any[]).map(([label, val, setter]) => (
                                <div key={label} style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '4px', fontWeight: 500 }}>{label}</label>
                                    <input type="number" min="1" max="5" value={val}
                                           onChange={(e) => setter(Number(e.target.value))} className="apple-input" />
                                </div>
                            ))}
                        </div>

                        <input type="text" placeholder="Assignee (optional)" value={taskAssignee}
                               onChange={(e) => setTaskAssignee(e.target.value)} className="apple-input"
                               style={{ marginBottom: '12px' }} />

                        <button onClick={handleAddTask} className="apple-button apple-button-success" style={{ width: '100%' }}>
                            Add Task
                        </button>
                    </motion.div>

                    {/* Generate Plan */}
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                                className="glass-card" style={{ padding: '22px' }}>
                        <p style={sectionLabel}>AI Analysis</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '14px', lineHeight: '1.5' }}>
                            Analyze dependencies, risks, and workload distribution across your backlog.
                        </p>
                        <button onClick={handleGeneratePlan} disabled={tasks.length === 0}
                                className={`apple-button ${tasks.length > 0 ? 'apple-button-primary' : 'apple-button-secondary'}`}
                                style={{ width: '100%' }}>
                            {tasks.length > 0 ? 'Generate Plan' : 'Add tasks first'}
                        </button>
                    </motion.div>
                </div>

                {/* Right: Backlog */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                            className="glass-card" style={{ padding: '22px' }}>
                    <p style={sectionLabel}>Backlog — {tasks.length} tasks</p>

                    {tasks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 16px' }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No tasks yet.</p>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '460px', overflowY: 'auto', paddingRight: '4px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <AnimatePresence>
                                    {tasks.map((task, idx) => (
                                        <motion.div key={task.id}
                                                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: idx * 0.02 }}
                                                    className="task-card" style={{ position: 'relative' }}>
                                            <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', paddingRight: '28px' }}>{task.title}</p>
                                            {task.description && (
                                                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px', lineHeight: '1.4' }}>{task.description}</p>
                                            )}
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                {[['I', task.impact], ['E', task.effort], ['P', task.priority]].map(([k, v]) => (
                                                    <span key={k} style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                        {k} <strong style={{ color: 'var(--text-primary)' }}>{v}</strong>
                                                    </span>
                                                ))}
                                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                    Score <strong style={{ color: 'var(--blue)' }}>{((task.impact * task.priority) / task.effort).toFixed(1)}</strong>
                                                </span>
                                            </div>
                                            <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>{task.assignee}</p>
                                            <button onClick={() => handleDeleteTask(task.id)}
                                                    style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '14px', padding: '2px', lineHeight: 1 }}
                                                    title="Delete">
                                                ×
                                            </button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* AI Plan — full width */}
            <AnimatePresence>
                {plan && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="glass-card" style={{ padding: '28px 32px' }}
                    >
                        {/* Plan header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <p style={sectionLabel}>AI Generated Plan</p>
                                <p style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>Sprint Recommendations</p>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {plan.generatedBy} · {new Date(plan.generatedAt).toLocaleString()}
                            </p>
                        </div>

                        {/* Key Takeaway */}
                        {plan.summary && (
                            <div style={{ padding: '14px 16px', background: 'rgba(0,113,227,0.06)', borderRadius: '10px', marginBottom: '22px', borderLeft: '2px solid var(--blue)' }}>
                                <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: '1.6' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--blue)' }}>Key takeaway — </span>
                                    {plan.summary}
                                </p>
                            </div>
                        )}

                        {/* Divider */}
                        <div style={{ height: '1px', background: 'var(--border)', marginBottom: '22px' }} />

                        {/* Insights grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px', marginBottom: '26px' }}>

                            {plan.topRecommendations?.length > 0 && (
                                <div style={{ padding: '16px', background: 'rgba(52,199,89,0.05)', borderRadius: '10px', border: '1px solid rgba(52,199,89,0.15)' }}>
                                    <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: '10px' }}>Recommendations</p>
                                    <ul style={{ paddingLeft: '14px', margin: 0 }}>
                                        {plan.topRecommendations.map((r: string, i: number) => (
                                            <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.5' }}>{r}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {plan.risks?.length > 0 && (
                                <div style={{ padding: '16px', background: 'rgba(255,59,48,0.04)', borderRadius: '10px', border: '1px solid rgba(255,59,48,0.12)' }}>
                                    <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--red)', marginBottom: '10px' }}>Risks</p>
                                    <ul style={{ paddingLeft: '14px', margin: 0 }}>
                                        {plan.risks.map((r: string, i: number) => (
                                            <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.5' }}>{r}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {plan.assigneeFlags?.length > 0 && (
                                <div style={{ padding: '16px', background: 'rgba(255,149,0,0.04)', borderRadius: '10px', border: '1px solid rgba(255,149,0,0.12)' }}>
                                    <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--orange)', marginBottom: '10px' }}>Workload</p>
                                    <ul style={{ paddingLeft: '14px', margin: 0 }}>
                                        {plan.assigneeFlags.map((f: string, i: number) => (
                                            <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.5' }}>{f}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* This Sprint */}
                        {includedTasks.length > 0 && (
                            <div style={{ marginBottom: '22px' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
                                    <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>This Sprint</p>
                                    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{includedTasks.length} tasks · {plan.totalEstimatedEffort} pts</p>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                                    {includedTasks.map(({ task, rationale, rank }: any, i: number) => (
                                        <div key={i} style={{ padding: '14px', background: 'var(--bg-page)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', background: 'var(--bg-input)', padding: '2px 7px', borderRadius: '5px', letterSpacing: '0.02em' }}>
                                                    #{rank}
                                                </span>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{task?.title ?? 'Unknown'}</span>
                                            </div>
                                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: 0, lineHeight: '1.5' }}>{rationale}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Warnings + Dependencies side by side if both exist */}
                        {(plan.warnings?.length > 0 || plan.dependencies?.length > 0) && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>

                                {plan.warnings?.length > 0 && (
                                    <div style={{ padding: '14px 16px', background: 'rgba(255,149,0,0.04)', borderRadius: '10px', border: '1px solid rgba(255,149,0,0.12)' }}>
                                        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--orange)', marginBottom: '10px' }}>Warnings</p>
                                        <ul style={{ paddingLeft: '14px', margin: 0 }}>
                                            {plan.warnings.map((w: string, i: number) => (
                                                <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: '1.5' }}>
                                                    {resolveTaskIds(w, tasks)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {plan.dependencies?.length > 0 && (
                                    <div style={{ padding: '14px 16px', background: 'rgba(142,92,246,0.04)', borderRadius: '10px', border: '1px solid rgba(142,92,246,0.12)' }}>
                                        <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '10px' }}>Dependencies</p>
                                        <ul style={{ paddingLeft: '14px', margin: 0 }}>
                                            {plan.dependencies.map((d: any, i: number) => {
                                                const from = tasks.find(t => t.id === d.taskId);
                                                const on = tasks.find(t => t.id === d.dependsOn);
                                                return (
                                                    <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: '1.5' }}>
                                                        <strong style={{ color: 'var(--text-primary)' }}>{from?.title ?? d.taskId}</strong>
                                                        <span style={{ color: 'var(--text-tertiary)' }}> → </span>
                                                        <strong style={{ color: 'var(--text-primary)' }}>{on?.title ?? d.dependsOn}</strong>
                                                        <span style={{ color: 'var(--text-tertiary)' }}> — </span>
                                                        {d.reason}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default App;
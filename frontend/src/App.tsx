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

function App() {
    const [userName, setUserName] = useState('');
    const [sprintId, setSprintId] = useState('');
    const [joined, setJoined] = useState(false);
    const [sprintState, setSprintState] = useState<SprintState | null>(null);
    const [error, setError] = useState('');

    // Task form
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDescription, setTaskDescription] = useState('');
    const [taskImpact, setTaskImpact] = useState(3);
    const [taskEffort, setTaskEffort] = useState(3);
    const [taskPriority, setTaskPriority] = useState(3);
    const [taskAssignee, setTaskAssignee] = useState('');

    const ws = useRef<WebSocket | null>(null);

    // WebSocket connection
    function connectWebSocket() {
        if (!userName || !sprintId) {
            setError('Please enter both name and sprint ID');
            return;
        }

        const wsUrl = `ws://localhost:8787/agents/SprintAgent/${sprintId}?userName=${encodeURIComponent(userName)}`;
        console.log('Connecting to:', wsUrl);

        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('✅ WebSocket connected!');
            setJoined(true);
            setError('');
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📨 Received:', data.type, data);

                switch (data.type) {
                    case 'init':
                        setSprintState(data.state);
                        break;

                    case 'state_update':
                        setSprintState(data.state);
                        break;

                    case 'user_joined':
                        setSprintState(prev => prev ? { ...prev, connectedUsers: data.connectedUsers } : null);
                        break;

                    case 'user_left':
                        setSprintState(prev => prev ? { ...prev, connectedUsers: data.connectedUsers } : null);
                        break;

                    case 'error':
                        setError(data.message);
                        break;

                    case 'plan_stream_chunk':
                        console.log('📊 Plan chunk:', data.chunk);
                        break;

                    case 'plan_stream_done':
                        setSprintState(prev => prev ? { ...prev, generatedPlan: data.plan } : null);
                        break;

                    default:
                        console.log('Unknown message type:', data.type);
                }
            } catch (err) {
                console.error('Failed to parse message:', err);
            }
        };

        socket.onerror = (err) => {
            console.error('❌ WebSocket error:', err);
            setError('WebSocket connection failed');
        };

        socket.onclose = () => {
            console.log('🔌 WebSocket closed');
            setJoined(false);
        };

        ws.current = socket;
    }

    function sendMessage(message: any) {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(message));
        } else {
            setError('WebSocket not connected');
        }
    }

    function handleJoin() {
        connectWebSocket();
    }

    function handleAddTask() {
        if (!taskTitle.trim()) {
            setError('Please enter a task title');
            return;
        }

        sendMessage({
            type: 'add_task',
            task: {
                title: taskTitle,
                description: taskDescription,
                impact: taskImpact,
                effort: taskEffort,
                priority: taskPriority,
                assignee: taskAssignee || userName,
            }
        });

        // Clear form
        setTaskTitle('');
        setTaskDescription('');
        setTaskImpact(3);
        setTaskEffort(3);
        setTaskPriority(3);
        setTaskAssignee('');
    }

    function handleGeneratePlan() {
        if (!sprintState || sprintState.tasks.length === 0) {
            setError('Add some tasks first');
            return;
        }

        sendMessage({
            type: 'generate_plan',
            userName: userName,
            constraints: '', // Optional constraints
        });
    }

    function handleDeleteTask(taskId: string) {
        sendMessage({
            type: 'delete_task',
            taskId: taskId,
        });
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    if (!joined) {
        return (
            <div className="container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="glass-card"
                    style={{ maxWidth: '480px', width: '100%', padding: '48px' }}
                >
                    <motion.div
                        initial={{ scale: 0.9 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2 }}
                        style={{ textAlign: 'center', marginBottom: '32px' }}
                    >
                        <h1 className="text-2xl font-bold" style={{ marginBottom: '8px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Sprint Planner
                        </h1>
                        <p className="text-secondary">Powered by AI • WebSocket Connected</p>
                    </motion.div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Sprint ID</label>
                        <input
                            type="text"
                            value={sprintId}
                            onChange={(e) => setSprintId(e.target.value)}
                            placeholder="my-sprint-2024"
                            className="apple-input"
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Your Name</label>
                        <input
                            type="text"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            placeholder="Alice"
                            className="apple-input"
                        />
                    </div>

                    <AnimatePresence>
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{
                                    padding: '12px',
                                    background: 'rgba(255, 59, 48, 0.1)',
                                    borderRadius: '12px',
                                    marginBottom: '16px',
                                    color: 'var(--apple-red)',
                                    fontSize: '14px',
                                }}
                            >
                                ⚠️ {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={handleJoin}
                        className="apple-button apple-button-primary"
                        style={{ width: '100%' }}
                    >
                        Join Sprint
                    </button>
                </motion.div>
            </div>
        );
    }

    const tasks = sprintState?.tasks || [];
    const plan = sprintState?.generatedPlan;
    const connectedUsers = sprintState?.connectedUsers || [];

    return (
        <div className="container" style={{ paddingTop: '32px', paddingBottom: '64px' }}>
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card"
                style={{ padding: '24px 32px', marginBottom: '24px' }}
            >
                <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <h1 className="text-xl font-bold" style={{ marginBottom: '8px' }}>
                            🚀 {sprintState?.sprintName || 'Sprint'}
                        </h1>
                        <div className="text-sm text-secondary flex gap-md" style={{ flexWrap: 'wrap' }}>
                            <span>👤 {userName}</span>
                            <span>•</span>
                            <span>👥 {connectedUsers.length} online</span>
                            <span>•</span>
                            <span>📝 {tasks.length} tasks</span>
                        </div>
                    </div>
                    <span className="status-badge status-ready">
            {connectedUsers.map(u => u).join(', ')}
          </span>
                </div>
            </motion.div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="glass-card"
                        style={{
                            padding: '16px 24px',
                            marginBottom: '24px',
                            background: 'rgba(255, 59, 48, 0.1)',
                            borderColor: 'var(--apple-red)',
                        }}
                    >
                        <div className="flex items-center gap-md">
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-2">
                {/* Left Column */}
                <div className="flex-col gap-lg" style={{ display: 'flex' }}>
                    {/* Add Task */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-card"
                        style={{ padding: '24px' }}
                    >
                        <h2 className="text-lg font-semibold mb-md">➕ Add Task</h2>

                        <input
                            type="text"
                            placeholder="Task title"
                            value={taskTitle}
                            onChange={(e) => setTaskTitle(e.target.value)}
                            className="apple-input"
                            style={{ marginBottom: '12px' }}
                        />

                        <textarea
                            placeholder="Description"
                            value={taskDescription}
                            onChange={(e) => setTaskDescription(e.target.value)}
                            className="apple-input"
                            style={{ marginBottom: '12px', minHeight: '60px', resize: 'vertical' }}
                        />

                        <div className="flex gap-sm" style={{ marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <label className="text-sm text-tertiary" style={{ display: 'block', marginBottom: '4px' }}>
                                    Impact (1-5)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={taskImpact}
                                    onChange={(e) => setTaskImpact(Number(e.target.value))}
                                    className="apple-input"
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="text-sm text-tertiary" style={{ display: 'block', marginBottom: '4px' }}>
                                    Effort (1-5)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={taskEffort}
                                    onChange={(e) => setTaskEffort(Number(e.target.value))}
                                    className="apple-input"
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="text-sm text-tertiary" style={{ display: 'block', marginBottom: '4px' }}>
                                    Priority (1-5)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    value={taskPriority}
                                    onChange={(e) => setTaskPriority(Number(e.target.value))}
                                    className="apple-input"
                                />
                            </div>
                        </div>

                        <input
                            type="text"
                            placeholder="Assignee (optional)"
                            value={taskAssignee}
                            onChange={(e) => setTaskAssignee(e.target.value)}
                            className="apple-input"
                            style={{ marginBottom: '12px' }}
                        />

                        <button
                            onClick={handleAddTask}
                            className="apple-button apple-button-success"
                            style={{ width: '100%' }}
                        >
                            Add Task
                        </button>
                    </motion.div>

                    {/* Generate Plan */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="glass-card"
                        style={{ padding: '24px' }}
                    >
                        <h3 className="text-md font-semibold mb-md">🤖 AI Planning</h3>
                        <p className="text-sm text-secondary mb-md">
                            Let AI analyze and prioritize your tasks.
                        </p>

                        <button
                            onClick={handleGeneratePlan}
                            disabled={tasks.length === 0}
                            className={`apple-button ${tasks.length > 0 ? 'apple-button-primary' : 'apple-button-secondary'}`}
                            style={{ width: '100%' }}
                        >
                            {tasks.length > 0 ? '🤖 Generate Plan' : '⏸️ Add Tasks First'}
                        </button>
                    </motion.div>
                </div>

                {/* Right Column */}
                <div className="flex-col gap-lg" style={{ display: 'flex' }}>
                    {/* Tasks */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="glass-card"
                        style={{ padding: '24px' }}
                    >
                        <h2 className="text-lg font-semibold mb-md">📝 Backlog ({tasks.length})</h2>

                        {tasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-tertiary)' }}>
                                No tasks yet. Add one to get started!
                            </div>
                        ) : (
                            <div className="flex-col gap-sm" style={{ display: 'flex' }}>
                                <AnimatePresence>
                                    {tasks.map((task, idx) => (
                                        <motion.div
                                            key={task.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="task-card"
                                            style={{ position: 'relative' }}
                                        >
                                            <h4 className="font-semibold mb-sm">{task.title}</h4>
                                            {task.description && (
                                                <p className="text-sm text-secondary mb-sm">{task.description}</p>
                                            )}
                                            <div className="flex gap-md text-sm text-tertiary" style={{ flexWrap: 'wrap' }}>
                                                <span>Impact: <strong>{task.impact}</strong></span>
                                                <span>Effort: <strong>{task.effort}</strong></span>
                                                <span>Priority: <strong>{task.priority}</strong></span>
                                                <span>Value: <strong>{((task.impact * task.priority) / task.effort).toFixed(2)}</strong></span>
                                            </div>
                                            <div className="text-sm text-tertiary mt-sm">
                                                👤 {task.assignee}
                                            </div>
                                            <button
                                                onClick={() => handleDeleteTask(task.id)}
                                                style={{
                                                    position: 'absolute',
                                                    top: '12px',
                                                    right: '12px',
                                                    background: 'rgba(255, 59, 48, 0.1)',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    padding: '4px 8px',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                🗑️
                                            </button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </motion.div>

                    {/* AI Plan */}
                    {plan && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass-card"
                            style={{ padding: '24px', background: 'rgba(0, 122, 255, 0.05)' }}
                        >
                            <h2 className="text-lg font-semibold mb-sm">🎯 AI Generated Plan</h2>
                            <p className="text-sm text-tertiary mb-md">
                                By {plan.generatedBy} • {new Date(plan.generatedAt).toLocaleString()}
                            </p>

                            <h3 className="text-md font-semibold mb-sm">📋 Prioritized Tasks:</h3>
                            <ol style={{ paddingLeft: '20px', marginBottom: '16px' }}>
                                {[...plan.prioritizedTasks]
                                    .sort((a: any, b: any) => a.rank - b.rank)
                                    .map((pt: any, idx: number) => {
                                        const task = tasks.find(t => t.id === pt.taskId);
                                        return (
                                            <li key={idx} style={{ marginBottom: '12px' }}>
                                                <strong>{task?.title || pt.taskId}</strong>
                                                <br />
                                                <span className="text-sm" style={{
                                                    color: pt.recommendation === 'include' ? 'var(--apple-green)' :
                                                        pt.recommendation === 'defer' ? 'var(--apple-orange)' :
                                                            'var(--apple-gray)'
                                                }}>
                          {pt.recommendation.toUpperCase()}
                        </span>
                                                {' '}
                                                <span className="text-sm text-secondary">• {pt.rationale}</span>
                                            </li>
                                        );
                                    })}
                            </ol>

                            {plan.summary && (
                                <>
                                    <h3 className="text-md font-semibold mb-sm">📝 Summary:</h3>
                                    <p className="text-sm text-secondary mb-md">{plan.summary}</p>
                                </>
                            )}

                            {plan.reasoning && (
                                <>
                                    <h3 className="text-md font-semibold mb-sm">💡 Reasoning:</h3>
                                    <p className="text-sm text-secondary mb-md">{plan.reasoning}</p>
                                </>
                            )}

                            {plan.totalEstimatedEffort && (
                                <div className="text-sm text-tertiary">
                                    📊 Total Effort: <strong>{plan.totalEstimatedEffort} points</strong>
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
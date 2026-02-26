// A single task in the sprint backlog
export interface Task {
    id: string;
    title: string;
    description: string;
    impact: number;       // 1-5
    effort: number;       // 1-5
    priority: number;     // 1-5
    assignee: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

// The full persisted state of a SprintAgent instance
export interface SprintState {
    sprintId: string;
    sprintName: string;
    tasks: Task[];
    generatedPlan: GeneratedPlan | null;
    chatHistory: ChatMessage[];
    connectedUsers: string[];
    isGeneratingPlan: boolean;   // ← NEW: locks generate button for all users
    createdAt: number;
    lastUpdatedAt: number;
}

// The AI-generated sprint plan
export interface GeneratedPlan {
    prioritizedTasks: PrioritizedTask[];
    topRecommendations: string[];
    risks: string[];
    assigneeFlags: string[];
    summary: string;
    totalEstimatedEffort: number;
    warnings?: string[];
    dependencies?: { taskId: string; dependsOn: string; reason: string }[];
    generatedAt: number;
    generatedBy: string;
}

// A task with its position in the plan and AI commentary
export interface PrioritizedTask {
    taskId: string;
    rank: number;
    rationale: string;
    recommendation: "include" | "defer" | "split" | "clarify";
}

// A message in the AI chat about the plan
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    userName: string;
    timestamp: number;
}

// Per-connection state stored on each WebSocket connection
export interface ConnectionState {
    userName: string;
}

// ---- WebSocket message types (client → server) ----
export type ClientMessage =
    | { type: "join"; userName: string }
    | { type: "add_task"; task: Omit<Task, "id" | "createdAt" | "updatedAt"> }
    | { type: "update_task"; taskId: string; updates: Partial<Omit<Task, "id" | "createdAt" | "createdBy">> }
    | { type: "delete_task"; taskId: string }
    | { type: "generate_plan"; userName: string; constraints?: string }
    | { type: "chat_message"; content: string; userName: string }
    | { type: "rename_sprint"; sprintName: string };

// ---- WebSocket message types (server → client) ----
export type ServerMessage =
    | { type: "init"; state: SprintState }
    | { type: "state_update"; state: SprintState }
    | { type: "plan_stream_chunk"; chunk: string }
    | { type: "plan_stream_done"; plan: GeneratedPlan }
    | { type: "chat_stream_chunk"; chunk: string; messageId: string }
    | { type: "chat_stream_done"; message: ChatMessage }
    | { type: "error"; message: string }
    | { type: "notify"; message: string }                                          // ← NEW
    | { type: "user_joined"; userName: string; connectedUsers: string[] }
    | { type: "user_left"; userName: string; connectedUsers: string[] };

// ---- Shared Worker environment bindings ----
export interface Env {
    AI: Ai;
    SprintAgent: DurableObjectNamespace;
}
// A single task in the sprint backlog
export interface Task {
    id: string;           // UUID v4 generated on creation
    title: string;        // Short name for the task
    description: string;  // Longer description (can be empty string)
    impact: number;       // 1-5: how much value this delivers
    effort: number;       // 1-5: how much work it takes
    priority: number;     // 1-5: how urgent/important
    assignee: string;     // Name of the person it's assigned to (can be "Unassigned")
    createdBy: string;    // userName of who added it
    createdAt: number;    // Date.now() timestamp
    updatedAt: number;    // Date.now() timestamp, updated on every edit
}

// The full persisted state of a SprintAgent instance
export interface SprintState {
    sprintId: string;               // Matches the Agent instance name
    sprintName: string;             // Human-readable sprint name e.g. "Sprint 4"
    tasks: Task[];                  // All tasks in the backlog
    generatedPlan: GeneratedPlan | null; // Last AI-generated plan, null if never generated
    chatHistory: ChatMessage[];     // Conversation with the AI about the plan
    connectedUsers: string[];       // List of usernames currently connected
    createdAt: number;
    lastUpdatedAt: number;
}

// The AI-generated sprint plan
export interface GeneratedPlan {
    prioritizedTasks: PrioritizedTask[];  // Tasks in recommended order
    summary: string;                      // Overall sprint summary from the AI
    totalEstimatedEffort: number;         // Sum of effort scores of all included tasks
    reasoning: string;                    // AI's explanation of its approach
    generatedAt: number;                  // Timestamp
    generatedBy: string;                  // Username who triggered generation
}

// A task with its position in the plan and AI commentary
export interface PrioritizedTask {
    taskId: string;
    rank: number;                                             // 1 = highest priority
    rationale: string;                                        // Why this task is ranked here
    recommendation: "include" | "defer" | "split" | "clarify";
}

// A message in the AI chat about the plan
export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    userName: string;   // Who sent it (for user messages)
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
    | { type: "user_joined"; userName: string; connectedUsers: string[] }
    | { type: "user_left"; userName: string; connectedUsers: string[] };

// ---- Shared Worker environment bindings ----
export interface Env {
    AI: Ai;
    SprintAgent: DurableObjectNamespace;
}
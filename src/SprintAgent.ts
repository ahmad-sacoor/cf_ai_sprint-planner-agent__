import { Agent, Connection, ConnectionContext, WSMessage } from "agents";
import type {
    Env,
    SprintState,
    Task,
    ClientMessage,
    GeneratedPlan,
    ChatMessage,
    PrioritizedTask,
    ConnectionState,
    ServerMessage,
} from "./types";

export class SprintAgent extends Agent<Env, SprintState> {
    private connections = new Map<string, Connection<ConnectionState>>();

    initialState: SprintState = {
        sprintId: "",
        sprintName: "New Sprint",
        tasks: [],
        generatedPlan: null,
        chatHistory: [],
        connectedUsers: [],
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
    };

    async onStart(): Promise<void> {
        if (!this.state.sprintId) {
            this.setState({
                ...this.state,
                sprintId: this.name,
                createdAt: Date.now(),
                lastUpdatedAt: Date.now(),
            });
        }
        console.log(`[SprintAgent] Started — instance: ${this.name}`);
    }

    onConnect(connection: Connection<ConnectionState>, ctx: ConnectionContext): void {
        const url = new URL(ctx.request.url);
        const userName = url.searchParams.get("userName") ?? "Anonymous";

        connection.setState({ userName });
        this.connections.set(connection.id, connection);

        const connectedUsers = this.state.connectedUsers.includes(userName)
            ? this.state.connectedUsers
            : [...this.state.connectedUsers, userName];

        this.setState({ ...this.state, connectedUsers });

        const initMsg: ServerMessage = { type: "init", state: this.state };
        connection.send(JSON.stringify(initMsg));

        const joinMsg: ServerMessage = { type: "user_joined", userName, connectedUsers };
        this.broadcastExcept(connection.id, joinMsg);

        console.log(`[SprintAgent] ${userName} connected to sprint ${this.name}`);
    }

    onMessage(connection: Connection<ConnectionState>, message: WSMessage): void {
        try {
            const data: ClientMessage = JSON.parse(message as string);
            switch (data.type) {
                case "join":          this.handleJoin(connection, data); break;
                case "add_task":      this.handleAddTask(connection, data); break;
                case "update_task":   this.handleUpdateTask(connection, data); break;
                case "delete_task":   this.handleDeleteTask(connection, data); break;
                case "rename_sprint": this.handleRenameSprint(connection, data); break;
                case "generate_plan":
                    this.handleGeneratePlan(connection, data).catch((err) => {
                        console.error("[SprintAgent] handleGeneratePlan error:", err);
                        this.broadcast(JSON.stringify({ type: "error", message: String(err?.message ?? err) }));
                    });
                    break;
                case "chat_message":
                    this.handleChatMessage(connection, data).catch((err) => {
                        console.error("[SprintAgent] handleChatMessage error:", err);
                        connection.send(JSON.stringify({ type: "error", message: String(err?.message ?? err) }));
                    });
                    break;
                default:
                    connection.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
            }
        } catch (err) {
            console.error("[SprintAgent] onMessage parse error:", err);
            connection.send(JSON.stringify({ type: "error", message: "Failed to parse message" }));
        }
    }

    onClose(
        connection: Connection<ConnectionState>,
        _code: number,
        _reason: string,
        _wasClean: boolean
    ): void {
        const userName = connection.state?.userName ?? "Anonymous";
        this.connections.delete(connection.id);
        const connectedUsers = this.state.connectedUsers.filter((u) => u !== userName);
        this.setState({ ...this.state, connectedUsers });
        this.broadcast(JSON.stringify({ type: "user_left", userName, connectedUsers }));
        console.log(`[SprintAgent] ${userName} disconnected from sprint ${this.name}`);
    }

    onError(connection: Connection<ConnectionState>, error: unknown): void {
        console.error(`[SprintAgent] Connection error for ${connection.state?.userName}:`, error);
        try {
            connection.send(JSON.stringify({ type: "error", message: "Connection error occurred" }));
        } catch { /* ignore */ }
    }

    // ─── Private message handlers ─────────────────────────────────────────────

    private handleJoin(
        connection: Connection<ConnectionState>,
        data: Extract<ClientMessage, { type: "join" }>
    ): void {
        connection.setState({ userName: data.userName });
        const connectedUsers = this.state.connectedUsers.includes(data.userName)
            ? this.state.connectedUsers
            : [...this.state.connectedUsers, data.userName];
        this.setState({ ...this.state, connectedUsers });
        connection.send(JSON.stringify({ type: "init", state: this.state }));
    }

    private handleAddTask(
        connection: Connection<ConnectionState>,
        data: Extract<ClientMessage, { type: "add_task" }>
    ): void {
        const now = Date.now();
        const newTask: Task = {
            ...data.task,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
        };
        const tasks = [...this.state.tasks, newTask];
        this.setState({ ...this.state, tasks, lastUpdatedAt: now });
        this.broadcast(JSON.stringify({ type: "state_update", state: this.state }));
    }

    private handleUpdateTask(
        connection: Connection<ConnectionState>,
        data: Extract<ClientMessage, { type: "update_task" }>
    ): void {
        const idx = this.state.tasks.findIndex((t) => t.id === data.taskId);
        if (idx === -1) {
            connection.send(JSON.stringify({ type: "error", message: `Task "${data.taskId}" not found` }));
            return;
        }
        const now = Date.now();
        const tasks = [
            ...this.state.tasks.slice(0, idx),
            { ...this.state.tasks[idx], ...data.updates, updatedAt: now },
            ...this.state.tasks.slice(idx + 1),
        ];
        this.setState({ ...this.state, tasks, lastUpdatedAt: now });
        this.broadcast(JSON.stringify({ type: "state_update", state: this.state }));
    }

    private handleDeleteTask(
        _connection: Connection<ConnectionState>,
        data: Extract<ClientMessage, { type: "delete_task" }>
    ): void {
        const tasks = this.state.tasks.filter((t) => t.id !== data.taskId);
        this.setState({ ...this.state, tasks, lastUpdatedAt: Date.now() });
        this.broadcast(JSON.stringify({ type: "state_update", state: this.state }));
    }

    private handleRenameSprint(
        _connection: Connection<ConnectionState>,
        data: Extract<ClientMessage, { type: "rename_sprint" }>
    ): void {
        this.setState({ ...this.state, sprintName: data.sprintName, lastUpdatedAt: Date.now() });
        this.broadcast(JSON.stringify({ type: "state_update", state: this.state }));
    }

    // ─── SSE stream reader ────────────────────────────────────────────────────

    private async readSSEStream(
        stream: ReadableStream,
        onChunk: (token: string) => void
    ): Promise<string> {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let sseBuffer = "";

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split("\n");
                sseBuffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data:")) continue;
                    const jsonStr = trimmed.slice(5).trim();
                    if (jsonStr === "[DONE]") continue;
                    try {
                        const parsed = JSON.parse(jsonStr) as { response?: string };
                        if (typeof parsed.response === "string") {
                            accumulated += parsed.response;
                            onChunk(parsed.response);
                        }
                    } catch {
                        // Partial or non-JSON SSE line — skip silently
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return accumulated;
    }

    // ─── Generate Plan ────────────────────────────────────────────────────────

    private async handleGeneratePlan(
        connection: Connection<ConnectionState>,
        data: Extract<ClientMessage, { type: "generate_plan" }>
    ): Promise<void> {
        if (this.state.tasks.length === 0) {
            connection.send(JSON.stringify({
                type: "error",
                message: "No tasks to prioritize. Add some tasks first.",
            }));
            return;
        }

        const taskList = this.state.tasks
            .map(
                (t, i) =>
                    `${i + 1}. [ID: ${t.id}]\n` +
                    `   Title: ${t.title}\n` +
                    `   Description: ${t.description || "(none)"}\n` +
                    `   Impact: ${t.impact}/5 | Effort: ${t.effort}/5 | Priority: ${t.priority}/5\n` +
                    `   Value Score: ${((t.impact * t.priority) / t.effort).toFixed(2)}\n` +
                    `   Assignee: ${t.assignee}`
            )
            .join("\n\n");

        const constraintsSection = data.constraints
            ? `\n\nAdditional constraints: ${data.constraints}`
            : "";

        const systemPrompt =
            "You are a senior engineering manager with 15 years experience running sprints.\n" +
            "A junior dev can sort tasks by impact/effort score — that is NOT your job here.\n" +
            "Your job is to find non-obvious insights a number-sorter would miss:\n" +
            "- Tasks that SOUND different but solve the same underlying problem (not just identical titles)\n" +
            "- Hidden blockers: task B will fail or be wasted if task A isn't done first\n" +
            "- Risk flags: tasks that are underestimated based on their description\n" +
            "- Scope creep: tasks vague enough that they could explode in effort mid-sprint\n" +
            "- Assignee overload: if the same person is on too many high-effort tasks\n" +
            "- Quick wins that will unblock OTHER tasks, not just high value standalone\n" +
            "Be specific in your rationale — reference the actual task descriptions, not just the numbers.\n" +
            "CRITICAL: Return ONLY raw JSON. No markdown, no code fences, no explanation outside the JSON.";

        const userPrompt =
            `Sprint backlog:\n\n${taskList}${constraintsSection}\n\n` +
            "Return ONLY this JSON (no other text):\n" +
            `{
  "prioritizedTasks":[{"taskId":"<id>","rank":1,"rationale":"<specific insight referencing description, not just numbers>","recommendation":"include|defer|split|clarify"}],
  "topRecommendations":[
    "<actionable recommendation 1 — e.g. swap task X and Y because...>",
    "<actionable recommendation 2>",
    "<actionable recommendation 3>"
  ],
  "risks":[
    "<specific risk with task name — e.g. Redesign dashboard is likely underestimated, UI work always expands>",
    "<specific risk 2>"
  ],
  "assigneeFlags":[
    "<e.g. Alice has 3 high-effort tasks — consider redistributing X to Bob>"
  ],
  "summary":"<1 sentence — the single most important thing the team should know going into this sprint>",
  "totalEstimatedEffort":<number>,
  "warnings":["<only non-obvious duplicates — tasks that solve the same problem even if named differently>"],
  "dependencies":[{"taskId":"<id>","dependsOn":"<id>","reason":"<why this ordering matters>"}]
}\n\n` +
            "Requirements: every task must appear in prioritizedTasks, rationale must reference the actual description not just scores.";

        const aiResponse = await (this.env.AI.run as Function)(
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            {
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                stream: false,
                max_tokens: 8192,
            }
        ) as { response: string };

        const rawResponse = aiResponse.response ?? aiResponse;
        const accumulated = (typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse)).trim();
        console.log(`[SprintAgent] Plan raw response (${accumulated.length} chars):`, accumulated.slice(0, 300));

        if (accumulated) {
            this.broadcast(JSON.stringify({ type: "plan_stream_chunk", chunk: accumulated }));
        }

        const sanitized = accumulated
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();

        let parsedPlan: {
            prioritizedTasks: PrioritizedTask[];
            topRecommendations?: string[];
            risks?: string[];
            assigneeFlags?: string[];
            summary: string;
            totalEstimatedEffort: number;
            warnings?: string[];
            dependencies?: { taskId: string; dependsOn: string; reason: string }[];
        };

        try {
            parsedPlan = JSON.parse(sanitized);
        } catch (parseErr) {
            console.error("[SprintAgent] JSON parse failed:", parseErr, "\nFull raw:\n", sanitized);
            this.broadcast(JSON.stringify({
                type: "error",
                message: "AI returned invalid JSON. Full response logged to server console.",
            }));
            return;
        }

        const plan: GeneratedPlan = {
            prioritizedTasks: parsedPlan.prioritizedTasks,
            topRecommendations: parsedPlan.topRecommendations ?? [],
            risks: parsedPlan.risks ?? [],
            assigneeFlags: parsedPlan.assigneeFlags ?? [],
            summary: parsedPlan.summary,
            totalEstimatedEffort: parsedPlan.totalEstimatedEffort,
            warnings: parsedPlan.warnings ?? [],
            dependencies: parsedPlan.dependencies ?? [],
            generatedAt: Date.now(),
            generatedBy: data.userName,
        };

        this.setState({ ...this.state, generatedPlan: plan, lastUpdatedAt: Date.now() });
        this.broadcast(JSON.stringify({ type: "plan_stream_done", plan }));
        this.broadcast(JSON.stringify({ type: "state_update", state: this.state }));
    }

    // ─── Chat ─────────────────────────────────────────────────────────────────

    private async handleChatMessage(
        connection: Connection<ConnectionState>,
        data: Extract<ClientMessage, { type: "chat_message" }>
    ): Promise<void> {
        if (!this.state.generatedPlan) {
            connection.send(JSON.stringify({
                type: "error",
                message: "Generate a plan first before chatting about it.",
            }));
            return;
        }

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            content: data.content,
            userName: data.userName,
            timestamp: Date.now(),
        };

        const chatHistoryWithUser = [...this.state.chatHistory, userMessage];
        this.setState({ ...this.state, chatHistory: chatHistoryWithUser });

        const plan = this.state.generatedPlan;
        const taskSummary = this.state.tasks
            .map((t) => `- [${t.id}] ${t.title} (impact:${t.impact} effort:${t.effort} priority:${t.priority})`)
            .join("\n");

        const planContext =
            `Sprint: "${this.state.sprintName}"\n\nTasks:\n${taskSummary}\n\n` +
            `Plan summary: ${plan.summary}\n` +
            `Top recommendations:\n${plan.topRecommendations?.join("\n") ?? "none"}\n` +
            `Risks:\n${plan.risks?.join("\n") ?? "none"}\n` +
            `Ranked order:\n${[...plan.prioritizedTasks]
                .sort((a, b) => a.rank - b.rank)
                .map((pt) => {
                    const t = this.state.tasks.find((x) => x.id === pt.taskId);
                    return `${pt.rank}. ${t?.title ?? pt.taskId} (${pt.recommendation}) — ${pt.rationale}`;
                })
                .join("\n")}`;

        const systemPrompt =
            "You are a sprint planning assistant. A plan has already been generated.\n" +
            "Answer follow-up questions concisely and practically (1-3 paragraphs max).\n\n" +
            `Current sprint context:\n${planContext}`;

        const conversationMessages = chatHistoryWithUser.slice(-10).map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.role === "user" ? `[${msg.userName}]: ${msg.content}` : msg.content,
        }));

        const stream = await (this.env.AI.run as Function)(
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            {
                messages: [{ role: "system", content: systemPrompt }, ...conversationMessages],
                stream: true,
                max_tokens: 1024,
            }
        ) as ReadableStream;

        const assistantMessageId = crypto.randomUUID();
        const accumulated = await this.readSSEStream(stream, (token) => {
            this.broadcast(JSON.stringify({
                type: "chat_stream_chunk",
                chunk: token,
                messageId: assistantMessageId,
            }));
        });

        const assistantMessage: ChatMessage = {
            id: assistantMessageId,
            role: "assistant",
            content: accumulated.trim(),
            userName: "AI Assistant",
            timestamp: Date.now(),
        };

        const updatedHistory = [...chatHistoryWithUser, assistantMessage];
        this.setState({ ...this.state, chatHistory: updatedHistory, lastUpdatedAt: Date.now() });
        this.broadcast(JSON.stringify({ type: "chat_stream_done", message: assistantMessage }));
        this.broadcast(JSON.stringify({ type: "state_update", state: this.state }));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private broadcastExcept(excludeConnectionId: string, message: object): void {
        const payload = JSON.stringify(message);
        for (const [id, conn] of this.connections) {
            if (id !== excludeConnectionId) {
                try { conn.send(payload); } catch { /* ignore broken connections */ }
            }
        }
    }
}
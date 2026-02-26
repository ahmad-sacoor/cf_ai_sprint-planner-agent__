# Sprint Planner Agent

A real-time AI-powered sprint planning tool built on Cloudflare's Agents SDK. Multiple team members join a shared sprint room, add tasks, and let Llama 3.3 generate a prioritized plan. Everything updates live with no page refreshes.

Built as a Cloudflare internship application assignment requiring: an LLM, workflow coordination, user input via chat, and persistent state.

**Live demo:** https://sprint-planner-agent-frontend.pages.dev

---

## Table of Contents

- [What It Does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [How the Cloudflare Primitives Are Used](#how-the-cloudflare-primitives-are-used)
- [Project Structure](#project-structure)
- [File Breakdown](#file-breakdown)
- [WebSocket Message Protocol](#websocket-message-protocol)
- [AI Plan Generation](#ai-plan-generation)
- [AI Chat](#ai-chat)
- [Frontend](#frontend)
- [Getting Started](#getting-started)
- [Running Locally](#running-locally)
- [Testing with DevTools Console](#testing-with-devtools-console)
- [Deploying to Cloudflare](#deploying-to-cloudflare)

---

## What It Does

1. A team member opens the app, enters their name and a sprint ID (e.g. `sprint-42`), and connects to a shared room
2. Teammates join using the same sprint ID and are connected in real time via WebSocket
3. Anyone can add tasks with a title, description, and three scores: **impact** (value delivered), **effort** (work required), and **priority** (urgency), each rated 1-5
4. All connected users see the board update instantly as tasks are added, edited, or deleted
5. Any user can click **Generate Plan**. Llama 3.3 analyses the task list and returns a prioritized plan with a rationale for every decision
6. Anyone can then chat with the AI about the plan ("why is task 3 first?", "what if we drop the low-effort tasks?")
7. All state persists automatically. Tasks, the plan, and chat history all survive disconnections and reconnects

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (ES Modules) |
| Agent framework | Cloudflare Agents SDK (`agents` npm package) |
| Coordination / state | Cloudflare Durable Objects (via Agents SDK) |
| AI model | Llama 3.3 70B via Cloudflare Workers AI |
| Language (backend) | TypeScript (strict mode) |
| Frontend | React + TypeScript + Vite |
| Styling | Custom CSS (Apple-inspired minimalist) |
| Real-time transport | WebSockets (managed by Agents SDK) |
| Local development | Wrangler CLI |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 Cloudflare Edge                   │
│                                                  │
│  ┌─────────────┐      ┌──────────────────────┐  │
│  │   Worker    │      │    SprintAgent        │  │
│  │  (router)   │─────▶│   (Durable Object)   │  │
│  │  index.ts   │      │                      │  │
│  └─────────────┘      │  - WebSocket handler │  │
│         ▲             │  - Task management   │  │
│         │             │  - State persistence │  │
│   HTTP / WS           │  - AI plan + chat    │  │
│         │             └──────────┬───────────┘  │
│  ┌──────┴──────┐                 │              │
│  │  Frontend   │                 ▼              │
│  │ React + Vite│      ┌──────────────────────┐  │
│  └─────────────┘      │   Workers AI         │  │
│                       │   Llama 3.3 70B      │  │
│                       └──────────────────────┘  │
└──────────────────────────────────────────────────┘
```

Each sprint room is a separate Agent instance named by its sprint ID. Two users with the same sprint ID always land on the same instance. This is guaranteed by Durable Objects' global uniqueness.

```
User A (Alice) ─┐
User B (Bob)   ─┼──▶  SprintAgent("sprint-42")  [shared state + WebSockets]
User C (Carol) ─┘

User D (Dave)  ────▶  SprintAgent("sprint-99")  [completely separate]
```

---

## How the Cloudflare Primitives Are Used

**LLM - Workers AI (Llama 3.3)**
Accessed via `this.env.AI`. Plan generation uses `stream: false` to guarantee a complete JSON response. Chat uses `stream: true` to stream tokens to clients in real time.

**Coordination - Durable Objects via Agents SDK**
`SprintAgent` extends the `Agent` base class which makes it a Durable Object automatically. The SDK handles the lifecycle, WebSocket hibernation, state persistence, and connection management.

**User Input - WebSockets**
All interactions happen over WebSocket. Clients connect to `/agents/sprint-agent/:sprintId?userName=Alice`. The Agent's `onConnect`, `onMessage`, and `onClose` handle the full lifecycle.

**Memory / State - `this.setState()`**
Every `setState` call persists to durable storage and syncs to all connected clients. No separate database, cache, or pub/sub layer is needed.

---

## Project Structure

```
/
├── src/
│   ├── index.ts          <- Worker entry point, routing, CORS
│   ├── SprintAgent.ts    <- Main Agent class (Durable Object)
│   └── types.ts          <- All shared TypeScript types
├── frontend/
│   ├── src/
│   │   ├── App.tsx        <- Main component + WebSocket logic
│   │   ├── main.tsx
│   │   └── styles/
│   │       └── apple.css  <- Design system
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── wrangler.toml
├── package.json
└── tsconfig.json
```

---

## File Breakdown

**`src/types.ts`** - Single source of truth for all TypeScript types: `Task`, `SprintState`, `GeneratedPlan`, `PrioritizedTask`, `ChatMessage`, `ClientMessage` (discriminated union), `ServerMessage` (discriminated union), and `Env`. Keeping `Env` here prevents duplicate interface definitions across files.

**`src/SprintAgent.ts`** - The core Agent class. Key methods:
- `onStart()` - initializes `sprintId` from `this.name` (the instance identifier)
- `onConnect()` - extracts `userName` from the URL query string, sends full state to the new client, and broadcasts `user_joined` to everyone else
- `onMessage()` - routes incoming messages to private handlers by `type`
- `onClose()` - removes the user from `connectedUsers` and broadcasts `user_left`
- `handleAddTask/UpdateTask/DeleteTask()` - mutate tasks and broadcast updated state
- `handleGeneratePlan()` - builds a structured prompt, calls Workers AI, parses the JSON, and broadcasts the plan
- `handleChatMessage()` - streams an AI response and saves the completed message to `chatHistory`
- `broadcastExcept()` - sends to all connections except one specific connection. Uses a private `connections: Map<string, Connection>` since the SDK's `this.broadcast()` sends to everyone

**`src/index.ts`** - Worker entry point. Uses `routeAgentRequest` to route all `/agents/*` traffic to the correct Agent instance. Handles CORS, `OPTIONS` preflight, and a `/health` endpoint. Re-exports `SprintAgent` as a named export which is required for Durable Object registration.

**`wrangler.toml`**
```toml
name = "sprint-planner-agent"
main = "src/index.ts"
compatibility_date = "2025-02-01"
compatibility_flags = ["nodejs_compat"]

[ai]
binding = "AI"

[[durable_objects.bindings]]
name = "SprintAgent"
class_name = "SprintAgent"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["SprintAgent"]
```
The `new_sqlite_classes` migration is required. Without it the Agent's embedded SQLite and state persistence will not be provisioned.

---

## WebSocket Message Protocol

### Client to Server

| `type` | Purpose | Key fields |
|---|---|---|
| `join` | Identify the connecting user | `userName` |
| `add_task` | Add a task to the backlog | `task` (all fields except id/timestamps) |
| `update_task` | Edit an existing task | `taskId`, `updates` |
| `delete_task` | Remove a task | `taskId` |
| `generate_plan` | Trigger AI plan generation | `userName`, optional `constraints` |
| `chat_message` | Send a message to the AI | `content`, `userName` |
| `rename_sprint` | Change the sprint name | `sprintName` |

### Server to Client

| `type` | Purpose |
|---|---|
| `init` | Full state on first connect |
| `state_update` | Full updated state after any change |
| `plan_stream_chunk` | AI plan content chunk |
| `plan_stream_done` | Complete parsed plan object |
| `chat_stream_chunk` | Streaming AI chat token |
| `chat_stream_done` | Completed assistant message |
| `user_joined` / `user_left` | Presence events |
| `error` | Error back to the requesting client |

---

## AI Plan Generation

The system prompt tells the AI to act as a senior engineering manager. It explains the three scoring dimensions and provides the formula `value_score = (impact x priority) / effort` as a starting point. The model is also instructed to reason beyond the formula, for example by unblocking a low-scoring task that is a dependency for higher-value work.

The user prompt includes the full task list, any optional constraints (e.g. "max 20 effort points"), and a strict instruction to return only a JSON object:

```json
{
  "prioritizedTasks": [
    { "taskId": "...", "rank": 1, "rationale": "...", "recommendation": "include" }
  ],
  "summary": "...",
  "totalEstimatedEffort": 12,
  "reasoning": "..."
}
```

Before parsing, markdown fences are stripped in case the model adds them:
```typescript
response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
```

---

## AI Chat

Once a plan exists, users can ask follow-up questions. The handler builds a conversation using the plan and task list as context, the last 10 messages from `chatHistory`, and the new user message.

The response streams via Workers AI's SSE format. A helper decodes `Uint8Array` chunks, splits on newlines, and parses each `data:` line to extract tokens. Each token is broadcast as a `chat_stream_chunk`. When the stream finishes the full message is saved to `chatHistory`.

---

## Frontend

Built with Vite + React + TypeScript. `App.tsx` manages the WebSocket connection, routes incoming messages, and renders the task board, generate button, and chat panel.

The `apple.css` design system uses the system-ui / SF Pro font stack with off-white backgrounds and white cards. It has subtle shadows, 12px border radius, muted blue (`#0071e3`) as the single accent colour, and 200ms ease transitions throughout.

---

## Getting Started

**Prerequisites:** Node.js 18+, a Cloudflare account, Wrangler CLI (`npm install -g wrangler`), authenticated via `wrangler login`.

```bash
# Install backend dependencies (from project root)
npm install

# Install frontend dependencies
cd frontend && npm install
```

---

## Running Locally

```bash
# Terminal 1 - backend at http://localhost:8787 (from project root)
npm run dev

# Terminal 2 - frontend at http://localhost:5173
cd frontend && npm run dev
```

Workers AI calls proxy to Cloudflare's real infrastructure. An internet connection and a logged-in Wrangler session are required. Open multiple tabs with the same sprint ID to simulate multiple users.

---

## Testing with DevTools Console

Open any page on `http://localhost:8787`, open DevTools, and paste this into the Console tab. It opens a WebSocket connection, adds a task, and logs all incoming messages so you can verify the backend is responding correctly.

```javascript
const ws = new WebSocket("ws://localhost:8787/agents/sprint-agent/test-1?userName=Alice");
ws.onopen = () => ws.send(JSON.stringify({
  type: "add_task",
  task: { title: "Build auth", description: "", impact: 5, effort: 4, priority: 5, assignee: "Alice", createdBy: "Alice" }
}));
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

To simulate multiple users, open a second tab and paste the same snippet with a different `userName` and the same sprint ID. Both connections will receive each other's state updates in real time.

---

## Deploying to Cloudflare

**Backend** (from project root):
```bash
npm run deploy
```
Deployed at: https://sprint-planning-agent.ahmad-edge-proxy.workers.dev

**Frontend:**
```bash
cd frontend
npm run build
wrangler pages deploy dist --project-name sprint-planner-agent-frontend
```
Deployed at: https://sprint-planner-agent-frontend.pages.dev

# Sprint Planner Agent — Test Guide

## Installation & Local Development

```bash
# Install dependencies
npm install

# Start the local dev server (binds to http://localhost:8787)
npm run dev
```

> **Note:** Workers AI calls will be proxied to Cloudflare's network even during `wrangler dev`.  
> You must be logged in: `npx wrangler login`

---

## Health Check

```bash
curl http://localhost:8787/health
# Expected: {"status":"ok","timestamp":1234567890,"service":"sprint-planner-agent"}
```

---

## WebSocket Testing with `wscat`

Install wscat if you don't have it:
```bash
npm install -g wscat
```

### Terminal 1 — Connect as Alice

```bash
wscat -c "ws://localhost:8787/agents/SprintAgent/sprint-001?userName=Alice"
```

After connecting you'll receive an `init` message with the full sprint state.

**Add a task:**
```json
{"type":"add_task","task":{"title":"Build auth system","description":"JWT-based authentication with refresh tokens","impact":5,"effort":4,"priority":5,"assignee":"Alice","createdBy":"Alice"}}
```

**Add another task:**
```json
{"type":"add_task","task":{"title":"Fix login bug","description":"Users get logged out randomly after 10 minutes","impact":4,"effort":2,"priority":5,"assignee":"Bob","createdBy":"Alice"}}
```

**Add a lower-priority task:**
```json
{"type":"add_task","task":{"title":"Update README","description":"Document the new API endpoints","impact":2,"effort":1,"priority":2,"assignee":"Unassigned","createdBy":"Alice"}}
```

**Rename the sprint:**
```json
{"type":"rename_sprint","sprintName":"Sprint 4 — Auth & Reliability"}
```

**Generate the AI plan:**
```json
{"type":"generate_plan","userName":"Alice","constraints":"Focus on high-impact items first. Max 15 effort points total."}
```

You will receive a stream of `plan_stream_chunk` messages followed by a `plan_stream_done` message containing the full structured plan.

**Chat about the plan:**
```json
{"type":"chat_message","content":"Why is the auth system ranked first?","userName":"Alice"}
```

```json
{"type":"chat_message","content":"What if we dropped the auth system and focused only on the bug fix?","userName":"Alice"}
```

**Update a task** (replace `<taskId>` with an actual id from the state):
```json
{"type":"update_task","taskId":"<taskId>","updates":{"effort":3,"assignee":"Charlie"}}
```

**Delete a task:**
```json
{"type":"delete_task","taskId":"<taskId>"}
```

---

### Terminal 2 — Connect as Bob (real-time collaboration test)

Open a second terminal and connect to the **same sprint room**:

```bash
wscat -c "ws://localhost:8787/agents/SprintAgent/sprint-001?userName=Bob"
```

- Bob will immediately receive the full current state via an `init` message.
- When Alice adds/edits/deletes tasks in Terminal 1, Bob will receive `state_update` messages in real-time.
- When Alice generates a plan, Bob will see all the `plan_stream_chunk` messages stream in simultaneously.
- When either user disconnects (`Ctrl+C`), the other receives a `user_left` message.

---

### Terminal 3 — Different sprint room (isolation test)

```bash
wscat -c "ws://localhost:8787/agents/SprintAgent/sprint-002?userName=Carol"
```

Carol joins a completely separate sprint room (`sprint-002`). She has her own isolated state and will not receive any messages from the `sprint-001` room.

---

## Message Type Reference

### Client → Server

| Type | Required Fields | Description |
|------|----------------|-------------|
| `join` | `userName` | Re-join and re-sync state |
| `add_task` | `task` object | Add a new task to backlog |
| `update_task` | `taskId`, `updates` | Edit task fields |
| `delete_task` | `taskId` | Remove a task |
| `generate_plan` | `userName`, optional `constraints` | Trigger AI plan generation |
| `chat_message` | `content`, `userName` | Chat with AI about the plan |
| `rename_sprint` | `sprintName` | Rename the current sprint |

### Server → Client

| Type | Description |
|------|-------------|
| `init` | Full state on connection or rejoin |
| `state_update` | Full state after any mutation |
| `plan_stream_chunk` | Streaming token from plan generation |
| `plan_stream_done` | Final structured plan object |
| `chat_stream_chunk` | Streaming token from chat response |
| `chat_stream_done` | Final chat message object |
| `user_joined` | Another user connected |
| `user_left` | Another user disconnected |
| `error` | Something went wrong |

---

## Persistence Test

1. Connect as Alice, add tasks, and generate a plan.
2. Disconnect Alice (`Ctrl+C`).
3. Reconnect: `wscat -c "ws://localhost:8787/agents/SprintAgent/sprint-001?userName=Alice"`
4. You'll receive the full state including tasks and the generated plan — state survived the disconnection.

---

## Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

After deploying, replace `localhost:8787` with your Worker's URL (e.g., `sprint-planner-agent.<your-subdomain>.workers.dev`) in all wscat commands, using `wss://` instead of `ws://`.

```bash
wscat -c "wss://sprint-planner-agent.<your-subdomain>.workers.dev/agents/SprintAgent/sprint-001?userName=Alice"
```

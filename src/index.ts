import { routeAgentRequest } from "agents";
import { SprintAgent } from "./SprintAgent";
import type { Env } from "./types";

// Re-export SprintAgent so the Workers runtime can register it as a Durable Object
export { SprintAgent };

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Upgrade, Connection",
};

function withCors(response: Response): Response {
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
        newHeaders.set(key, value);
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const url = new URL(request.url);

        // Health check endpoint
        if (url.pathname === "/health") {
            return new Response(
                JSON.stringify({ status: "ok", timestamp: Date.now(), service: "sprint-planner-agent" }),
                {
                    status: 200,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                }
            );
        }

        // Route all /agents/* paths (and WebSocket upgrades) to the Agent framework.
        // IMPORTANT: Do NOT wrap WebSocket upgrade responses with CORS headers —
        // adding headers to a 101 Switching Protocols response breaks the handshake.
        const isWebSocket = request.headers.get("Upgrade") === "websocket";
        const agentResponse = await routeAgentRequest(request, env);
        if (agentResponse) {
            return isWebSocket ? agentResponse : withCors(agentResponse);
        }

        // 404 fallback
        return new Response(
            JSON.stringify({ error: "Not found", path: url.pathname }),
            {
                status: 404,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    },
} satisfies ExportedHandler<Env>;
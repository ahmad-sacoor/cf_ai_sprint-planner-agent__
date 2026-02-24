import { routeAgentRequest } from 'agents';
import type { Env } from './types';
import { SprintAgent } from './SprintAgent';

// Helper function to add CORS headers
function corsHeaders(origin: string = '*') {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version',
        'Access-Control-Max-Age': '86400',
    };
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '*';

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders(origin),
            });
        }

        // Route to Agent
        const response = await routeAgentRequest(request, env);

        if (response) {
            // Check if this is a WebSocket upgrade (status 101)
            if (response.status === 101 || request.headers.get('Upgrade') === 'websocket') {
                // For WebSocket upgrades, return the response as-is
                // DO NOT add CORS headers or modify the response
                return response;
            }

            // For regular HTTP responses, add CORS headers
            const newResponse = new Response(response.body, response);
            Object.entries(corsHeaders(origin)).forEach(([key, value]) => {
                newResponse.headers.set(key, value);
            });
            return newResponse;
        }

        // 404 for unmatched routes
        return new Response('Not found', {
            status: 404,
            headers: corsHeaders(origin),
        });
    },
} satisfies ExportedHandler<Env>;

// Export the Durable Object class
export { SprintAgent };
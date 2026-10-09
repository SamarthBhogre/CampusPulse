import { createMcpHandler } from 'mcp-handler';
import { registerCampusPulseTools } from '@/lib/mcp/tools';

export const MCP_ENDPOINT = '/api/mcp';
export const MCP_PUBLIC_ENDPOINT = '/api/mcp/public';
export const MCP_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_ENDPOINT}`;

const SERVER_OPTIONS = {
  serverInfo: { name: 'campus-pulse', version: '1.0.0' },
  instructions: [
    'CampusPulse is a campus events and volunteering platform.',
    'Events are grouped by club; use the club filter as the event category.',
    'Tools marked with a confirm argument change or cancel things for other people: always show the preview to the user and only repeat the call with confirm: true after they explicitly agree.',
    'Users can only act as themselves; never ask for or pass another user\'s id.',
  ].join(' '),
};

/**
 * Builds a stateless Streamable HTTP MCP handler (Vercel-compatible; SSE is
 * disabled so no Redis is needed). Tools are registered per request so the
 * tool list reflects the caller's verified role.
 */
export function createCampusPulseMcpHandler({ endpoint, authInfo = null }) {
  return createMcpHandler(
    (server) => registerCampusPulseTools(server, { authInfo }),
    SERVER_OPTIONS,
    { streamableHttpEndpoint: endpoint, disableSse: true, maxDuration: 60 }
  );
}

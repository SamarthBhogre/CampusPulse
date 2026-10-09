import { withMcpAuth } from 'mcp-handler';
import { verifyMcpToken } from '@/lib/mcp/auth';
import { createCampusPulseMcpHandler, MCP_ENDPOINT, MCP_RESOURCE_METADATA_PATH } from '@/lib/mcp/server';

/**
 * Authenticated CampusPulse MCP endpoint (Streamable HTTP).
 * Requires a Supabase OAuth 2.1 access token; unauthenticated requests get a
 * 401 challenge pointing at the protected resource metadata so MCP clients can
 * start the OAuth flow.
 */
const handler = withMcpAuth(
  (req) => createCampusPulseMcpHandler({ endpoint: MCP_ENDPOINT, authInfo: req.auth })(req),
  verifyMcpToken,
  { required: true, resourceMetadataPath: MCP_RESOURCE_METADATA_PATH }
);

export const maxDuration = 60;
export { handler as GET, handler as POST, handler as DELETE };

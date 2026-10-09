import { createCampusPulseMcpHandler, MCP_PUBLIC_ENDPOINT } from '@/lib/mcp/server';

/**
 * Public CampusPulse MCP endpoint: read-only discovery tools, no sign-in.
 * Runs as the Supabase anon role, so only publicly visible data is returned.
 */
const handler = createCampusPulseMcpHandler({ endpoint: MCP_PUBLIC_ENDPOINT });

export const maxDuration = 60;
export { handler as GET, handler as POST, handler as DELETE };

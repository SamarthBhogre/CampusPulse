import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { getSupabaseAuthIssuer } from '@/lib/mcp/auth';

/** RFC 9728 protected resource metadata for /api/mcp: tokens come from Supabase Auth. */
const handler = (req) => protectedResourceHandler({ authServerUrls: [getSupabaseAuthIssuer()] })(req);

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();

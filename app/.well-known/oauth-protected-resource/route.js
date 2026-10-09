import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from 'mcp-handler';
import { getSupabaseAuthIssuer } from '@/lib/mcp/auth';
import { MCP_ENDPOINT } from '@/lib/mcp/server';

/** Root metadata for clients that look it up without the resource path. */
export function GET(req) {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [getSupabaseAuthIssuer()],
    resourceUrl: `${getPublicOrigin(req)}${MCP_ENDPOINT}`,
  });
  return Response.json(metadata, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=3600' },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

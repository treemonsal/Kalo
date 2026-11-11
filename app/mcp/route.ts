import { env } from "cloudflare:workers";
import { AccountStore, mcp } from "../../lib/service";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  if (!env.DB) return new Response(null, { status: 503 });
  return mcp(request, new AccountStore(env.DB));
}

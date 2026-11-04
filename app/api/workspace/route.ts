import { env } from "cloudflare:workers";
import { AccountStore, api } from "../../../lib/service";

export const dynamic = "force-dynamic";

function handle(request: Request) {
  if (!env.DB) return Response.json({ error: "Der Datenspeicher ist gerade nicht verfügbar." }, { status: 503 });
  return api(request, new AccountStore(env.DB));
}

export const GET = handle;
export const POST = handle;

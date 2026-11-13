import { env } from "cloudflare:workers";
import { AccountStore, explainApi } from "../../../lib/service";

export const dynamic = "force-dynamic";
export function POST(request: Request) {
  if (!env.DB) return Response.json({ error: "Der Datenspeicher ist gerade nicht verfügbar." }, { status: 503 });
  return explainApi(request, new AccountStore(env.DB));
}

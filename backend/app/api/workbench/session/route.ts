import { ownerIdentity } from "../../../../lib/site-owner";

export async function GET() {
  return Response.json({ owner: Boolean(await ownerIdentity()), sign_in: "/login?return_to=%2Fworkbench%2F%3Fpage%3Dreview" }, { headers: { "Cache-Control": "no-store" } });
}

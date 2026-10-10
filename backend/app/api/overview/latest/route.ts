import { mirrorCache, mirrorResponse, readMirror } from "../../../../lib/local-mirror";

export async function GET() {
  try { return Response.json(await readMirror("overview.json"), { headers: mirrorCache }); }
  catch (error) { return mirrorResponse(error); }
}

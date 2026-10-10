import { mirrorCache, mirrorResponse, readMirror } from "../../../../../lib/local-mirror";

export async function GET(_request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await context.params;
    return Response.json(await readMirror(`post-packets/${encodeURIComponent(postId)}.json`), { headers: mirrorCache });
  } catch (error) { return mirrorResponse(error); }
}

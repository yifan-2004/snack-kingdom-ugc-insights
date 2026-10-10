import { mirrorCache, mirrorResponse, readMirror } from "../../../../lib/local-mirror";

export async function GET(_request: Request, context: { params: Promise<{ postId: string }> }) {
  try {
    const { postId } = await context.params;
    const detail = await readMirror<Record<string, unknown>>(`post-details/${encodeURIComponent(postId)}.json`);
    // The public mirror keeps the analysis and media descriptions, but does not
    // pretend that desktop-only file paths are remotely available.
    const media = Array.isArray(detail.media)
      ? detail.media.map((item) => item && typeof item === "object" ? { ...item, local_url: null } : item)
      : [];
    return Response.json({ ...detail, media }, { headers: mirrorCache });
  } catch (error) { return mirrorResponse(error); }
}

import { getDb } from "../../../../db";
import { commentReviewDecisions } from "../../../../db/schema";
import { requireOwner } from "../../../../lib/site-owner";

export async function GET(request: Request) {
  const actor = await requireOwner(request); if (actor instanceof Response) return actor;
  const rows = await getDb().select().from(commentReviewDecisions);
  return Response.json({ decisions: rows.map(row => ({ post_id: row.postId, comment_id: row.commentId, expected_packet_hash: row.packetHash, attributes: JSON.parse(row.attributesJson), note: row.note, reviewed_at: row.reviewedAt })), count: rows.length }, { headers: { "Cache-Control": "private, no-store" } });
}

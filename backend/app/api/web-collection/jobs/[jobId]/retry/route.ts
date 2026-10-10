import { getRawDb } from '../../../../../../db';
import { requireOwner } from '../../../../../../lib/site-owner';

export async function POST(request:Request,{params}:{params:Promise<{jobId:string}>}){const actor=await requireOwner(request);if(actor instanceof Response)return actor;const {jobId}=await params;if(!/^[0-9a-f-]{36}$/.test(jobId))return Response.json({detail:'任务编号无效'},{status:400});const result=await getRawDb().prepare("UPDATE web_collection_jobs SET status='running',error_message=NULL,updated_at=? WHERE id=? AND status='failed'").bind(new Date().toISOString(),jobId).run();return result.meta.changes?Response.json({ok:true}):Response.json({detail:'只能继续失败的任务'},{status:409})}

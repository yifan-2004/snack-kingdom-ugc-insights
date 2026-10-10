import { requireOwner } from '../../../../../../lib/site-owner';
import { stepCollection } from '../../../../../../lib/web-collection';

export async function POST(request:Request,{params}:{params:Promise<{jobId:string}>}){const actor=await requireOwner(request);if(actor instanceof Response)return actor;const {jobId}=await params;if(!/^[0-9a-f-]{36}$/.test(jobId))return Response.json({detail:'任务编号无效'},{status:400});try{return Response.json(await stepCollection(jobId))}catch(error){console.error('web collection step failed',error);return Response.json({detail:error instanceof Error?error.message:'任务执行失败'},{status:500})}}

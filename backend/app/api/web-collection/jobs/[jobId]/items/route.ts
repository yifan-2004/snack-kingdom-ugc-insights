import { requireOwner } from '../../../../../../lib/site-owner';
import { getCollectionItems } from '../../../../../../lib/web-collection';

export async function GET(request:Request,{params}:{params:Promise<{jobId:string}>}){const actor=await requireOwner(request);if(actor instanceof Response)return actor;const {jobId}=await params;if(!/^[0-9a-f-]{36}$/.test(jobId))return Response.json({detail:'任务编号无效'},{status:400});try{return Response.json(await getCollectionItems(jobId),{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('web collection items failed',error);return Response.json({detail:'采集结果暂不可用'},{status:503})}}

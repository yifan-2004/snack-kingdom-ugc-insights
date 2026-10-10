import { getRawDb } from '../../../../db';
import { requireOwner } from '../../../../lib/site-owner';
import { getCollectionJobs } from '../../../../lib/web-collection';

export async function GET(request:Request){const actor=await requireOwner(request);if(actor instanceof Response)return actor;try{return Response.json(await getCollectionJobs(),{headers:{'Cache-Control':'no-store'}})}catch(error){console.error('web collection list failed',error);return Response.json({detail:'任务列表暂不可用'},{status:503})}}

export async function POST(request:Request){const actor=await requireOwner(request);if(actor instanceof Response)return actor;
  try {const body=await request.json() as Record<string,unknown>;const keyword=String(body.keyword||'').trim();const start=String(body.start_date||'');const end=String(body.end_date||'');const max=Math.min(10,Math.max(1,Number(body.max_posts||10)));
    if(keyword.length<2||keyword.length>40||!/^[\d]{4}-[\d]{2}-[\d]{2}$/.test(start)||!/^[\d]{4}-[\d]{2}-[\d]{2}$/.test(end)||start>end||!Number.isInteger(max))return Response.json({detail:'请检查关键词、日期和帖子上限'},{status:400});
    const days=(Date.parse(end)-Date.parse(start))/86400000;if(days<0||days>30)return Response.json({detail:'单次采集范围最多 31 天'},{status:400});
    const active=await getRawDb().prepare("SELECT id FROM web_collection_jobs WHERE status IN ('queued','running','busy') LIMIT 1").first();if(active)return Response.json({detail:'已有任务运行中，请先等待它完成'},{status:409});
    const id=crypto.randomUUID();const now=new Date().toISOString();await getRawDb().prepare("INSERT INTO web_collection_jobs(id,status,platform,keyword,start_date,end_date,max_posts,created_at,updated_at) VALUES(?,'queued','xhs',?,?,?,?,?,?)").bind(id,keyword,start,end,max,now,now).run();return Response.json({id,status:'queued'},{status:202});
  }catch(error){console.error('create web collection failed',error);return Response.json({detail:'创建任务失败'},{status:500})}}

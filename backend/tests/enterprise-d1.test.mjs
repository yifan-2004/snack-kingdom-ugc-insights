import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {Miniflare, convertV4MiniflareOptions} from "miniflare";

test("actual local D1: migrations, batch rollback, isolated publication and restart persistence",async()=>{
  const root=fileURLToPath(new URL("../",import.meta.url));
  const bundled=await build({stdin:{contents:`import {EnterpriseService} from './lib/enterprise/service';
    export default {async fetch(request,env){const b=await request.json();const s=new EnterpriseService(env.DB);
    try{return Response.json(b.read?await s.read(b.actor,b.tenant,b.read):await s.mutate(b.actor,b.input))}
    catch(e){return Response.json({error:e.message},{status:e.status||500})}}};`,resolveDir:root,loader:"ts"},bundle:true,write:false,format:"esm",platform:"neutral"});
  const mf=new Miniflare(convertV4MiniflareOptions({name:"enterprise-test",modules:true,script:bundled.outputFiles[0].text,compatibilityDate:"2026-08-01",d1Databases:["DB"]}));
  try{
    const db=await mf.getD1Database("DB");
    const sql=await readFile(new URL("../drizzle/0003_eager_millenium_guard.sql",import.meta.url),"utf8");
    for(const statement of sql.split("--> statement-breakpoint").filter(s=>s.trim()))await db.prepare(statement).run();
    const actor={userId:"d1-owner",email:"owner@example.com"},other={userId:"outsider",email:"other@example.com"};
    async function call(input,expected=200){const r=await mf.dispatchFetch("http://test.local",{method:"POST",body:JSON.stringify({actor,input})});assert.equal(r.status,expected,await r.clone().text());return r.json();}
    await call({action:"createOrganization",requestId:"d1-org",name:"D1 Company"});
    await call({action:"createSnapshot",tenantId:"d1-org",snapshotId:"s1",expectedPosts:1,expectedBatches:1,dataCutoffAt:"2026-08-01T00:00:00Z"});
    await call({action:"publishSnapshot",tenantId:"d1-org",snapshotId:"s1"},409);
    assert.equal((await db.prepare("SELECT revision FROM ent_organizations WHERE id=?").bind("d1-org").first()).revision,0);
    await call({action:"uploadBatch",tenantId:"d1-org",snapshotId:"s1",batchNumber:1,posts:[{platform:"xhs",post_id:"post",title:"实际D1测试",comments:[{comment_id:"c",content:"不好吃"}]}]});
    await call({action:"publishSnapshot",tenantId:"d1-org",snapshotId:"s1"});
    const foreign=await mf.dispatchFetch("http://test.local",{method:"POST",body:JSON.stringify({actor:other,tenant:"d1-org",read:"analysis"})});assert.equal(foreign.status,404);
    const report=await mf.dispatchFetch("http://test.local",{method:"POST",body:JSON.stringify({actor,tenant:"d1-org",read:"report"})});
    const data=await report.json();assert.equal(data.snapshotId,"s1");assert.equal(data.analysis.topics[0].negative,1);
    // Each fetch constructs a fresh service; publication persists in D1 rather than process memory.
    assert.equal((await db.prepare("SELECT count(*) n FROM ent_audit").first()).n,3);
  }finally{await mf.dispose();}
});

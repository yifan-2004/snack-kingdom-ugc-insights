import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFile} from "node:fs/promises";
import {build} from "esbuild";
import {fileURLToPath} from "node:url";

const bundled=await build({entryPoints:[fileURLToPath(new URL("../lib/enterprise/service.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node"});
const {EnterpriseService}=await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const migration=await readFile(new URL("../drizzle/0003_eager_millenium_guard.sql",import.meta.url),"utf8");
class DatabaseAdapter {
  sql=new DatabaseSync(":memory:");
  statements=[];
  constructor(){this.sql.exec("PRAGMA foreign_keys=ON");this.sql.exec(migration);}
  prepare(query){
    const sqlite=this.sql, log=this.statements;
    return {query,values:[],bind(...values){this.values=values;return this;},
      async first(){log.push({query,values:this.values});return sqlite.prepare(query).get(...this.values)??null;},
      async all(){return {results:sqlite.prepare(query).all(...this.values)};},
      async run(){return sqlite.prepare(query).run(...this.values);}};
  }
  async batch(statements){
    this.sql.exec("BEGIN");try{const rows=statements.map(s=>{assert.ok(s.values.length<=100);return this.sql.prepare(s.query).run(...s.values);});this.sql.exec("COMMIT");return rows;}
    catch(e){this.sql.exec("ROLLBACK");throw e;}
  }
}
const alice={userId:"alice",email:"alice@example.com"},bob={userId:"bob",email:"bob@example.com"},viewer={userId:"viewer",email:"viewer@example.com"};
const doc=(id,text="口味不好吃")=>({post_id:id,platform:"xhs",title:`帖子${id}`,comments:[{comment_id:`c-${id}`,content:text}]});
async function setup(t){const db=new DatabaseAdapter();t.after(()=>db.sql.close());const service=new EnterpriseService(db);
  for(const [user,id] of [[alice,"tenant-a"],[bob,"tenant-b"]])await service.mutate(user,{action:"createOrganization",requestId:id,name:id});
  return {db,service};}
function create(service,actor=alice,tenant="tenant-a",id="s1",posts=1,batches=1){return service.mutate(actor,{action:"createSnapshot",tenantId:tenant,snapshotId:id,expectedPosts:posts,expectedBatches:batches,dataCutoffAt:"2026-08-01T00:00:00Z"});}
function upload(service,docs,id="s1",batch=1,actor=alice,tenant="tenant-a"){return service.mutate(actor,{action:"uploadBatch",tenantId:tenant,snapshotId:id,batchNumber:batch,posts:docs});}
function publish(service,id="s1",actor=alice,tenant="tenant-a"){return service.mutate(actor,{action:"publishSnapshot",tenantId:tenant,snapshotId:id});}

test("tenant reads/writes/search/report/membership are isolated",async t=>{
  const {service}=await setup(t);await create(service);await upload(service,[doc("a","苹果价格太贵")]);await publish(service);
  await create(service,bob,"tenant-b");await upload(service,[doc("b","香蕉味道很好")],"s1",1,bob,"tenant-b");await publish(service,"s1",bob,"tenant-b");
  assert.equal((await service.list(alice)).length,1);
  for(const view of ["analysis","report","snapshots","members","audit"])await assert.rejects(()=>service.read(bob,"tenant-a",view),e=>e.status===404);
  for(const action of ["publishSnapshot","abortSnapshot","createKey","ask"])await assert.rejects(()=>service.mutate(bob,{tenantId:"tenant-a",action,snapshotId:"s1",question:"苹果"}),e=>e.status===404);
  const answer=await service.mutate(bob,{tenantId:"tenant-b",action:"ask",question:"苹果"});assert.equal(answer.evidence.length,0);
  assert.equal((await service.read(alice,"tenant-a","analysis")).analysis.posts,1);
});
test("unpublished, interrupted and aborted uploads preserve active snapshot",async t=>{
  const {service}=await setup(t);await create(service);await upload(service,[doc("old")]);await publish(service);
  await create(service,alice,"tenant-a","next",2,2);await upload(service,[doc("new")],"next");
  await assert.rejects(()=>publish(service,"next"),e=>e.status===409);
  let report=await service.read(alice,"tenant-a","report");assert.equal(report.snapshotId,"s1");assert.equal(report.evidence[0].postId,"old");
  await service.mutate(alice,{action:"abortSnapshot",tenantId:"tenant-a",snapshotId:"next"});
  report=await service.read(alice,"tenant-a","report");assert.equal(report.snapshotId,"s1");
});
test("retry is idempotent, changed payload is rejected, duplicate entity rolls back whole batch",async t=>{
  const {service,db}=await setup(t);await create(service,alice,"tenant-a","s1",2,2);
  await upload(service,[doc("one")]);assert.equal((await upload(service,[doc("one")])).replayed,true);
  await assert.rejects(()=>upload(service,[doc("changed")]),e=>e.status===409);
  await assert.rejects(()=>upload(service,[doc("one")],"s1",2),e=>e.status===409);
  assert.equal(db.sql.prepare("SELECT count(*) n FROM ent_batches").get().n,1);
  assert.equal(db.sql.prepare("SELECT received_posts FROM ent_snapshots WHERE tenant_id='tenant-a'").get().received_posts,1);
  await upload(service,[doc("two")],"s1",2);await publish(service);
  assert.equal((await publish(service)).replayed,true);
});
test("out-of-order batches are allowed but missing manifests and stale publishers cannot win",async t=>{
  const {service}=await setup(t);await create(service,alice,"tenant-a","first",2,2);await create(service,alice,"tenant-a","stale");
  await upload(service,[doc("two")],"first",2);await assert.rejects(()=>publish(service,"first"));
  await upload(service,[doc("one")],"first",1);await publish(service,"first");
  await upload(service,[doc("stale")],"stale");await assert.rejects(()=>publish(service,"stale"),e=>e.status===409);
  assert.equal((await service.read(alice,"tenant-a","analysis")).snapshotId,"first");
});
test("full snapshots require explicit comments and stable IDs",async t=>{
  const {service}=await setup(t);await create(service);
  await assert.rejects(()=>upload(service,[{post_id:"p",platform:"xhs",title:"missing"}]),/comments/);
  await assert.rejects(()=>upload(service,[{...doc("p"),comments:[{content:"no id"}]}]),/ID/);
  await upload(service,[{...doc("p"),comments:[]}]);await publish(service);
  assert.equal((await service.read(alice,"tenant-a","analysis")).analysis.rawComments,0);
});
test("email-bound invitations are single-use; viewer cannot mutate or grant roles",async t=>{
  const {service}=await setup(t);const invite=await service.mutate(alice,{action:"createInvite",tenantId:"tenant-a",email:viewer.email,role:"viewer"});
  await assert.rejects(()=>service.mutate(bob,{action:"acceptInvite",inviteToken:invite.inviteToken}),e=>e.status===403);
  await service.mutate(viewer,{action:"acceptInvite",inviteToken:invite.inviteToken});
  await assert.rejects(()=>service.mutate(viewer,{action:"acceptInvite",inviteToken:invite.inviteToken}),e=>e.status===403);
  await assert.rejects(()=>create(service,viewer),e=>e.status===403);
  await assert.rejects(()=>service.mutate(viewer,{action:"createInvite",tenantId:"tenant-a",email:bob.email}),e=>e.status===403);
  await service.mutate(alice,{action:"removeMember",tenantId:"tenant-a",userId:viewer.userId});
  await assert.rejects(()=>service.read(viewer,"tenant-a","analysis"),e=>e.status===404);
  await assert.rejects(()=>service.mutate(alice,{action:"removeMember",tenantId:"tenant-a",userId:alice.userId}));
});
test("machine keys are hashed, tenant scoped, read restricted and revocable",async t=>{
  const {service,db}=await setup(t);const {syncToken}=await service.mutate(alice,{action:"createKey",tenantId:"tenant-a",label:"app"});
  const row=db.sql.prepare("SELECT * FROM ent_keys").get();assert.notEqual(row.token_hash,syncToken);assert.equal(row.token_hash.length,64);
  const machine=await service.machineIdentity(syncToken);await create(service,machine);
  await assert.rejects(()=>service.read(machine,"tenant-a","report"),e=>e.status===403);
  await assert.rejects(()=>create(service,machine,"tenant-b"),e=>e.status===404);
  await assert.rejects(()=>service.mutate(machine,{action:"createOrganization",requestId:"evil",name:"evil"}),e=>e.status===403);
  await service.mutate(alice,{action:"revokeKey",tenantId:"tenant-a",keyId:row.token_hash});
  await assert.rejects(()=>service.machineIdentity(syncToken),e=>e.status===401);
});
test("composite foreign keys reject cross-tenant document linkage",async t=>{
  const {service,db}=await setup(t);await create(service);
  assert.throws(()=>db.sql.prepare("INSERT INTO ent_documents VALUES('tenant-b','s1','x','{}',0,NULL)").run(),/FOREIGN KEY/);
});
test("persistent request budget is shared across service instances",async t=>{
  const {service,db}=await setup(t);for(let i=0;i<180;i++)await service.limit(alice);
  await assert.rejects(()=>new EnterpriseService(db).limit(alice),e=>e.status===429);
  await service.limit(bob);
});

test("rollback is atomic and auditable; aborted drafts can be discarded, active data cannot",async t=>{
  const {service,db}=await setup(t);await create(service);await upload(service,[doc("old")]);await publish(service);
  await create(service,alice,"tenant-a","new");await upload(service,[doc("new")],"new");await publish(service,"new");
  await assert.rejects(()=>service.mutate(alice,{action:"rollbackSnapshot",tenantId:"tenant-a",snapshotId:"s1",expectedRevision:1}),e=>e.status===409);
  await service.mutate(alice,{action:"rollbackSnapshot",tenantId:"tenant-a",snapshotId:"s1",expectedRevision:2});
  assert.equal((await service.read(alice,"tenant-a","report")).evidence[0].postId,"old");
  await assert.rejects(()=>service.mutate(alice,{action:"discardDraft",tenantId:"tenant-a",snapshotId:"s1"}),e=>e.status===409);
  await create(service,alice,"tenant-a","abort");await upload(service,[doc("unused")],"abort");
  await service.mutate(alice,{action:"abortSnapshot",tenantId:"tenant-a",snapshotId:"abort"});
  await service.mutate(alice,{action:"discardDraft",tenantId:"tenant-a",snapshotId:"abort"});
  assert.equal(db.sql.prepare("SELECT count(*) n FROM ent_documents WHERE snapshot_id='abort'").get().n,0);
  assert.equal(db.sql.prepare("SELECT count(*) n FROM ent_audit WHERE action='discardDraft'").get().n,1);
});

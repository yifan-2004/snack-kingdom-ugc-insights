import { EnterpriseError, LIMITS, ENTERPRISE_PIPELINE, boundedText, positiveInt, sha256, secretToken,
  normalizeDocument, summarizeDocuments, evidenceForQuestion, requireRole,
  type Principal, type Role, type EnterpriseDocument } from "./domain";

type Input = Record<string, unknown>;
type Snapshot = { id: string; status: string; expected_posts: number; expected_batches: number; received_posts: number; received_batches: number; byte_count: number; base_revision: number; data_cutoff_at: string; created_at: string; published_at: string | null };

export class EnterpriseService {
  constructor(private db: D1Database) {}
  private stmt(query: string, ...values: unknown[]) { return this.db.prepare(query).bind(...values); }
  private guard(condition: string, ...values: unknown[]) {
    return this.stmt(`INSERT INTO ent_guard(id,valid) VALUES(1,CASE WHEN ${condition} THEN 1 ELSE 0 END)
      ON CONFLICT(id) DO UPDATE SET valid=excluded.valid`, ...values);
  }
  private membershipGuard(tenant: string, actor: Principal, roles = ["owner", "admin", "analyst"]) {
    const keyCondition=actor.machineTenant?" AND EXISTS(SELECT 1 FROM ent_keys WHERE token_hash=? AND tenant_id=? AND revoked_at IS NULL AND expires_at>?)":"";
    return this.guard(`EXISTS(SELECT 1 FROM ent_memberships WHERE tenant_id=? AND user_id=? AND role IN (${roles.map(()=>"?").join(",")}))${keyCondition}`,
      tenant, actor.userId, ...roles,...(actor.machineTenant?[actor.machineTokenHash,tenant,new Date().toISOString()]:[]));
  }
  private audit(tenant: string, actor: Principal, action: string, object: string) {
    return this.stmt("INSERT INTO ent_audit VALUES(?,?,?,?,?,?)", crypto.randomUUID(), tenant, actor.userId, action, object, new Date().toISOString());
  }
  private async atomic(statements: D1PreparedStatement[]) {
    try { await this.db.batch(statements); }
    catch { throw new EnterpriseError("数据状态已变化、权限已撤销或配额已满。请刷新后重试；未发布的数据不会影响当前版本。", 409); }
  }
  async machineIdentity(token: string): Promise<Principal> {
    if (token.length < 40 || token.length > 256) throw new EnterpriseError("凭证无效",401);
    const key = await this.stmt(`SELECT k.tenant_id,k.created_by,m.email FROM ent_keys k
      JOIN ent_memberships m ON m.tenant_id=k.tenant_id AND m.user_id=k.created_by
      WHERE k.token_hash=? AND k.revoked_at IS NULL AND k.expires_at>? AND m.role IN ('owner','admin','analyst')`,
      await sha256(token), new Date().toISOString()).first<{tenant_id:string;created_by:string;email:string}>();
    if (!key) throw new EnterpriseError("凭证无效或已失效",401);
    return { userId:key.created_by,email:key.email,machineTenant:key.tenant_id,machineTokenHash:await sha256(token) };
  }
  async limit(actor: Principal) {
    const window = Math.floor(Date.now()/60_000);
    const subject = `${actor.userId}:${actor.machineTenant ?? "browser"}`;
    const row = await this.stmt(`INSERT INTO ent_rate(subject,window,count) VALUES(?,?,1)
      ON CONFLICT(subject) DO UPDATE SET window=excluded.window,
      count=CASE WHEN ent_rate.window=excluded.window THEN ent_rate.count+1 ELSE 1 END RETURNING count`,subject,window).first<{count:number}>();
    if ((row?.count ?? 999)>180) throw new EnterpriseError("请求过于频繁，请一分钟后重试",429);
  }
  private async member(tenant: string, actor: Principal, write=false, admin=false) {
    if (actor.machineTenant && actor.machineTenant!==tenant) throw new EnterpriseError("企业工作区不存在或不可访问",404);
    const m = await this.stmt("SELECT role FROM ent_memberships WHERE tenant_id=? AND user_id=?",tenant,actor.userId).first<{role:Role}>();
    if (!m) throw new EnterpriseError("企业工作区不存在或不可访问",404);
    requireRole(m.role,write,admin); return m.role;
  }
  async list(actor: Principal) {
    if (actor.machineTenant) throw new EnterpriseError("同步凭证不能列出工作区",403);
    return (await this.stmt(`SELECT o.id,o.name,o.active_snapshot_id,o.revision,m.role FROM ent_organizations o
      JOIN ent_memberships m ON m.tenant_id=o.id WHERE m.user_id=? ORDER BY o.created_at`, actor.userId).all()).results;
  }
  private async currentDocs(tenant: string) {
    const org = await this.stmt("SELECT active_snapshot_id,revision FROM ent_organizations WHERE id=?",tenant).first<{active_snapshot_id:string|null;revision:number}>();
    // Pin this exact snapshot for every statistic, report and citation.
    if (!org?.active_snapshot_id) return {snapshotId:null,revision:org?.revision ?? 0,docs:[] as EnterpriseDocument[]};
    const rows = await this.stmt("SELECT payload FROM ent_documents WHERE tenant_id=? AND snapshot_id=? ORDER BY entity_key",tenant,org.active_snapshot_id).all<{payload:string}>();
    return {snapshotId:org.active_snapshot_id,revision:org.revision,docs:rows.results.map(r=>JSON.parse(r.payload) as EnterpriseDocument)};
  }
  async read(actor: Principal, tenant: string, view: string) {
    const role = await this.member(tenant,actor);
    if (actor.machineTenant && view!=="snapshots") throw new EnterpriseError("同步凭证仅允许同步操作",403);
    if (view==="snapshots") return {snapshots:(await this.stmt(`SELECT id,status,expected_posts,received_posts,expected_batches,received_batches,byte_count,data_cutoff_at,created_at,published_at
      FROM ent_snapshots WHERE tenant_id=? ORDER BY created_at DESC LIMIT 10`,tenant).all()).results};
    if (view==="members") {
      requireRole(role,false,true);
      return {members:(await this.stmt("SELECT user_id,email,role FROM ent_memberships WHERE tenant_id=? ORDER BY created_at",tenant).all()).results,
        keys:(await this.stmt("SELECT token_hash,label,expires_at,revoked_at FROM ent_keys WHERE tenant_id=? ORDER BY expires_at DESC LIMIT 20",tenant).all()).results};
    }
    if (view==="audit") {
      requireRole(role,false,true);
      return {events:(await this.stmt("SELECT actor_id,action,object_id,created_at FROM ent_audit WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",tenant).all()).results};
    }
    if (view!=="analysis" && view!=="report") throw new EnterpriseError("不支持的视图");
    const {snapshotId,revision,docs}=await this.currentDocs(tenant);
    const analysis=summarizeDocuments(docs);
    const evidence=docs.flatMap(p=>p.comments.filter(c=>c.valid).slice(0,2).map(c=>({postId:p.externalId,platform:p.platform,commentId:c.id,title:p.title,excerpt:c.raw.slice(0,600),sourceUrl:p.sourceUrl}))).slice(0,20);
    return {snapshotId,revision,analysis,evidence,mode:"deterministic",pipelineVersion:ENTERPRISE_PIPELINE};
  }
  async mutate(actor: Principal, input: Input) {
    const action=boundedText(input.action,"操作",40);
    if (actor.machineTenant && !["createSnapshot","uploadBatch","publishSnapshot","abortSnapshot"].includes(action))
      throw new EnterpriseError("同步凭证不允许管理成员或读取分析内容",403);
    if (action==="createOrganization") return this.createOrganization(actor,input);
    if (action==="acceptInvite") return this.acceptInvite(actor,input);
    const tenant=boundedText(input.tenantId,"企业ID",100);
    const admin=["createInvite","createKey","revokeKey","removeMember","rollbackSnapshot","discardDraft"].includes(action);
    await this.member(tenant,actor,action!=="ask",admin);
    if (action==="createSnapshot") return this.createSnapshot(tenant,actor,input);
    if (action==="uploadBatch") return this.uploadBatch(tenant,actor,input);
    if (action==="publishSnapshot") return this.publish(tenant,actor,input);
    if (action==="rollbackSnapshot") {
      const id=boundedText(input.snapshotId,"版本ID",100);
      const revision=positiveInt(input.expectedRevision,"当前版本号",1_000_000);
      await this.atomic([this.membershipGuard(tenant,actor,["owner","admin"]),
        this.guard("EXISTS(SELECT 1 FROM ent_organizations WHERE id=? AND revision=?) AND EXISTS(SELECT 1 FROM ent_snapshots WHERE tenant_id=? AND id=? AND status='archived')",tenant,revision,tenant,id),
        this.stmt("UPDATE ent_snapshots SET status='archived' WHERE tenant_id=? AND status='published'",tenant),
        this.stmt("UPDATE ent_snapshots SET status='published' WHERE tenant_id=? AND id=?",tenant,id),
        this.stmt("UPDATE ent_organizations SET active_snapshot_id=?,revision=revision+1 WHERE id=?",id,tenant),this.audit(tenant,actor,action,id)]);
      return {published:true,snapshotId:id};
    }
    if (action==="discardDraft") {
      const id=boundedText(input.snapshotId,"版本ID",100);
      await this.atomic([this.membershipGuard(tenant,actor,["owner","admin"]),
        this.guard("EXISTS(SELECT 1 FROM ent_snapshots WHERE tenant_id=? AND id=? AND status='aborted')",tenant,id),
        this.stmt("DELETE FROM ent_documents WHERE tenant_id=? AND snapshot_id=?",tenant,id),
        this.stmt("DELETE FROM ent_batches WHERE tenant_id=? AND snapshot_id=?",tenant,id),
        this.stmt("DELETE FROM ent_snapshots WHERE tenant_id=? AND id=? AND status='aborted'",tenant,id),this.audit(tenant,actor,action,id)]);
      return {discarded:true};
    }
    if (action==="abortSnapshot") {
      const id=boundedText(input.snapshotId,"版本ID",100);
      await this.atomic([this.membershipGuard(tenant,actor),
        this.guard("EXISTS(SELECT 1 FROM ent_snapshots WHERE tenant_id=? AND id=? AND status='uploading')",tenant,id),
        this.stmt("UPDATE ent_snapshots SET status='aborted' WHERE tenant_id=? AND id=?",tenant,id),this.audit(tenant,actor,action,id)]);
      return {aborted:true};
    }
    if (action==="createInvite") {
      const email=boundedText(input.email,"邮箱",254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new EnterpriseError("邮箱格式不正确");
      const role=input.role==="analyst"?"analyst":"viewer";
      const token=secretToken(); const expires=new Date(Date.now()+86400_000).toISOString();
      await this.atomic([this.membershipGuard(tenant,actor,["owner","admin"]),
        this.guard("(SELECT count(*) FROM ent_invites WHERE tenant_id=? AND used_by IS NULL AND expires_at>?)<50",tenant,new Date().toISOString()),
        this.stmt("INSERT INTO ent_invites VALUES(?,?,?,?,?,NULL)",await sha256(token),tenant,email,role,expires),this.audit(tenant,actor,action,email)]);
      return {inviteToken:token,expiresAt:expires};
    }
    if (action==="createKey") {
      const token=secretToken(), label=boundedText(input.label,"凭证名称",80);
      const expires=new Date(Date.now()+90*86400_000).toISOString();
      await this.atomic([this.membershipGuard(tenant,actor,["owner","admin"]),
        this.guard("(SELECT count(*) FROM ent_keys WHERE tenant_id=? AND revoked_at IS NULL AND expires_at>?)<5",tenant,new Date().toISOString()),
        this.stmt("INSERT INTO ent_keys VALUES(?,?,?,?,?,NULL)",await sha256(token),tenant,actor.userId,label,expires),this.audit(tenant,actor,action,label)]);
      return {syncToken:token,expiresAt:expires};
    }
    if (action==="revokeKey") {
      const id=boundedText(input.keyId,"凭证ID",100);
      await this.atomic([this.membershipGuard(tenant,actor,["owner","admin"]),this.stmt("UPDATE ent_keys SET revoked_at=? WHERE tenant_id=? AND token_hash=?",new Date().toISOString(),tenant,id),this.audit(tenant,actor,action,id)]);
      return {revoked:true};
    }
    if (action==="removeMember") {
      const id=boundedText(input.userId,"成员ID",200);
      await this.atomic([this.membershipGuard(tenant,actor,["owner","admin"]),
        this.guard("EXISTS(SELECT 1 FROM ent_memberships WHERE tenant_id=? AND user_id=? AND role NOT IN ('owner','admin'))",tenant,id),
        this.stmt("DELETE FROM ent_memberships WHERE tenant_id=? AND user_id=? AND role NOT IN ('owner','admin')",tenant,id),this.audit(tenant,actor,action,id)]);
      return {removed:true};
    }
    if (action==="ask") {
      const question=boundedText(input.question,"问题",1000);
      const {docs,snapshotId}=await this.currentDocs(tenant);
      const evidence=evidenceForQuestion(docs,question);
      return {snapshotId,mode:"lexical-evidence-no-llm",evidence,
        answer:evidence.length?"找到以下相关原文，请结合父帖核实。当前未接大模型，不自动推断这些证据以外的结论。":"当前发布版本中没有找到足够证据，无法可靠回答。",
        analysis:summarizeDocuments(docs)};
    }
    throw new EnterpriseError("不支持的操作");
  }
  private async createOrganization(actor:Principal,input:Input) {
    const id=boundedText(input.requestId,"请求ID",100), name=boundedText(input.name,"企业名称",100);
    const old=await this.stmt("SELECT id,name FROM ent_organizations WHERE id=? AND created_by=?",id,actor.userId).first();
    if(old) return old;
    const now=new Date().toISOString();
    await this.atomic([this.guard("(SELECT count(*) FROM ent_organizations WHERE created_by=?)<3 AND (SELECT count(*) FROM ent_organizations)<100",actor.userId),
      this.stmt("INSERT INTO ent_organizations(id,name,created_by,created_at) VALUES(?,?,?,?)",id,name,actor.userId,now),
      this.stmt("INSERT INTO ent_memberships VALUES(?,?,?,?,?)",id,actor.userId,actor.email,"owner",now),this.audit(id,actor,"createOrganization",id)]);
    return {id,name};
  }
  private async acceptInvite(actor:Principal,input:Input) {
    const hash=await sha256(boundedText(input.inviteToken,"邀请凭证",256)), now=new Date().toISOString();
    const invite=await this.stmt("SELECT tenant_id,role FROM ent_invites WHERE token_hash=? AND email=? AND used_by IS NULL AND expires_at>?",hash,actor.email.toLowerCase(),now).first<{tenant_id:string;role:string}>();
    if(!invite) throw new EnterpriseError("邀请无效、已使用、已过期，或登录邮箱不匹配",403);
    await this.atomic([this.guard("EXISTS(SELECT 1 FROM ent_invites WHERE token_hash=? AND used_by IS NULL AND expires_at>? AND email=?)",hash,now,actor.email.toLowerCase()),
      this.stmt("INSERT INTO ent_memberships VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,user_id) DO NOTHING",invite.tenant_id,actor.userId,actor.email,invite.role,now),
      this.stmt("UPDATE ent_invites SET used_by=? WHERE token_hash=?",actor.userId,hash),this.audit(invite.tenant_id,actor,"acceptInvite",actor.userId)]);
    return {tenantId:invite.tenant_id};
  }
  private async createSnapshot(tenant:string,actor:Principal,input:Input) {
    const id=boundedText(input.snapshotId,"版本ID",100);
    const posts=positiveInt(input.expectedPosts,"帖子数",LIMITS.posts),batches=positiveInt(input.expectedBatches,"批次数",LIMITS.batches);
    if(batches>posts || posts>batches*LIMITS.batchPosts) throw new EnterpriseError("批次数与每批最多2帖的约定不匹配");
    const cutoff=boundedText(input.dataCutoffAt,"数据截止时间",64);
    if(!Number.isFinite(Date.parse(cutoff)) || Date.parse(cutoff)>Date.now()+300_000) throw new EnterpriseError("数据截止时间无效");
    const old=await this.stmt("SELECT * FROM ent_snapshots WHERE tenant_id=? AND id=?",tenant,id).first<Snapshot>();
    if(old) {
      if(old.expected_posts!==posts || old.expected_batches!==batches || old.data_cutoff_at!==new Date(cutoff).toISOString()) throw new EnterpriseError("相同版本ID不能更改清单",409);
      return {snapshotId:id,status:old.status,replayed:true};
    }
    await this.atomic([this.membershipGuard(tenant,actor),
      this.guard("(SELECT count(*) FROM ent_snapshots WHERE tenant_id=?)<?",tenant,LIMITS.snapshots),
      this.stmt(`INSERT INTO ent_snapshots(tenant_id,id,expected_posts,expected_batches,base_revision,data_cutoff_at,created_by,created_at,pipeline_version)
        SELECT ?,?,?,?,revision,?,?,?,? FROM ent_organizations WHERE id=?`,tenant,id,posts,batches,new Date(cutoff).toISOString(),actor.userId,new Date().toISOString(),ENTERPRISE_PIPELINE,tenant),this.audit(tenant,actor,"createSnapshot",id)]);
    return {snapshotId:id,status:"uploading"};
  }
  private async uploadBatch(tenant:string,actor:Principal,input:Input) {
    const id=boundedText(input.snapshotId,"版本ID",100);
    const index=positiveInt(input.batchNumber,"批次序号",LIMITS.batches)-1;
    if(!Array.isArray(input.posts) || !input.posts.length || input.posts.length>LIMITS.batchPosts) throw new EnterpriseError("每批需要1至2篇帖子");
    const digest=await sha256(JSON.stringify(input.posts));
    const session=await this.stmt("SELECT * FROM ent_snapshots WHERE tenant_id=? AND id=?",tenant,id).first<Snapshot>();
    if(!session) throw new EnterpriseError("版本不存在",404);
    if(session.status==="aborted") throw new EnterpriseError("版本已终止",409);
    const old=await this.stmt("SELECT digest FROM ent_batches WHERE tenant_id=? AND snapshot_id=? AND batch_index=?",tenant,id,index).first<{digest:string}>();
    if(old) { if(old.digest!==digest) throw new EnterpriseError("同一批次不能替换为不同内容",409); return {accepted:input.posts.length,replayed:true}; }
    if(session.status!=="uploading" || index>=session.expected_batches) throw new EnterpriseError("版本状态或批次序号无效",409);
    const docs=input.posts.map(normalizeDocument);
    if(new Set(docs.map(d=>d.entityKey)).size!==docs.length) throw new EnterpriseError("本批帖子ID重复");
    const payloads=docs.map(d=>JSON.stringify(d));
    const bytes=payloads.reduce((s,p)=>s+new TextEncoder().encode(p).byteLength,0);
    await this.atomic([this.membershipGuard(tenant,actor),
      this.guard(`EXISTS(SELECT 1 FROM ent_snapshots WHERE tenant_id=? AND id=? AND status='uploading'
        AND received_posts+?<=expected_posts AND received_batches<expected_batches AND byte_count+?<=?)`,tenant,id,docs.length,bytes,LIMITS.bytes),
      this.stmt("INSERT INTO ent_batches VALUES(?,?,?,?)",tenant,id,index,digest),
      ...docs.map((d,i)=>this.stmt("INSERT INTO ent_documents VALUES(?,?,?,?,?,?)",tenant,id,d.entityKey,payloads[i],d.validComments,d.publishedAt)),
      this.stmt("UPDATE ent_snapshots SET received_posts=received_posts+?,received_batches=received_batches+1,byte_count=byte_count+? WHERE tenant_id=? AND id=?",docs.length,bytes,tenant,id)]);
    return {accepted:docs.length,replayed:false};
  }
  private async publish(tenant:string,actor:Principal,input:Input) {
    const id=boundedText(input.snapshotId,"版本ID",100);
    const current=await this.stmt("SELECT active_snapshot_id FROM ent_organizations WHERE id=?",tenant).first<{active_snapshot_id:string|null}>();
    if(current?.active_snapshot_id===id) return {published:true,snapshotId:id,replayed:true};
    await this.atomic([this.membershipGuard(tenant,actor),
      this.guard(`EXISTS(SELECT 1 FROM ent_snapshots s JOIN ent_organizations o ON o.id=s.tenant_id
        WHERE s.tenant_id=? AND s.id=? AND s.status='uploading' AND s.base_revision=o.revision
        AND s.received_posts=s.expected_posts AND s.received_batches=s.expected_batches
        AND (SELECT count(*) FROM ent_documents d WHERE d.tenant_id=s.tenant_id AND d.snapshot_id=s.id)=s.expected_posts
        AND (SELECT count(*) FROM ent_batches b WHERE b.tenant_id=s.tenant_id AND b.snapshot_id=s.id)=s.expected_batches)`,tenant,id),
      this.stmt("UPDATE ent_snapshots SET status='archived' WHERE tenant_id=? AND status='published'",tenant),
      this.stmt("UPDATE ent_snapshots SET status='published',published_at=? WHERE tenant_id=? AND id=?",new Date().toISOString(),tenant,id),
      this.stmt("UPDATE ent_organizations SET active_snapshot_id=?,revision=revision+1 WHERE id=?",id,tenant),this.audit(tenant,actor,"publishSnapshot",id)]);
    return {published:true,snapshotId:id};
  }
}

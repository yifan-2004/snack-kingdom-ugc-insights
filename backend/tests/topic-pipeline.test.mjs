import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadPipeline() {
  const source = await readFile(
    new URL("../lib/topic-pipeline.ts", import.meta.url),
    "utf8",
  );
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}#${Date.now()}`
  );
}

test("cleaning preserves raw evidence and emits auditable normalization metadata", async () => {
  const { cleanUgcContent } = await loadPipeline();
  const result = cleanUgcContent(
    "味道不错😍\u200b https://example.com #新品",
  );
  assert.equal(result.rawText.includes("https://example.com"), true);
  assert.match(result.normalizedText, /\[链接\]/);
  assert.match(result.normalizedText, /\[喜爱\]/);
  assert.deepEqual(result.hashtags, ["新品"]);
  assert.equal(result.isValid, true);
  assert.equal(result.cleaningVersion, "clean-v5");
});

test("negation, short opinions and candidate aliases do not lose evidence", async () => {
  const {cleanUgcContent:clean,extractAspects:extract}=await loadPipeline();
  for(const text of ["不好吃","不推荐购买","太甜了"])
    assert.equal(extract(clean(text))[0].sentiment,"negative",text);
  assert.equal(extract(clean("不是不好吃"))[0].sentiment,"positive");
  assert.equal(extract(clean("好吃吗？"))[0].sentiment,"neutral");
  assert.equal(clean("差").isValid,true);
  assert.ok(clean("差").flags.includes("context_required"));
  assert.equal(clean("😍").isValid,true);
  assert.equal(extract(clean("停车太难了"))[0].normalizedText,extract(clean("停车位不好找"))[0].normalizedText);
  const mixed=extract(clean("口味很好，但口味也太甜了"));
  assert.ok(mixed.some(a=>a.confidence<700));
});

test("cleaning rejects low-information and short commercial noise", async () => {
  const { cleanUgcContent } = await loadPipeline();
  assert.equal(cleanUgcContent("哈哈").isValid, false);
  const commercial = cleanUgcContent("加微信购买");
  assert.equal(commercial.isCommercial, true);
  assert.equal(commercial.isValid, false);
});

test("one mixed comment becomes multiple topic-level sentiment aspects", async () => {
  const { cleanUgcContent, extractAspects } = await loadPipeline();
  const aspects = extractAspects(
    cleanUgcContent("味道很好但价格太贵，不会再买"),
  );
  const byTopic = new Map(aspects.map((aspect) => [aspect.topicId, aspect]));
  assert.equal(byTopic.get("product_taste")?.sentiment, "positive");
  assert.equal(byTopic.get("product_price")?.sentiment, "negative");
  assert.equal(byTopic.get("repurchase_intention")?.sentiment, "negative");
  assert.equal(byTopic.get("product_taste")?.evidenceText, "味道很好");
});

test("unknown but meaningful feedback enters the governed candidate pool", async () => {
  const { cleanUgcContent, extractAspects } = await loadPipeline();
  const [candidate] = extractAspects(
    cleanUgcContent("停车位一直都很难找到"),
  );
  assert.equal(candidate.topicId, null);
  assert.equal(candidate.assignmentStatus, "candidate");
  assert.ok(candidate.normalizedText.length >= 4);
});

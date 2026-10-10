import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['lib/manual-review-import.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {parseManualReview}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const row={id:'c1',postId:1,postTitle:'测试',platform:'xhs',content:'太贵了',predicted:'neutral',gold:'negative',representedCount:1};
test('manual import preserves individual evidence, not claimed scores',()=>{
 const parsed=parseManualReview(JSON.stringify({evaluation:'v1',total:2,macroF1:1,labels:[row]}));
 assert.equal(parsed.total,2);assert.equal(parsed.items[0].gold,'negative');assert.equal(parsed.items[0].predicted,'neutral');assert.equal(parsed.macroF1,undefined);
});
test('manual import rejects duplicates, illegal labels and invalid totals',()=>{
 for(const data of [{total:2,labels:[row,row]},{total:1,labels:[{...row,gold:'unknown'}]},{total:0,labels:[row]}])
  assert.throws(()=>parseManualReview(JSON.stringify({evaluation:'v1',...data})));
});

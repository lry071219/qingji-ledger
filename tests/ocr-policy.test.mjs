import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareOcrImage,adaptiveOcrImage} from '../dist/ocr-image.js';
import {normalizeOcrText,spatialText,selectOcrCandidate} from '../dist/ocr-pipeline.js';
import {parseBillText} from '../dist/ledger.js';
test('normalizes font typography without guessing ambiguous digits',()=>{
  assert.equal(normalizeOcrText('瑞 幸 咖 啡 －１４． ９０'),'瑞幸咖啡 -14.90');
  assert.equal(normalizeOcrText('¥ O.9O'),'¥ O.9O');
});
test('spatial reconstruction joins same-row merchant and amount but keeps following date separate',()=>{
  const line=(text,x0,y0,x1,y1)=>({text,bbox:{x0,y0,x1,y1}});
  const data={blocks:[{paragraphs:[{lines:[line('瑞幸咖啡',20,100,120,120),line('2026年10月31日',20,135,200,150)]}]},{paragraphs:[{lines:[line('-14.90',400,101,470,121)]}]}]};
  assert.equal(spatialText(data),'瑞幸咖啡 -14.90\n2026年10月31日');
});
test('structured receipt is preferred over high-confidence unrelated UI text',()=>{
  const selected=selectOcrCandidate([{text:'返回 设置 更多 123456',confidence:99},{text:'微信\n2026年10月31日\n瑞幸咖啡 -14.90',confidence:72}],{reference:'2026-11-01'});
  assert.equal(selected.parsed.rows.length,1);assert.equal(selected.parsed.rows[0].amount,1490);
});
test('financial disagreements require review and are not merged into duplicate records',()=>{
  const selected=selectOcrCandidate([{text:'微信\n2026年10月31日\n瑞幸咖啡 -14.90',confidence:88},{text:'微信\n2026年10月31日\n瑞幸咖啡 -74.90',confidence:86}],{reference:'2026-11-01'});
  assert.equal(selected.reviewRequired,true);assert.equal(selected.parsed.rows.length,1);assert.match(selected.warnings.join(''),/分歧/);
});
test('enhancement cannot silently replace an already clear amount with an extra digit',()=>{
  const selected=selectOcrCandidate([{text:'支付宝\n2026年10月30日\n工资 +8500.00',confidence:87,reference:true},{text:'支付宝\n2026年10月30日\n工资 +18500.00',confidence:94}],{reference:'2026-11-01'});
  assert.equal(selected.parsed.rows[0].amount,850000);assert.equal(selected.reviewRequired,true);
});
test('dotted date headers cannot create phantom money rows',()=>{
  const result=parseBillText('支付宝\n2026.10.31\n瑞幸咖啡 -14.90',{reference:'2026-11-01'});
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].amount,1490);assert.equal(result.rows[0].date,'2026-10-31');
});
test('dark low-contrast pixels become dark ink on light background without mutating the source',()=>{
  const data=new Uint8ClampedArray(40*40*4);
  for(let i=0;i<1600;i++){const value=i%40>=14&&i%40<20&&Math.floor(i/40)>=12&&Math.floor(i/40)<27?205:25;data.set([value,value,value,255],i*4);}
  const before=data.slice(),processed=prepareOcrImage({data,width:40,height:40});
  assert.equal(processed.analysis.inverted,true);assert.equal(processed.gray[0],255);assert.ok(Math.min(...processed.gray)<20);assert.deepEqual(data,before);
  const binary=adaptiveOcrImage(processed);assert.ok(binary.gray.every(value=>value===0||value===255));assert.ok(binary.gray.some(value=>value===0));
});
test('invalid and oversized images fail before allocating pixel buffers',()=>{
  assert.throws(()=>prepareOcrImage({data:[],width:10000,height:10000}),/尺寸/);
  assert.throws(()=>prepareOcrImage({data:[0,0],width:20,height:20}),/尺寸/);
});

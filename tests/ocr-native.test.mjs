import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planOcrTiles,mergeNativeTiles,selectNativeResult,receiveNativeOcr} from '../dist/ocr-native.js';
import {recognizeImages} from '../dist/ocr.js';
import {parseBillText} from '../dist/ledger.js';

test('long screenshot tiling preserves overlap and bounded native bitmap sizes',()=>{
  for(const enhanced of [false,true]){
    const tiles=planOcrTiles(1440,18000,{enhanced});assert.ok(tiles.length>5);
    assert.equal(tiles[0].y,0);assert.equal(tiles.at(-1).y+tiles.at(-1).height,18000);
    tiles.forEach((t,i)=>{assert.ok(t.outWidth*t.outHeight<=3200000);if(i)assert.ok(t.y<tiles[i-1].y+tiles[i-1].height);});
  }
  assert.throws(()=>planOcrTiles(10000,10000),/尺寸/);
});
test('tile overlap deduplicates one transaction without collapsing repeated merchants elsewhere',()=>{
  const data=(text,y)=>({blocks:[{paragraphs:[{lines:[{text,bbox:{x0:10,y0:y,x1:300,y1:y+25}}]}]}]});
  const tile={width:640,height:1000,outWidth:640,outHeight:1000,y:0};
  const text=mergeNativeTiles([{data:data('瑞幸咖啡 -14.90',900),tile},{data:data('瑞幸咖啡 -14.90',100),tile:{...tile,y:800}},{data:data('瑞幸咖啡 -14.90',300),tile:{...tile,y:800}}]);
  assert.equal(text.split('\n').length,2);
});
test('native enhancement cannot overwrite money or invent confidence',()=>{
  const result=selectNativeResult([{name:'原图',text:'微信\n2026年10月31日\n瑞幸咖啡 -14.90'},{name:'增强',text:'微信\n2026年10月31日\n瑞幸咖啡 -74.90'}],{reference:'2026-11-01'});
  assert.equal(result.parsed.rows[0].amount,1490);assert.equal(result.confidence,null);assert.equal(result.reviewRequired,true);assert.match(result.warnings.join(''),/分歧/);
});
test('native enhancement recovers additional complete rows while preserving original tuples',()=>{
  const original='支付宝\n2026年10月31日\n瑞幸咖啡 -14.90';
  const r=selectNativeResult([{text:original},{text:original+'\n地铁出行 -6.00'}],{reference:'2026-11-01'});
  assert.equal(r.parsed.rows.length,2);assert.equal(r.parsed.rows[1].amount,600);
});
test('ambiguous money suffixes are rejected instead of producing a plausible wrong amount',()=>{
  for(const value of ['¥ I4.90','+f8500.00','-O6.00']){
    const r=parseBillText(`微信\n2026年10月31日\n商户 ${value}`,{reference:'2026-11-01'});
    assert.equal(r.rows.length,0);assert.match(r.warnings.join(''),/金额包含/);
  }
  for(const value of ['Amazon -14.90','Amazon 14.90','ABC店 +14.90'])assert.equal(parseBillText(`微信\n2026年10月31日\n${value}`).rows[0].amount,1490);
});
test('APK routes to asynchronous native OCR, preserves rows and closes bitmap',async()=>{
  let calls=0,closed=false;
  const line=(text,y)=>({text,bbox:{x0:10,y0:y,x1:150,y1:y+20}});
  globalThis.QingjiNative={recognizeImage(id){calls++;queueMicrotask(()=>receiveNativeOcr(id,JSON.stringify({blocks:[{paragraphs:[{lines:[line('微信',10),line('2026年10月31日',40),line('瑞幸咖啡 -14.90',70)]}]}]})));return true;}};
  globalThis.createImageBitmap=async()=>({width:100,height:100,close(){closed=true;}});
  globalThis.document={createElement(){return {width:0,height:0,getContext(){return {fillRect(){},drawImage(){},getImageData(){return {data:new Uint8ClampedArray(100*100*4).fill(255)};},putImageData(){}};},toDataURL(){return 'data:image/png;base64,AAAA';}};}};
  try{const [r]=await recognizeImages([{}],()=>{},{reference:'2026-11-01'});assert.equal(calls,2);assert.equal(r.parsed.rows[0].amount,1490);assert.equal(r.engine,'mlkit-chinese-bundled');assert.equal(closed,true);}
  finally{delete globalThis.QingjiNative;delete globalThis.createImageBitmap;delete globalThis.document;delete globalThis.__qingjiOcrResult;}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isAndroidApp,nativeDeviceInfo,saveWithAndroid} from '../dist/native.js';
test('web uses browser downloads without calling native APIs',()=>{
  assert.equal(isAndroidApp(),false);assert.equal(nativeDeviceInfo(),null);assert.equal(saveWithAndroid('x','x.json','application/json'),false);
});
test('Android export preserves content, filename and MIME including Chinese and BOM',()=>{
  let args;
  globalThis.QingjiNative={saveFile(...value){args=value;return true;},getDeviceInfo(){return '{"supports64Bit":true,"abis":["arm64-v8a"]}';}};
  try{assert.equal(isAndroidApp(),true);assert.equal(nativeDeviceInfo().supports64Bit,true);const content='\uFEFF日期,商户\n2026-11-01,瑞幸咖啡';assert.equal(saveWithAndroid(content,'轻记.csv','text/csv;charset=utf-8'),true);assert.deepEqual(args,['轻记.csv','text/csv;charset=utf-8',content]);}finally{delete globalThis.QingjiNative;}
});
test('native rejection is reported and corrupt device info stays harmless',()=>{
  globalThis.QingjiNative={saveFile(){return false;},getDeviceInfo(){return 'invalid';}};
  try{assert.throws(()=>saveWithAndroid('x','x.json','application/json'),/文件过大/);assert.deepEqual(nativeDeviceInfo(),{});}finally{delete globalThis.QingjiNative;}
});

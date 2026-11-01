import {createWorker} from 'tesseract.js';
import bmp from 'bmp-js';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {parseBillText} from '../dist/ledger.js';
import {resizeGray} from '../dist/ocr-image.js';
import {recognizeWithOptimizations} from '../dist/ocr-pipeline.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixtureRoot=path.join(root,'tests/ocr-fixtures');
const allCases=JSON.parse(fs.readFileSync(path.join(fixtureRoot,'cases.json'),'utf8'));
const cases=process.argv[2]?allCases.filter(c=>c.id===process.argv[2]):allCases;
const cache=path.join(root,'tests/ocr-cache');fs.mkdirSync(cache,{recursive:true});
function readImage(file){const decoded=bmp.decode(fs.readFileSync(file)),data=new Uint8ClampedArray(decoded.width*decoded.height*4);for(let i=0;i<data.length;i+=4)data.set([decoded.data[i+3],decoded.data[i+2],decoded.data[i+1],255],i);return {data,width:decoded.width,height:decoded.height};}
function toBmp({gray,width,height}){const data=Buffer.alloc(width*height*4);for(let i=0;i<gray.length;i++){data[i*4+1]=gray[i];data[i*4+2]=gray[i];data[i*4+3]=gray[i];}return bmp.encode({data,width,height}).data;}
function baselineImage({data,width,height}){const gray=new Uint8Array(width*height);for(let i=0;i<gray.length;i++)gray[i]=Math.round(.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2]);const scale=Math.min(2,Math.max(1,1400/width),Math.sqrt(12000000/(width*height)));const w=Math.round(width*scale),h=Math.round(height*scale);return toBmp({gray:resizeGray(gray,width,height,w,h),width:w,height:h});}
function metrics(actual,expected){const used=new Set();let critical=0,merchant=0;for(const e of expected){const index=actual.findIndex((r,i)=>!used.has(i)&&r.amount===e.amount&&r.date===e.date&&r.type===e.type);if(index>=0){used.add(index);critical++;if(actual[index].merchant===e.merchant)merchant++;}}return {critical,merchant,expected:expected.length,detected:actual.length};}
const worker=await createWorker('chi_sim',1,{langPath:path.join(root,'dist/vendor/lang'),cachePath:cache});
const results=[];
try{
  for(const item of cases){
    const image=readImage(path.join(fixtureRoot,item.file));
    await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6',user_defined_dpi:'0'});
    const before=await worker.recognize(baselineImage(image));
    const baselineRows=parseBillText(before.data.text,{reference:item.reference}).rows;
    const after=await recognizeWithOptimizations(image,worker,processed=>({image:toBmp(processed)}),{profile:'enhanced',parseOptions:{reference:item.reference}});
    const row={id:item.id,font:item.font,size:item.fontSizePx,baseline:metrics(baselineRows,item.expected),optimized:metrics(after.parsed.rows,item.expected),beforeText:before.data.text,afterText:after.text,beforeConfidence:before.data.confidence,afterConfidence:after.confidence,reviewRequired:after.reviewRequired,warnings:after.warnings,attempts:after.attempts,treatments:after.treatments,candidates:after.alternatives};
    results.push(row);console.log(`${item.id}: critical ${row.baseline.critical}/${item.expected.length} -> ${row.optimized.critical}/${item.expected.length}; merchant ${row.baseline.merchant} -> ${row.optimized.merchant}; review=${row.reviewRequired}`);
    if(process.argv[2])console.log(JSON.stringify(row,null,2));
    fs.writeFileSync(path.join(fixtureRoot,'benchmark-progress.json'),JSON.stringify(results,null,2));
  }
}finally{await worker.terminate();}
const sum=key=>results.reduce((a,r)=>({critical:a.critical+r[key].critical,merchant:a.merchant+r[key].merchant,expected:a.expected+r[key].expected,detected:a.detected+r[key].detected}),{critical:0,merchant:0,expected:0,detected:0});
const report={generatedAt:new Date().toISOString(),syntheticOnly:true,baselineDescription:'Tesseract.js 7 Chinese model, old resize-at-most-2x + PSM 6 strategy reproduced with shared bilinear resampling in Node; not a physical device benchmark.',baseline:sum('baseline'),optimized:sum('optimized'),results};
fs.writeFileSync(path.join(fixtureRoot,'benchmark.json'),JSON.stringify(report,null,2));
console.log('TOTAL',JSON.stringify({baseline:report.baseline,optimized:report.optimized}));
assert.ok(report.optimized.critical>=report.baseline.critical,'Critical-field extraction regressed');
assert.ok(report.optimized.merchant>=report.baseline.merchant,'Merchant extraction regressed');
for(const id of ['yahei-regular','mixed-size-detail']){const r=results.find(r=>r.id===id);if(r)assert.equal(r.optimized.critical,r.optimized.expected,`Clear reference case failed: ${id}`);}

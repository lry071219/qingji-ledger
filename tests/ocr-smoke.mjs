import {createWorker} from 'tesseract.js';
import {parseBillText} from '../dist/ledger.js';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cache=path.join(root,'tests','ocr-cache');fs.mkdirSync(cache,{recursive:true});
const worker=await createWorker('chi_sim',1,{langPath:path.join(root,'dist/vendor/lang'),cachePath:cache});
try{
  await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
  for(const source of ['wechat','alipay']){
    const {data}=await worker.recognize(path.join(root,`tests/${source}-synthetic.png`));
    console.log(source,'confidence:',data.confidence,'\n'+data.text);
    const result=parseBillText(data.text,{reference:'2026-11-01'});
    console.log('parsed:',JSON.stringify(result.rows.map(({merchant,date,amount,type,category})=>({merchant,date,amount,type,category}))));
    assert.equal(result.source,source);
    if(source==='wechat'){assert.equal(result.rows.length,1);assert.equal(result.rows[0].amount,1490);assert.equal(result.rows[0].date,'2026-10-31');assert.equal(result.rows[0].category,'food');}
    else{assert.equal(result.rows.length,3);assert.deepEqual(result.rows.map(r=>r.amount),[8630,600,850000]);assert.equal(result.rows[2].type,'income');}
  }
  console.log('PASS: synthetic WeChat detail and Alipay list OCR → parser.');
}finally{await worker.terminate();}

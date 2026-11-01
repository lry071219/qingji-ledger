import {parseBillText} from './ledger.js';
import {prepareOcrImage,adaptiveOcrImage} from './ocr-image.js';

export function normalizeOcrText(text) {
  // Normalize typography only. Never turn letters (O/I/l) into guessed money digits.
  return String(text||'').normalize('NFKC').replace(/[−–—﹣]/g,'-').replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g,'$1')
    .replace(/(\d)[ \t]*[.．][ \t]*(\d{2})(?!\d)/g,'$1.$2').replace(/[ \t]+\n/g,'\n').trim();
}
export function spatialText(data) {
  const lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[])).filter(l=>l.text?.trim()&&l.bbox);
  if(!lines.length)return normalizeOcrText(data.text);
  lines.sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
  const rows=[];
  for(const line of lines){
    const box=line.bbox,height=Math.max(1,box.y1-box.y0),center=(box.y0+box.y1)/2;
    const row=rows.find(r=>Math.min(r.y1,box.y1)-Math.max(r.y0,box.y0)>=Math.min(r.height,height)*.45&&Math.abs(r.center-center)<=Math.max(r.height,height)*.45);
    if(row){row.lines.push(line);row.y0=Math.min(row.y0,box.y0);row.y1=Math.max(row.y1,box.y1);}
    else rows.push({lines:[line],y0:box.y0,y1:box.y1,height,center});
  }
  return normalizeOcrText(rows.sort((a,b)=>a.y0-b.y0).map(r=>r.lines.sort((a,b)=>a.bbox.x0-b.bbox.x0).map(l=>l.text.trim()).join(' ')).join('\n'));
}
export function assessOcrCandidate(candidate,parseOptions={}) {
  const text=normalizeOcrText(candidate.text),parsed=parseBillText(text,parseOptions),confidence=Number(candidate.confidence)||0;
  let score=Math.min(100,confidence)*.2+(parsed.source==='unknown'?0:8);
  for(const r of parsed.rows)score+=24+(r.dateInferred?0:12)+(r.merchant==='待核对商户'?-12:8)-(r.needsReview?5:0);
  if(!parsed.rows.length)score-=40;
  if(/[¥+\-]\s*[OIl]+[.．]\s*[\dOIl]+|[¥+\-]\s*\d+[.．]\s*[OIl]/.test(text))score-=12;
  return {...candidate,text,confidence,parsed,score};
}
const financialSignature = candidate => candidate.parsed.rows.map(r=>`${r.amount}|${r.date}|${r.type}`).sort().join('\n');
export function selectOcrCandidate(candidates,parseOptions={}) {
  const ranked=candidates.map(c=>assessOcrCandidate(c,parseOptions)).sort((a,b)=>b.score-a.score||b.confidence-a.confidence);
  if(!ranked.length)throw Error('没有可用的识别结果');
  const stableReference=ranked.find(c=>c.reference&&c.parsed.source!=='unknown'&&c.parsed.rows.length&&(
    (c.confidence>=65&&c.parsed.rows.every(r=>!r.needsReview))||
    (c.confidence>=80&&c.parsed.rows.filter(r=>!r.needsReview).length/c.parsed.rows.length>=.6)
  ));
  // Enhancing a clear glyph can introduce strokes (8500 -> 18500). Preserve an
  // already complete reference result; require human review for disagreements.
  const best=stableReference||ranked[0],signature=financialSignature(best);
  const conflict=ranked.filter(c=>c!==best).some(c=>c.parsed.rows.length&&c.confidence>=55&&Math.abs(best.score-c.score)<=Math.max(30,best.parsed.rows.length*16)&&financialSignature(c)!==signature);
  const warnings=[];
  if(conflict)warnings.push('不同识别方案对账单数量、金额、日期或收支方向存在分歧，请逐笔核对后入账。');
  if(best.confidence<65)warnings.push('主题字体或图片清晰度导致识别可信度偏低，请核对原图，尤其是小数点和正负号。');
  if(/[¥+\-]\s*[OIl]+[.．]\s*[\dOIl]+|[¥+\-]\s*\d+[.．]\s*[OIl]/.test(best.text))warnings.push('金额附近存在相似字母和数字，未自动猜测或替换，请对照原图修正。');
  return {...best,attempts:candidates.length,reviewRequired:conflict||best.confidence<65,warnings};
}
export async function recognizeWithOptimizations(image,worker,adaptImage,{profile='auto',parseOptions={},onProgress=()=>{}}={}) {
  const prepared=prepareOcrImage(image),candidates=[],processingWarnings=[];
  const passes=[{name:'原始笔画识别',mode:'6',reference:true},{name:'清晰化识别',mode:'6'},{name:'混合字号与分栏识别',mode:'11'},{name:'笔画与对比度增强',mode:'6',binary:true}];
  for(let i=0;i<passes.length;i++){
    const pass=passes[i];onProgress({pass:i+1,message:`${pass.name}（${i+1}/${passes.length}）`});
    await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:pass.mode,user_defined_dpi:pass.reference?'0':'300'});
    const adapted=adaptImage(pass.reference?prepared.reference:pass.binary?adaptiveOcrImage(prepared):prepared);
    try{
      const {data}=await worker.recognize(adapted.image,{rotateAuto:!pass.reference},{text:true,blocks:true});
      candidates.push({text:pass.reference?normalizeOcrText(data.text):spatialText(data),confidence:data.confidence,method:pass.name,reference:!!pass.reference});
    }catch(error){
      if(!candidates.length)throw error;
      processingWarnings.push('部分字体增强步骤未完成，已保留成功识别的结果，请对照原图核对。');
      break;
    }finally{adapted.dispose?.();}
    if(i===0&&profile!=='enhanced'){
      const assessment=assessOcrCandidate(candidates[0],parseOptions);
      if(assessment.confidence>=85&&assessment.parsed.rows.length&&assessment.parsed.source!=='unknown'&&assessment.parsed.rows.every(r=>!r.needsReview))break;
    }
  }
  const result=selectOcrCandidate(candidates,parseOptions);
  if(processingWarnings.length){result.warnings.push(...processingWarnings);result.reviewRequired=true;}
  if(prepared.analysis.limited)result.warnings.push('截图较长或尺寸较大，为控制手机内存进行了缩放。建议拆成多张清晰截图后识别。');
  return {...result,treatments:prepared.analysis.treatments,alternatives:candidates};
}

import {normalizeOcrText,spatialText,assessOcrCandidate} from './ocr-pipeline.js';

const pending=new Map();let sequence=0;
export const hasNativeOcr=()=>typeof globalThis.QingjiNative?.recognizeImage==='function';
export function receiveNativeOcr(id,payload){
  const request=pending.get(id);if(!request)return;
  clearTimeout(request.timer);pending.delete(id);
  try{const data=JSON.parse(payload);if(data.error)throw Error(data.error);request.resolve(data);}catch(error){request.reject(error);}
}
function recognizeTile(base64){
  globalThis.__qingjiOcrResult=receiveNativeOcr;
  return new Promise((resolve,reject)=>{
    const id=`ocr${++sequence}`,timer=setTimeout(()=>{pending.delete(id);reject(Error('本地识别超时，请将长截图分开导入'));},60000);
    pending.set(id,{resolve,reject,timer});
    try{if(!globalThis.QingjiNative.recognizeImage(id,base64))throw Error('本地识别忙碌或尚未同意隐私说明，请稍后重试');}
    catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
}
export function planOcrTiles(width,height,{enhanced=false}={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>40000000)throw Error('图片尺寸过大，请将长截图分成几张后导入');
  const scale=Math.min(enhanced?1.5:1,2048/width),outWidth=Math.max(1,Math.round(width*scale));
  const tileHeight=Math.min(height,Math.floor(2800000/(outWidth*scale)),1800),overlap=Math.min(160,Math.floor(tileHeight/4)),tiles=[];
  for(let y=0;y<height;){
    const h=Math.min(tileHeight,height-y);tiles.push({x:0,y,width,height:h,scale,outWidth,outHeight:Math.max(1,Math.round(h*scale))});
    if(y+h>=height)break;y+=h-overlap;
  }
  return tiles;
}
export function mergeNativeTiles(tiles){
  const lines=[];
  for(const {data,tile} of tiles){
    for(const line of (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]))){
      if(!line.bbox||!line.text?.trim())continue;
      const b=line.bbox,sy=tile.outHeight/tile.height,sx=tile.outWidth/tile.width;
      const item={text:line.text,bbox:{x0:b.x0/sx,y0:b.y0/sy+tile.y,x1:b.x1/sx,y1:b.y1/sy+tile.y},edge:Math.min(b.y0,tile.outHeight-b.y1)/sy};
      const duplicate=lines.findIndex(other=>{
        const a=other.bbox,c=item.bbox,vertical=Math.min(a.y1,c.y1)-Math.max(a.y0,c.y0),horizontal=Math.min(a.x1,c.x1)-Math.max(a.x0,c.x0);
        return vertical>Math.min(a.y1-a.y0,c.y1-c.y0)*.6&&horizontal>Math.min(a.x1-a.x0,c.x1-c.x0)*.7;
      });
      if(duplicate<0)lines.push(item);else if(item.edge>lines[duplicate].edge)lines[duplicate]=item;
    }
  }
  return spatialText({blocks:[{paragraphs:[{lines}]}]});
}
const signature=r=>`${r.date}|${r.amount}|${r.type}`;
export function selectNativeResult(candidates,parseOptions={}){
  if(!candidates.length)throw Error('没有可用的本地识别结果');
  const assessed=candidates.map(c=>assessOcrCandidate({...c,confidence:0},parseOptions));
  const original=assessed[0],ranked=[...assessed].sort((a,b)=>b.score-a.score);
  // Keep original money/date/direction. Enhanced pixels may add missing rows only
  // when every original financial tuple is preserved, including duplicate counts.
  const contains=(a,b)=>{const counts=new Map();a.forEach(r=>counts.set(signature(r),(counts.get(signature(r))||0)+1));return b.every(r=>{const key=signature(r),n=counts.get(key)||0;if(!n)return false;counts.set(key,n-1);return true;});};
  const best=original.parsed.rows.length?ranked.find(c=>contains(c.parsed.rows,original.parsed.rows))||original:ranked[0];
  const fingerprints=c=>c.parsed.rows.map(signature).sort().join('\n');
  const conflict=assessed.some(c=>c.parsed.rows.length&&fingerprints(c)!==fingerprints(best));
  const warnings=['已使用内置中文模型离线识别。请对照原图核对商户、金额、收支和日期，再勾选入账。'];
  if(conflict)warnings.push('原图与增强识别的金额、日期或笔数存在分歧，已保留单一结果，未自动合并冲突账单。');
  return {...best,confidence:null,engine:'mlkit-chinese-bundled',method:best.name,attempts:candidates.length,reviewRequired:true,warnings};
}
function enhanceCanvas(ctx,width,height){
  const pixels=ctx.getImageData(0,0,width,height),histogram=new Uint32Array(256),gray=new Uint8Array(width*height);
  for(let i=0;i<gray.length;i++){const j=i*4,v=Math.round(.299*pixels.data[j]+.587*pixels.data[j+1]+.114*pixels.data[j+2]);gray[i]=v;histogram[v]++;}
  const percentile=p=>{let n=0;for(let i=0;i<256;i++){n+=histogram[i];if(n>=gray.length*p)return i;}return 255;};
  const inverted=percentile(.5)<118,low=percentile(.005),high=percentile(.995),range=Math.max(32,high-low);
  for(let i=0;i<gray.length;i++){let v=Math.max(0,Math.min(255,Math.round((gray[i]-low)*255/range)));if(inverted)v=255-v;const j=i*4;pixels.data[j]=pixels.data[j+1]=pixels.data[j+2]=v;pixels.data[j+3]=255;}
  ctx.putImageData(pixels,0,0);
}
export async function recognizeNativeImages(files,onProgress=()=>{},options={}){
  const results=[];
  for(let index=0;index<files.length;index++){
    const bitmap=await createImageBitmap(files[index]),candidates=[];
    try{
      for(const enhanced of [false,true]){
        const tiles=planOcrTiles(bitmap.width,bitmap.height,{enhanced:enhanced&&options.profile==='enhanced'}),recognized=[];
        try{
          for(let n=0;n<tiles.length;n++){
            const tile=tiles[n],canvas=document.createElement('canvas');canvas.width=tile.outWidth;canvas.height=tile.outHeight;
            try{
              const ctx=canvas.getContext('2d',{willReadFrequently:enhanced});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,tile.y,tile.width,tile.height,0,0,canvas.width,canvas.height);
              if(enhanced)enhanceCanvas(ctx,canvas.width,canvas.height);
              onProgress({index,message:`本地中文${enhanced?'增强':'原图'}识别 · 分块 ${n+1}/${tiles.length}`});
              const data=await recognizeTile(canvas.toDataURL('image/png').split(',')[1]);recognized.push({data,tile});
            }finally{canvas.width=canvas.height=0;}
          }
          candidates.push({text:normalizeOcrText(mergeNativeTiles(recognized)),name:enhanced?'中文模型·清晰增强':'中文模型·原始截图'});
        }catch(error){if(!candidates.length)throw error;break;}
      }
      const result=selectNativeResult(candidates,{reference:options.reference,source:options.source,rules:options.rules});
      if(candidates.length<2)result.warnings.push('增强识别未完成，当前仅显示原图结果，请仔细核对。');
      results.push(result);
    }finally{bitmap.close();}
  }
  return results;
}

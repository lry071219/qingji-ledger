import {recognizeWithOptimizations} from './ocr-pipeline.js';
let scriptPromise;
function loadEngine(){
  if(globalThis.Tesseract)return Promise.resolve();
  if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='./vendor/tesseract.min.js';
    const timer=setTimeout(()=>{script.remove();scriptPromise=null;reject(Error('本地识别引擎加载超时，请检查网络后重试'));},45000);
    script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);scriptPromise=null;script.remove();reject(Error('识别资源下载失败，请检查网络后重试'));};document.head.append(script);
  });
  return scriptPromise;
}
async function decodeImage(file){
  const bitmap=await createImageBitmap(file);
  if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('图片尺寸过大，请将长截图分成几张后导入');}
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);canvas.width=0;canvas.height=0;
  return pixels;
}
function toCanvas({gray,width,height}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(width,height);
  for(let i=0;i<gray.length;i++){pixels.data[i*4]=gray[i];pixels.data[i*4+1]=gray[i];pixels.data[i*4+2]=gray[i];pixels.data[i*4+3]=255;}
  ctx.putImageData(pixels,0,0);
  return {image:canvas,dispose:()=>{canvas.width=0;canvas.height=0;}};
}
export async function recognizeImages(files,onProgress=()=>{},options={}){
  onProgress({index:0,message:'加载中文识别引擎，首次使用可能需要一些时间…'});
  await loadEngine();let index=0,worker,phase='';
  try{
    worker=await Tesseract.createWorker('chi_sim',1,{
      workerPath:new URL('./vendor/worker.min.js',import.meta.url).href,
      corePath:new URL('./vendor/core/',import.meta.url).href,
      langPath:new URL('./vendor/lang/',import.meta.url).href,
      logger:m=>{
        const messages={'loading tesseract core':'准备识别核心','initializing tesseract':'初始化识别引擎','loading language traineddata':'加载中文模型','initializing api':'准备识别','recognizing text':'识别账单文字'};
        onProgress({index,message:`${m.status==='recognizing text'&&phase?phase:messages[m.status]||'准备中'} ${Math.round((m.progress||0)*100)}%`});
      }
    });
    const results=[];
    for(index=0;index<files.length;index++){
      const pixels=await decodeImage(files[index]);
      const result=await recognizeWithOptimizations(pixels,worker,toCanvas,{
        profile:options.profile,
        parseOptions:{reference:options.reference,source:options.source,rules:options.rules},
        onProgress:progress=>{phase=progress.message;onProgress({index,message:phase});}
      });
      results.push(result);
    }
    return results;
  }finally{if(worker)await worker.terminate();}
}

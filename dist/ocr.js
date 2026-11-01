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
async function preprocess(file){
  const bitmap=await createImageBitmap(file);
  if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('图片尺寸过大，请将长截图分成几张后导入');}
  const scale=Math.min(2,Math.max(1,1400/bitmap.width),Math.sqrt(12000000/(bitmap.width*bitmap.height)));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return canvas;
}
export async function recognizeImages(files,onProgress=()=>{}){
  onProgress({index:0,message:'加载中文识别引擎，首次使用可能需要一些时间…'});
  await loadEngine();let index=0,worker;
  try{
    worker=await Tesseract.createWorker('chi_sim',1,{
      workerPath:new URL('./vendor/worker.min.js',import.meta.url).href,
      corePath:new URL('./vendor/core/',import.meta.url).href,
      langPath:new URL('./vendor/lang/',import.meta.url).href,
      logger:m=>{
        const messages={'loading tesseract core':'准备识别核心','initializing tesseract':'初始化识别引擎','loading language traineddata':'下载中文 / 英文模型','initializing api':'准备识别','recognizing text':'识别账单文字'};
        onProgress({index,message:`${messages[m.status]||'准备中'} ${Math.round((m.progress||0)*100)}%`});
      }
    });
    await worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
    const results=[];
    for(index=0;index<files.length;index++){
      const canvas=await preprocess(files[index]);
      const {data}=await worker.recognize(canvas);results.push({text:data.text,confidence:data.confidence});canvas.width=0;canvas.height=0;
    }
    return results;
  }finally{if(worker)await worker.terminate();}
}

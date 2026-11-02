import {isAndroidApp} from './native.js';
export function wechatStatus(){
  if(isAndroidApp()&&typeof globalThis.QingjiNative.getWechatStatus==='function'){
    try{return JSON.parse(globalThis.QingjiNative.getWechatStatus());}catch{}
  }
  return {configured:false,message:'微信登录暂未开放，本地记账不受影响。'};
}
export async function beginWechatLogin(notify=()=>{}){
  const status=wechatStatus();
  if(!status.configured){notify('微信登录暂未开放。你可以直接使用本地账本，无需注册；此版本不会连接微信。');return false;}
  if(status.signedIn){globalThis.QingjiNative.logoutWechat();notify('已退出微信登录，本地账本保留。');return true;}
  if(!globalThis.QingjiNative.startWechatLogin()){notify('无法启动微信登录，请稍后重试。');return false;}
  notify('请阅读授权说明，并在微信中完成登录。');
  const started=Date.now(),timer=setInterval(()=>{
    const next=wechatStatus();
    if(next.signedIn||next.error||Date.now()-started>180000){clearInterval(timer);notify(next.signedIn?'微信登录成功，账单仍保存在此设备。':next.error||'登录等待已结束，可重新尝试。');}
  },1800);
  return true;
}

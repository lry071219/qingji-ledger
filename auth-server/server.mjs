import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as sqlite from 'node:sqlite';
import {AuthError,createAuthCore} from './auth-core.mjs';
const Database=sqlite.Database||sqlite.DatabaseSync;
const database=path.resolve(process.env.AUTH_DATABASE||'auth-server/data/auth.sqlite');
fs.mkdirSync(path.dirname(database),{recursive:true});
const core=createAuthCore(new Database(database),{appId:process.env.WECHAT_APP_ID,appSecret:process.env.WECHAT_APP_SECRET});
const limits=new Map();
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    // Loopback service is intended to sit behind an HTTPS reverse proxy. Do not trust forwarded IP headers here.
    const current=Date.now(),ip=req.socket.remoteAddress;
    for(const [key,item] of limits)if(item.until<=current)limits.delete(key);
    const bucket=limits.get(ip)||{count:0,until:current+60000};limits.set(ip,bucket);if(++bucket.count>60)throw new AuthError(429,'请求过于频繁');
    if(req.url==='/v1/session'&&req.method==='DELETE'){
      res.end(JSON.stringify(core.revoke(req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1])));return;
    }
    if(req.method!=='POST'||!['/v1/wechat/challenge','/v1/wechat/login'].includes(req.url))throw new AuthError(404,'接口不存在');
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new AuthError(415,'需要 JSON 请求');
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw new AuthError(413,'请求过大');}
    let body;try{body=JSON.parse(text||'{}');}catch{throw new AuthError(400,'JSON 格式无效');}
    const result=req.url.endsWith('/challenge')?core.challenge():await core.login(body);res.end(JSON.stringify(result));
  }catch(error){res.statusCode=error instanceof AuthError?error.status:502;res.end(JSON.stringify({error:error instanceof AuthError?error.message:'登录服务暂不可用'}));}
});
server.requestTimeout=25000;server.headersTimeout=10000;
server.listen(Number(process.env.AUTH_PORT)||8788,'127.0.0.1',()=>console.log('Auth backend listening on loopback; expose through your HTTPS reverse proxy.'));

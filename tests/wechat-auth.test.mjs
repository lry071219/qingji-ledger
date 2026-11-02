import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as sqlite from 'node:sqlite';
import {createAuthCore} from '../auth-server/auth-core.mjs';
import {wechatStatus,beginWechatLogin} from '../dist/wechat.js';
const Database=sqlite.Database||sqlite.DatabaseSync;
function fixture(){const db=new Database(':memory:');let now=1000,calls=0;const core=createAuthCore(db,{appId:'wx1234567890abcdef',appSecret:'server-only-test-secret',now:()=>now,fetchImpl:async url=>{calls++;return {ok:true,json:async()=>url.pathname.endsWith('/access_token')?{openid:'provider-identity',access_token:'provider-only-token'}:{openid:'provider-identity',nickname:'测试用户'}};}});return {db,core,advance:()=>{now+=300001;},calls:()=>calls};}
test('OAuth state is single use and provider tokens never reach the client',async()=>{
  const {db,core,calls}=fixture();try{const {state}=core.challenge(),result=await core.login({code:'authorization-code',state});assert.equal(calls(),2);assert.equal(result.user.nickname,'测试用户');assert.match(result.sessionToken,/^[A-Za-z0-9_-]{43}$/);assert.doesNotMatch(JSON.stringify(result),/provider-identity|provider-only-token|server-only-test-secret/);assert.notEqual(db.prepare('SELECT hash FROM sessions').get().hash,result.sessionToken);await assert.rejects(core.login({code:'authorization-code',state}),e=>e.status===401);assert.equal(calls(),2);core.revoke(result.sessionToken);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);}finally{db.close();}
});
test('expired or forged state cannot contact WeChat',async()=>{
  const f=fixture();try{const {state}=f.core.challenge();f.advance();await assert.rejects(f.core.login({code:'code',state}),e=>e.status===401);await assert.rejects(f.core.login({code:'code',state:'forged'}),e=>e.status===400);assert.equal(f.calls(),0);}finally{f.db.close();}
});
test('missing configuration stays disabled without invoking a native SDK',async()=>{
  assert.equal(wechatStatus().configured,false);let message;assert.equal(await beginWechatLogin(text=>message=text),false);assert.match(message,/暂未开放/);
});

import {randomBytes,randomUUID,createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const opaque=()=>randomBytes(32).toString('base64url');
export class AuthError extends Error {constructor(status,message){super(message);this.status=status;}}
export function createAuthCore(db,{appId,appSecret,fetchImpl=fetch,now=Date.now}={}){
  if(!/^wx[A-Za-z0-9]{16}$/.test(appId||'')||!appSecret)throw Error('Configure server-only WECHAT_APP_ID and WECHAT_APP_SECRET.');
  db.exec(`CREATE TABLE IF NOT EXISTS challenges(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,identity TEXT UNIQUE NOT NULL,nickname TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);`);
  const cleanup=()=>{db.prepare('DELETE FROM challenges WHERE expires<=?').run(now());db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());};
  async function provider(url){
    const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new AuthError(502,'微信服务暂不可用');
    const data=await response.json();if(data.errcode)throw new AuthError(401,'微信授权码无效或已过期');return data;
  }
  return {
    challenge(){cleanup();if(db.prepare('SELECT count(*) AS n FROM challenges').get().n>=10000)throw new AuthError(429,'请稍后重试');const state=opaque();db.prepare('INSERT INTO challenges VALUES (?,?)').run(hash(state),now()+300000);return {state,expiresIn:300};},
    async login({code,state}={}){
      if(typeof code!=='string'||!/^[A-Za-z0-9_-]{1,512}$/.test(code)||typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state))throw new AuthError(400,'授权参数无效');
      // Atomic consumption happens before the first await; concurrent/replayed callbacks fail.
      const challenge=db.prepare('DELETE FROM challenges WHERE hash=? AND expires>? RETURNING hash').get(hash(state),now());
      if(!challenge)throw new AuthError(401,'登录请求已过期，请重新授权');
      const tokenUrl=new URL('https://api.weixin.qq.com/sns/oauth2/access_token');
      tokenUrl.search=new URLSearchParams({appid:appId,secret:appSecret,code,grant_type:'authorization_code'});
      const token=await provider(tokenUrl);
      if(typeof token.openid!=='string'||!token.openid||typeof token.access_token!=='string')throw new AuthError(502,'微信响应无效');
      const infoUrl=new URL('https://api.weixin.qq.com/sns/userinfo');infoUrl.search=new URLSearchParams({access_token:token.access_token,openid:token.openid,lang:'zh_CN'});
      const profile=await provider(infoUrl);
      if(profile.openid!==token.openid)throw new AuthError(502,'微信用户信息不一致');
      const identity=hash(appId+':'+token.openid),nickname=String(profile.nickname||'微信用户').slice(0,100);
      let user=db.prepare('SELECT id FROM users WHERE identity=?').get(identity);
      if(!user){user={id:randomUUID()};db.prepare('INSERT INTO users VALUES (?,?,?)').run(user.id,identity,nickname);}else db.prepare('UPDATE users SET nickname=? WHERE id=?').run(nickname,user.id);
      cleanup();const sessionToken=opaque(),expiresIn=7*86400;
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(sessionToken),user.id,now()+expiresIn*1000);
      // WeChat access_token, refresh_token, openid and AppSecret never leave the server.
      return {sessionToken,expiresIn,user:{id:user.id,nickname}};
    },
    revoke(token){if(typeof token==='string')db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));return {ok:true};}
  };
}

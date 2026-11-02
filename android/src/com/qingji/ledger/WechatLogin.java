package com.qingji.ledger;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPI;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** SDK is never initialized in the unconfigured offline release. No AppSecret in client code. */
public final class WechatLogin {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final String KEY = "qingji-auth-session-v1";
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("wechat-auth",Context.MODE_PRIVATE); }
    public static boolean configured() { return BuildConfig.WECHAT_ENABLED; }
    public static String status(Context context) {
        try {
            SharedPreferences p=prefs(context); boolean signedIn=p.contains("session")&&p.getLong("sessionExpires",0)>System.currentTimeMillis();
            JSONObject result=new JSONObject().put("configured",configured()).put("signedIn",signedIn)
                .put("nickname",p.getString("nickname","微信用户")).put("error",p.getString("error",""));
            result.put("message",!configured()?"微信登录暂未开放，本地记账不受影响。":signedIn?"已登录："+p.getString("nickname","微信用户"):"可选微信登录，账单仍只保存在本机。");
            return result.toString();
        } catch(Exception ignored) { return "{\"configured\":false}"; }
    }
    public static boolean start(Activity activity) {
        if(!configured()) return false;
        SharedPreferences p=prefs(activity);
        if(p.getLong("expires",0)>System.currentTimeMillis())return false;
        p.edit().remove("error").apply();
        activity.runOnUiThread(()->new AlertDialog.Builder(activity).setTitle("使用微信登录")
            .setMessage("将打开微信请求授权，并把授权码发送到登录服务换取账户登录状态。登录服务会处理微信用户标识及昵称；不会发送账单或截图。你可以取消并继续本地记账。")
            .setNegativeButton("取消",(dialog,which)->error(activity,"已取消微信登录"))
            .setPositiveButton("同意并继续",(dialog,which)->EXECUTOR.execute(()->{
                try {
                    IWXAPI api=WXAPIFactory.createWXAPI(activity.getApplicationContext(),BuildConfig.WECHAT_APP_ID,true);
                    if(!api.isWXAppInstalled())throw new Exception("请先安装微信");
                    JSONObject challenge=request("/v1/wechat/challenge",new JSONObject(),null,"POST");
                    String state=challenge.getString("state");
                    if(!state.matches("[A-Za-z0-9_-]{32,128}"))throw new Exception("登录服务响应无效");
                    p.edit().putString("state",state).putLong("expires",System.currentTimeMillis()+300000).apply();
                    api.registerApp(BuildConfig.WECHAT_APP_ID);
                    SendAuth.Req req=new SendAuth.Req();req.scope="snsapi_userinfo";req.state=state;
                    if(!api.sendReq(req))throw new Exception("无法打开微信授权，请检查应用审核与签名配置");
                } catch(Exception failure) { error(activity,"微信登录未启动，请检查微信安装与登录服务配置"); }
            })).show());
        return true;
    }
    public static void complete(Context context,int code,String authCode,String state) {
        SharedPreferences p=prefs(context);
        String expected=p.getString("state","");long expires=p.getLong("expires",0);
        // An exported callback cannot create a session without an active, unexpired state.
        if(expected.isEmpty()||expires<System.currentTimeMillis()||!expected.equals(state))return;
        p.edit().remove("state").remove("expires").apply();
        if(code!=0||authCode==null||authCode.isEmpty()){error(context,code==-2?"已取消微信授权":"微信未授予登录权限");return;}
        EXECUTOR.execute(()->{
            try {
                JSONObject body=new JSONObject().put("code",authCode).put("state",state);
                JSONObject session=request("/v1/wechat/login",body,null,"POST");
                String token=session.getString("sessionToken");
                if(!token.matches("[A-Za-z0-9_-]{32,128}"))throw new Exception("登录凭证无效");
                JSONObject user=session.getJSONObject("user");
                p.edit().putString("session",encrypt(token)).putString("nickname",user.optString("nickname","微信用户"))
                    .putLong("sessionExpires",System.currentTimeMillis()+session.getLong("expiresIn")*1000).remove("error").apply();
            } catch(Exception failure) { error(context,"微信登录验证失败，请稍后重试"); }
        });
    }
    public static void logout(Context context) {
        SharedPreferences p=prefs(context);String encrypted=p.getString("session",null);p.edit().clear().apply();
        if(encrypted!=null&&configured())EXECUTOR.execute(()->{try{request("/v1/session",null,decrypt(encrypted),"DELETE");}catch(Exception ignored){}});
    }
    private static void error(Context c,String text){prefs(c).edit().putString("error",text).remove("state").remove("expires").apply();}
    private static JSONObject request(String path,JSONObject body,String token,String method)throws Exception {
        URL url=new URL(BuildConfig.AUTH_BASE_URL+path);
        if(!"https".equals(url.getProtocol()))throw new Exception("HTTPS required");
        HttpURLConnection c=(HttpURLConnection)url.openConnection();
        c.setConnectTimeout(15000);c.setReadTimeout(20000);c.setInstanceFollowRedirects(false);c.setRequestMethod(method);
        c.setRequestProperty("Accept","application/json");
        if(token!=null)c.setRequestProperty("Authorization","Bearer "+token);
        try {
            if(body!=null){c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");try(java.io.OutputStream out=c.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            if(c.getResponseCode()!=200)throw new Exception("Login service unavailable");
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int count;while((count=in.read(buffer))!=-1){out.write(buffer,0,count);if(out.size()>65536)throw new Exception("Response too large");}
                return new JSONObject(out.toString("UTF-8"));
            }
        } finally {c.disconnect();}
    }
    private static SecretKey key()throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(KEY)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}
        return ((KeyStore.SecretKeyEntry)store.getEntry(KEY,null)).getSecretKey();
    }
    private static String encrypt(String value)throws Exception{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());byte[] encrypted=cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));return Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+"."+Base64.encodeToString(encrypted,Base64.NO_WRAP);}
    private static String decrypt(String value)throws Exception{String[] parts=value.split("\\.");Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);}
}

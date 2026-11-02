package com.qingji.ledger.wxapi;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import com.qingji.ledger.BuildConfig;
import com.qingji.ledger.WechatLogin;
import com.tencent.mm.opensdk.modelbase.BaseReq;
import com.tencent.mm.opensdk.modelbase.BaseResp;
import com.tencent.mm.opensdk.modelmsg.SendAuth;
import com.tencent.mm.opensdk.openapi.IWXAPIEventHandler;
import com.tencent.mm.opensdk.openapi.WXAPIFactory;

public final class WXEntryActivity extends Activity implements IWXAPIEventHandler {
    @Override public void onCreate(Bundle state){super.onCreate(state);handle(getIntent());}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);handle(intent);}
    private void handle(Intent intent){
        if(!WechatLogin.configured()){finish();return;}
        try{if(!WXAPIFactory.createWXAPI(this,BuildConfig.WECHAT_APP_ID,true).handleIntent(intent,this))finish();}
        catch(Exception ignored){finish();}
    }
    @Override public void onReq(BaseReq req){finish();}
    @Override public void onResp(BaseResp response){
        if(response instanceof SendAuth.Resp){SendAuth.Resp auth=(SendAuth.Resp)response;WechatLogin.complete(getApplicationContext(),auth.errCode,auth.code,auth.state);}
        finish();
    }
}

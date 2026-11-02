# 微信登录接入状态（1.4.0）

用户已选择「暂时没有，先搭好接入代码」。当前可下载的 APK 是离线候选版，微信登录未启用，不会初始化微信 SDK。网页的 Sites 所有者访问与微信账户是两件独立的事；本次不改变网站访问权限，也不提供账单云同步。

## 已实现

- Android 官方 OpenSDK `com.tencent.mm.opensdk:wechat-sdk-android:6.8.40`，用户主动同意后才注册并发起授权。
- `com.qingji.ledger.wxapi.WXEntryActivity` 回调；本机及服务器均验证一次性 state，state 有过期时间；回调不能直接创建登录身份。
- 客户端只把 code/state 交给 HTTPS 登录服务，拒绝 HTTP 和重定向；AppSecret 不进入 APK、网页或 JS。
- 自有会话令牌由 Android Keystore AES-GCM 加密存储，不通过 WebView 暴露。提供本地退出和服务端撤销接口。
- `auth-server/` 中的 Node 登录后端：挑战、微信 code 换 token、用户标识映射、哈希会话存储及退出撤销。没有账单、图片或备份接口。
- 尚未进行真实微信账号、开放平台审核配置或手机授权联调。单元测试使用模拟的微信响应，不能代表真实登录验收。

## 后续需要的资料

1. 微信开放平台审核通过的**移动应用** AppID，以及申请微信登录能力。不是小程序 AppID。
2. 填写 Android 包名 `com.qingji.ledger`，并核对微信要求的应用签名。当前发布证书 MD5（无冒号小写）为 `b90fab00bd9ddeec0d83c4389f17bf56`，SHA-256 为 `f5d56e72091ca1609170af94a2a3b8041169009bba031005c202f8dd2c558a82`。更换签名会影响授权及覆盖升级。
3. 开发者自己的 HTTPS 登录服务域名、隐私联系信息和经营主体。AppSecret 只配置在服务端环境变量或秘密管理系统中，不在聊天中提供。

## 配置和发布边界

`android/wechat.properties.example` 提供 AppID 和 HTTPS origin 两个公开配置项。原生 Gradle 工程读取 `wechat.properties`，两个字段都存在且合法时才启用登录与互联网权限；缺一个会拒绝构建。

当前 `android/build.ps1` **只允许发布无互联网权限的离线候选版**，不会复制微信配置，并会审计互联网权限。不要直接把开启了网络的包当作当前离线包发布。准备真实联网版时，需要把配置送入 ASCII 构建工程，更新隐私说明、ML Kit 诊断数据说明、网络权限审计和 release.json，再完成授权取消/失败/成功、会话过期、退出、账户注销及真机联调；届时应发布新的版本号。当前静态 Sites 下载站不能代替独立登录后端。

## 后端本地开发

使用 Node 24 LTS（含 node:sqlite）或兼容版本，持久化数据目录不要放入静态网站。配置 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、可选的 `AUTH_DATABASE` 与 `AUTH_PORT`，运行 `node auth-server/server.mjs`。缺少配置会立即退出。默认监听 `127.0.0.1:8788`，应置于开发者控制的 HTTPS 反向代理后；配置 TLS、数据库权限/备份及按真实客户端 IP 的入口限流。自带进程限流是补充，不能替代网关限流。当前代码是待部署接入实现，尚未做商业上线验收。

接口契约：

| 接口 | 请求 | 成功响应 |
| --- | --- | --- |
| POST /v1/wechat/challenge | JSON `{}` | `{state,expiresIn:300}` |
| POST /v1/wechat/login | JSON `{code,state}` | `{sessionToken,expiresIn,user:{id,nickname}}` |
| DELETE /v1/session | `Authorization: Bearer <sessionToken>` | `{ok:true}` |

微信 access_token、refresh_token、openid 和 AppSecret 不返回客户端。数据库保存内部账户、昵称、微信标识的哈希及会话令牌的哈希，不保存账单。后端与应用账户注销能力、对外隐私文件仍需在正式开放登录前完成；不会将本地账本自动绑定或上传。

参考：[微信 Android 接入指南](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/Access_Guide/Android.html)、[微信登录开发指南](https://developers.weixin.qq.com/doc/oplatform/Mobile_App/WeChat_Login/Development_Guide.html)、[腾讯 SDK 发布元数据](https://repo.maven.apache.org/maven2/com/tencent/mm/opensdk/wechat-sdk-android/maven-metadata.xml)。本环境未能读取前两页，实际开通要求以开放平台控制台及开发者当时可见的官方文档为准。

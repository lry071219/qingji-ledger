# 轻记 Android 发布候选版

目标设备：小米 17 Pro Max / 用户报告的 Android 17；当前没有实体手机连接，尚未做实机验收。

## 架构与兼容

应用宿主是 Java + Android 系统 WebView，OCR 使用 WebAssembly。APK 不含架构相关的 `.so` 动态库，属于通用架构，可在 ARM64（包括仅支持 64 位的设备）及兼容的 32 位 ARM / x86 系统上运行；不会强行安装 32 位 native 库。安装系统最低为 Android 7.0 / API 24，WebView 需支持 ES modules、`dialog`、WebAssembly（建议更新到当前可用版本）。

目标 SDK 为 Android 17 / API 37，使用官方 API 37 SDK 编译。包含 Android 13+ 返回手势回调、Android 15+ 安全区域与键盘 Insets、自适应布局，不限制屏幕旋转或窗口大小。没有专门适配小米背屏。

使用系统文件选择器读取用户主动选择的截图和备份，不请求整个相册访问权限；通过系统「创建文档」窗口保存 CSV / JSON，避免 WebView 不支持 blob 下载导致导出失败。应用所有核心资源内置，无需登录或联网下载 OCR 模型。网页版和 APK 账本独立，通过 JSON 备份迁移。

## 构建

在 Windows PowerShell 7+、Node.js 18+ 下，从项目根目录运行：

```powershell
./android/setup-tools.ps1
node android/collect-licenses.mjs
./android/build.ps1
```

工具由 Adoptium 和 Google 官方源下载，校验 JDK 的 SHA-256 与 Google 元数据中的 SHA-1，放在 `.android-local/tools/`，不更改系统 PATH 或全局 Java。构建采用 aapt2、javac、D8、zipalign 和 apksigner，无需 Gradle / Android Studio。优先使用 Build Tools 37；其下载不可用时，也可使用本机已校验的 Build Tools 36 配合 API 37 的 android.jar 编译本项目；实际工具记录在 release.json。官方工具和项目自有业务代码不一起对外分发。

输出 `dist/downloads/qingji-1.2.0-universal.apk`、SHA-256 文件及 `release.json`。构建必须通过签名验证、APK 对齐、包名 / SDK / 资源检查；发现任何 `lib/` 原生动态库则停止发布，重新审查 ABI。

正式签名使用 RSA 3072 位，构建请求 APK v1/v2/v3 签名，并验证 Android 7+ 使用的 v2/v3 签名。这里的“正式签名”表示开发者自签名发布密钥，与默认 Android debug 密钥不同，不代表已经过应用商店审核或主体认证。

## 更新签名必须保留

- 包名 `com.qingji.ledger`、签名证书在对外正式发布前确认；发布后更新应保持一致并递增 `versionCode`。
- `.android-local/signing/qingji-release.jks` 是签名私钥，禁止上传网站、Git、聊天或公开下载目录。
- `password.dpapi` 是由当前 Windows 用户保护的密码，仅在当前账户和可用的 DPAPI 环境中解密。仅复制此文件到新电脑不能保证恢复密码。
- 正式售卖或迁移电脑前，应通过安全渠道完成签名私钥和可移植密码备份及恢复演练；切勿重置或覆盖现有密钥，否则已安装用户将不能直接覆盖升级。

## 发布状态

用户选择先通过官网下载 APK，之后再上架应用商店。当前发布候选版的开发者／经营主体、客服邮箱仍待定，隐私页面明确展示这些待补信息，`release.json` 的 `publicationReady` 为 false。网站保持原有所有者私有访问权限。正式公开下载或提交商店前，需要补齐以下信息并进行实机验收：

1. 开发者主体、支持邮箱、最终应用名及包名；官网及隐私页对外访问方式。
2. 小米 17 Pro Max 上安装、首次启动、返回手势、旋转、键盘、截图批量识别、重启持久化、备份 / 恢复、覆盖升级和卸载前备份检查。
3. 以选定渠道的当前要求完成开发者账号、相关主体及备案资料、隐私 / 权限声明、商店素材和审核。不包含收费系统、广告或应用内购买。
4. 按自身商用分发方式完成开源许可证与品牌权属核对。OCR 的依赖许可、版权及来源随 APK 附带，见应用内「隐私说明与开源许可」。

不能将本构建结果描述为已上架、已完成实体设备验证或已具备全部商用手续。

# 轻记 Android 1.4.0 发布候选版

小米 17 Pro Max / Android 17 是目标设备，尚未完成实机验收。

本版 APK 为 ARM64，使用内置 Google ML Kit 中文识别 16.0.1，不需要 Google Play 服务下载模型。应用没有互联网权限；接受新版隐私说明并主动识别后才初始化 SDK。网页继续使用 Tesseract。包名、HTTPS 本地资源源站和签名密钥保持不变，可覆盖升级保留账本。

构建使用便携 JDK 21、Gradle 9.3.1、AGP 9.1.1、API 37.0 SDK 与 Build Tools 36.0.0。Windows 工具使用 ASCII 临时构建目录，缓存位于系统临时目录 qingji-native-build-6ae6eff2；源码与签名材料留在项目中。

构建顺序：先运行 android/setup-tools.ps1（已有工具可跳过），再运行 android/setup-gradle.ps1、android/build.ps1。正式签名沿用 .android-local/signing 中的密钥，密码由当前 Windows 用户 DPAPI 保护，不提交到 Git。备份密钥和恢复密码必须单独妥善处理，否则未来无法签发覆盖更新。

最低 Android 7.0，目标及编译 API 37。系统选择器只读取用户主动选择的文件；截图单张最多 15 MB、40MP，长图有重叠分块，识别结果必须逐笔勾选后导入。可导出 JSON/CSV，不支持账号同步。

待完成：真实账单截图与主题字体验收、实体手机安装/导入/升级回归、开发者经营主体和客服邮箱、正式发布所需事项。当前下载站保持所有者私有访问，尚不能当成公众商业下载站。

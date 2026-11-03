# 轻记 1.6.1

Android ARM64 APK 与离线网页版。底栏为账单、导入、统计，设置在右上角。统计支持周／月净收支日历、每日明细、支出分类、商户排行与月预算。界面采用黑白灰，用收支标签和正负号表示方向。账单筛选默认收起，支持多选删除和撤销上次删除。

显示大小在设置中调整，导入核对在手机上按卡片展示。安卓版内置中文 OCR，图片和账本留在本机。微信登录代码已准备但未启用，详见 WECHAT-INTEGRATION.md。

本地开发：npm run dev。验证：npm run check、npm test。

Android 构建：android/setup-tools.ps1、android/setup-gradle.ps1、android/build.ps1。构建和密钥说明见 android/README.md。包名和签名保持一致，支持覆盖升级；升级前建议导出 JSON 备份，勿先卸载。

发布地址：https://qingji-ledger-android.rosyivy2.chatgpt.site

下载地址：https://qingji-ledger-android.rosyivy2.chatgpt.site/install.html

网站保持所有者私有访问。开发者经营主体、客服邮箱及小米实体手机验收尚待完成，不能视为已经完成商业上线。

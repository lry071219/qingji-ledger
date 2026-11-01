# 轻记 · 把生活记清楚

适配安卓手机的本地记账应用，提供 Android APK 和可安装的网页版 PWA，桌面浏览器也可使用。

Android 1.2.0 发布候选版支持 ARM64（64 位），使用 API 37 SDK 编译并以 Android 17 为目标。开发者主体、客服邮箱仍待定，尚未在用户的小米 17 Pro Max 上实机验收，当前不应描述为已完成商用手续或商店审核。下载站保持所有者私有访问。

APK 下载和安装步骤：https://qingji-ledger-android.rosyivy2.chatgpt.site/install.html

APK 内置中文 OCR 模型，无需登录即可离线使用。网页和 APK 使用独立存储；迁移账本请先从网页版导出 JSON 备份，再在 APK 恢复。构建、签名与商用发布准备见 [android/README.md](android/README.md)。

## 使用

发布地址：https://qingji-ledger-android.rosyivy2.chatgpt.site

在安卓 Chrome 中打开地址，选择右上角菜单 → **安装应用 / 添加到主屏幕**。发布站点默认仅所有者可访问，需要登录相应的 ChatGPT 账号。数据分别保存在每个浏览器 / 设备中。

首次打开显示明确标注的示例账本。点击 **开始我的账本** 清除示例，创建空白账本。

- 手动新增、编辑、删除支出和收入；根据商户关键词自动分类，支持记住自定义商户分类。
- 微信 / 支付宝截图本地 OCR，支持 JPG、PNG、WEBP，单张 15 MB，批量最多 10 张。
- 支持交易详情与包含逐笔金额的账单列表；识别商户、金额、收支、完整日期或日期分组。
- 导入前逐笔核对和修改；缺失日期会使用参考日期并明确提醒；平台识别失败时可手动选择。
- 同日、同金额、同商户、同收支方向标记为疑似重复，默认取消勾选，可人工决定是否导入。
- 周账单按周一至周日汇总；月账单按自然月汇总；支持跨月、跨年切换、趋势和分类占比。
- 搜索及分类 / 支付方式 / 收支筛选；导出当前周期 CSV；完整 JSON 备份与合并恢复。
- 月预算；离线缓存应用与已使用的 OCR 资源。

## 截图识别

1.2.0 新增 **主题字体增强**：在截图导入中选择后，最多比较四种识别方案，并规范全角数字、小数点周围空格与减号；支持小字放大、深色背景转换、对比度处理和分栏文字重组。有分歧或低可信度的记录在预览中默认不勾选，可展开原图核对。原始清晰金额不会被增强结果静默覆盖，仍不保证所有艺术字、压缩截图都可读。测试结果及限制见 [OCR-VALIDATION.md](OCR-VALIDATION.md)。

Tesseract.js 7.0.0（WebAssembly）在浏览器设备端识别，图片不发送到服务器。引擎、worker、语言模型全部随站点自托管，不依赖第三方 CDN 在使用时提供资源。第一次识别会按设备能力下载一个适用的核心及中文模型，约 6 MB，建议使用 Wi-Fi。模型 / 核心在后续使用时可从浏览器缓存加载。

识别结果受文字大小、压缩、背景、截图格式影响，不保证所有微信 / 支付宝版本和长截图都能正确识别。导入前应核对金额、日期及收支方向。无完整年份的日期会使用参考年份并提醒；没有日期时采用参考日期并提醒。退款、失败、撤销等交易详情不自动入账。列表中退款交易或转账可能存在歧义，请手动排除或调整。当前不支持 PDF / CSV 账单直接导入；可使用文字解析作为补充。

## 数据

- 所有金额使用整数分，显示时换算为元，避免浮点累计误差。
- 日期使用本地自然日，不经 UTC 转换；同笔账单依据账单日期进入周月统计。
- 持久化使用 `localStorage`，资源缓存使用 Service Worker / Cache Storage；OCR 语言缓存由 Tesseract 使用 IndexedDB 管理。
- 本地账本没有账户同步与服务器备份。清除网站数据、换浏览器、卸载、设备故障可能导致数据丢失。请定期导出完整 JSON 备份。
- JSON 恢复会检查格式，在确认后合并，并提示跳过的重复笔数。
- 本站不请求相机、支付、微信或支付宝账号权限，只读取用户主动选择的图片。

## 本地开发

需要 Node.js 18+。生产文件位于 `dist/`，部署无需构建或安装依赖。

```powershell
cd qingji
npm run dev
```

打开 `http://localhost:4173`。PWA 安装和 Service Worker 需要 HTTPS，localhost 用于开发。安卓手机访问电脑的 HTTP 局域网地址不等同于可安装的安全站点；安装请使用发布的 HTTPS 地址。

```powershell
npm install
npm run check
npm test
# 生成用于 OCR 验证的合成截图（Windows）
powershell -ExecutionPolicy Bypass -File tests/create-fixtures.ps1
npm run test:ocr
```

`npm test` 检查金额、分类、自然周 / 月、完整与缺失日期、列表 / 详情解析、重复检测和数据校验。`test:ocr` 使用合成图片验证实际 OCR 到解析链路，不能代表真实截图的准确率。浏览器验证覆盖手机宽度、批量截图导入、编辑预览、确认入账、周月切换和刷新持久化；尚未在实体安卓机上测试。

使用 `npm run test:ocr-fixtures` 生成多字体合成样例、`npm run test:ocr-fonts` 运行旧策略 / 新增强策略对比。增强模式较慢；普通清晰截图可继续选择自动优化。

## 文件

`dist/app.js` 页面交互；`dist/ledger.js` 账单分类、解析与统计；`dist/ocr.js` 图片预处理与本地 OCR；`dist/sw.js` 离线缓存；`dist/vendor/` 包含识别引擎、核心、模型和对应授权信息。

第三方来源：[Tesseract.js](https://github.com/naptha/tesseract.js)、[tesseract.js-core](https://github.com/naptha/tesseract.js-core)、[tessdata](https://github.com/tesseract-ocr/tessdata)。各自许可参见 `dist/vendor/`。

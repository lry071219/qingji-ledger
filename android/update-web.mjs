// One-time, idempotent migration of the existing buildless UI for the APK host.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'dist/app.js');
let source=fs.readFileSync(file,'utf8');
const replacements=[
  ['轻记是一款适配安卓手机的本地记账应用。','轻记 1.1.0 · 支持安卓手机、本地截图识别与离线记账。'],
  ['<h3>安装到安卓桌面</h3><p>在 Chrome 中打开后，选择菜单 →「安装应用」或「添加到主屏幕」。</p>', '<h3>${isAndroidApp()?\'安卓应用与设备\':\'下载 Android APK\'}</h3><p>${isAndroidApp()?`Android ${esc(nativeDeviceInfo()?.android||\'\')} · ${esc((nativeDeviceInfo()?.abis||[]).join(\', \'))} · 通用架构，支持 ARM64`:\'支持 ARM64（64 位）手机，也可通过浏览器安装到桌面。\'}</p>'],
  ['<button class="btn" data-action="install">${installEvent?\'立即安装\':\'查看方法\'}</button>', '${isAndroidApp()?\'\':\'<a class="btn" href="./install.html">下载与安装</a>\'}'],
  ['账单与自定义规则保存在当前浏览器，不会在设备间自动同步。更换浏览器、清除网站数据或卸载后可能丢失，请先导出备份。完成首次加载后可离线记账；截图引擎首次使用需要联网下载，后续可使用已缓存资源。','${isAndroidApp()?\'APK 已包含中文识别模型，无需登录，首次启动即可离线使用。账本保存在应用私有空间，卸载或清除数据前请备份。\':\'网页版账本保存在当前浏览器；初次使用识别需下载约 6 MB 模型与引擎，后续可使用缓存。更换浏览器或清除数据前请先备份。\'}'],
  ['这是可安装的网页应用（PWA），当前不提供 APK 或微信内的小程序。识别使用本地 Tesseract.js 开源引擎。','提供安卓 APK 和可安装的网页版（PWA）。识别在本地完成，不会上传图片。网页版与 APK 的账本彼此独立，可通过 JSON 备份迁移。<br><a href="./privacy.html" class="text-link">隐私说明与开源许可 →</a><br>开发者主体、客服邮箱待补充，当前为发布候选版，尚未完成实体手机验收。'],
  ['轻记 1.0 · 把生活记清楚','轻记 1.1.0 · 把生活记清楚'],
  ['首次识别需下载约 6 MB 中文引擎，建议使用 Wi-Fi。','${isAndroidApp()?\'APK 已内置中文引擎，无需联网下载。\':\'首次识别需下载约 6 MB 中文引擎，建议使用 Wi-Fi。\'}'],
  ["download('\\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\\r\\n'),`轻记-${currentRange().start}-${currentRange().end}.csv`,'text/csv;charset=utf-8');toast('账单已导出，可用 Excel 打开。');", "if(download('\\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\\r\\n'),`轻记-${currentRange().start}-${currentRange().end}.csv`,'text/csv;charset=utf-8'))toast(isAndroidApp()?'请在系统窗口中选择保存位置。':'账单已导出，可用 Excel 打开。');"],
  ["download(JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),`轻记-完整备份-${dateKey()}.json`,'application/json');toast('完整备份已导出，请妥善保存。');", "if(download(JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),`轻记-完整备份-${dateKey()}.json`,'application/json'))toast(isAndroidApp()?'请在系统窗口中保存完整备份。':'完整备份已导出，请妥善保存。');"]
];
for(const [before,after] of replacements){if(source.includes(before))source=source.replace(before,after);else if(!source.includes(after))throw Error('UI migration did not match source: '+before.slice(0,60));}
fs.writeFileSync(file,source);

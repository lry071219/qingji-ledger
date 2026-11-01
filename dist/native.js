export const isAndroidApp = () => typeof globalThis.QingjiNative?.saveFile === 'function';
export function nativeDeviceInfo() {
  if (!isAndroidApp()) return null;
  try { return JSON.parse(globalThis.QingjiNative.getDeviceInfo()); } catch { return {}; }
}
export function saveWithAndroid(content, name, type) {
  if (!isAndroidApp()) return false;
  if (!globalThis.QingjiNative.saveFile(name, type, content)) throw Error('文件过大，无法交给系统保存；请分周期导出。');
  return true;
}

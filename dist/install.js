fetch('./downloads/release.json',{cache:'no-store'}).then(r=>{
  if(!r.ok)throw Error('安装包元数据暂不可用');return r.json();
}).then(release=>{
  if(release.version!=='1.1.0'||release.architecture!=='universal'||!release.supportsArm64||!/^[a-f0-9]{64}$/.test(release.sha256))throw Error('安装包信息不完整');
  document.querySelector('#apk-details').textContent=`${(release.size/1024/1024).toFixed(1)} MB · 通用架构，支持 ARM64（64 位）· Android ${release.minAndroid}+`;
  document.querySelector('#checksum').textContent=`SHA-256：${release.sha256}`;
}).catch(()=>{
  document.querySelector('#apk-details').textContent='无法加载版本信息，请联网后刷新；下载前可核对 SHA-256 校验文件。';
});

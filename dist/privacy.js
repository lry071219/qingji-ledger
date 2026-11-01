if (new URLSearchParams(location.search).get('first') === '1' && globalThis.QingjiNative) {
  document.querySelector('#first-actions').hidden = false;
  document.querySelector('.document>a').hidden = true;
  document.querySelector('#accept').onclick = () => globalThis.QingjiNative.acceptPrivacy();
  document.querySelector('#decline').onclick = () => globalThis.QingjiNative.exitApp();
}

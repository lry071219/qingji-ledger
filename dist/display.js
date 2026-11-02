export const DISPLAY_MODES={compact:{label:'紧凑',scale:.92},standard:{label:'标准',scale:1},large:{label:'大字',scale:1.14}};
export function normalizeDisplayMode(value){return Object.hasOwn(DISPLAY_MODES,value)?value:'standard';}
export function applyDisplayMode(value){
  const mode=normalizeDisplayMode(value);document.documentElement.dataset.display=mode;
  document.documentElement.style.setProperty('--ui-scale',DISPLAY_MODES[mode].scale);
  try{localStorage.setItem('qingji-display',mode);}catch{}
  return mode;
}
export function initialDisplayMode(){let mode;try{mode=localStorage.getItem('qingji-display');}catch{}return applyDisplayMode(mode);}

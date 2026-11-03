import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.dirname(path.dirname(fileURLToPath(import.meta.url))),stage=process.argv[2];
if(!stage)throw Error('Pass the ASCII Android staging directory.');
const model=path.join(stage,'project/build/intermediates/lint_vital_report_lint_model/release/generateReleaseLintVitalReportModel/release-artifact-dependencies.xml');
const xml=fs.readFileSync(model,'utf8'),ids=[...new Set([...xml.matchAll(/name="([^":]+:[^":]+:[^"@]+)@(?:aar|jar)"/g)].map(m=>m[1]))].sort();
if(!ids.some(id=>id==='com.google.mlkit:text-recognition-chinese:16.0.1'))throw Error('Chinese model dependency not found in build inventory.');
const cache=path.join(stage,'gradle-cache/caches/modules-2/files-2.1');
const findPom=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?findPom(path.join(dir,e.name)):e.name.endsWith('.pom')?[path.join(dir,e.name)]:[]):[];
const decode=text=>text.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
function getLicenses(pom,depth=0){
  const licenses=[...pom.matchAll(/<license>([\s\S]*?)<\/license>/g)].map(m=>`${decode(m[1].match(/<name>([\s\S]*?)<\/name>/)?.[1]||'')} — ${decode(m[1].match(/<url>([\s\S]*?)<\/url>/)?.[1]||'')}`);
  if(licenses.length||depth>4)return licenses;
  const parent=pom.match(/<parent>([\s\S]*?)<\/parent>/)?.[1];if(!parent)return [];
  const values=['groupId','artifactId','version'].map(tag=>parent.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]);
  if(values.some(v=>!v))return [];
  const file=findPom(path.join(cache,...values))[0];return file?getLicenses(fs.readFileSync(file,'utf8'),depth+1):[];
}
const notices=['轻记 Android 1.6.0 — Native OCR dependency notices','',
  'Google ML Kit Chinese 16.0.1 is a bundled on-device SDK, not an open source OCR engine.',
  'ML Kit terms: https://developers.google.com/ml-kit/terms',
  'ML Kit data disclosure: https://developers.google.com/ml-kit/android-data-disclosure',
  'Application INTERNET permission is removed. No screenshot or recognized text is sent by this APK.',
  'Third-party components retain their copyrights and licenses. Apache-2.0 full text is included in OPEN-SOURCE-NOTICES.txt.',
  '', 'Resolved Android dependencies and licenses (from official Maven POM metadata):',''];
for(const id of ids){
  const [group,name,version]=id.split(':'),poms=findPom(path.join(cache,group,name,version));
  if(!poms.length)throw Error(`Missing POM for ${id}`);
  const pom=fs.readFileSync(poms[0],'utf8'),licenses=getLicenses(pom);
  if(!licenses.length)throw Error(`Review inherited/missing license for ${id}`);
  notices.push(id,...licenses.map(l=>'  '+l),'');
}
const content=notices.join('\n'),destination=path.join(project,'dist/vendor/NATIVE-OCR-NOTICES.txt');
const changed=!fs.existsSync(destination)||fs.readFileSync(destination,'utf8')!==content;
if(changed)fs.writeFileSync(destination,content);
fs.copyFileSync(destination,path.join(stage,'project/assets/web/vendor/NATIVE-OCR-NOTICES.txt'));
console.log(JSON.stringify({dependencies:ids.length,changed}));

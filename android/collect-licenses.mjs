import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'dist/vendor');
const cache=path.join(root,'.android-local/license-cache');fs.mkdirSync(cache,{recursive:true});
const notices=['QINGJI 1.1.0 — THIRD-PARTY SOFTWARE NOTICES\n\nThe following components retain their respective copyrights and licenses.'];
for(const [name,file] of [['tesseract.js','LICENSE.md'],['tesseract.js-core','LICENSE'],['bmp-js','LICENSE'],['idb-keyval','LICENCE'],['is-url','LICENSE-MIT'],['regenerator-runtime','LICENSE'],['wasm-feature-detect','LICENSE'],['zlibjs','LICENSE']]){
  const folder=path.join(root,'node_modules',name),pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8'));
  notices.push(`\n\n===== ${name} ${pkg.version} =====\n`+fs.readFileSync(path.join(folder,file),'utf8'));
}
for(const file of ['tesseract.min.js.LICENSE.txt','worker.min.js.LICENSE.txt']){
  fs.copyFileSync(path.join(root,'node_modules/tesseract.js/dist',file),path.join(target,file));
  notices.push('\n\n===== Bundler notice: '+file+' =====\n'+fs.readFileSync(path.join(target,file),'utf8'));
}
function download(url){
  const cacheFile=path.join(cache,createHash('sha256').update(url).digest('hex')+'.txt');
  if(fs.existsSync(cacheFile))return fs.readFileSync(cacheFile,'utf8');
  const match=url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/([^/]+)\/(.+)$/);
  const source=match?`https://api.github.com/repos/${match[1]}/contents/${match[3]}?ref=${match[2]}`:url;
  const text=execFileSync('curl.exe',['--fail','--location','--retry','2','--retry-all-errors','--connect-timeout','15','--max-time','40','--silent','--show-error',source],{encoding:'utf8',maxBuffer:2*1024*1024,windowsHide:true});
  const result=match?Buffer.from(JSON.parse(text).content,'base64').toString('utf8'):text;
  fs.writeFileSync(cacheFile,result);return result;
}
const core=JSON.parse(download('https://api.github.com/repos/naptha/tesseract.js-core/contents/third_party?ref=v7.0.0'));
const hashes=Object.fromEntries(core.map(c=>[c.name,c.sha]));
const components=[
  ['leptonica','DanBloomberg/leptonica',['leptonica-license.txt']],
  ['libjpeg','LuaDist/libjpeg',['README']],
  ['giflib','mirrorer/giflib',['COPYING']],
  ['libpng','glennrp/libpng',['LICENSE']],
  ['libwebp','webmproject/libwebp',['COPYING','PATENTS']],
  ['zlib','madler/zlib',['zlib.h']],
  ['tesseract','Balearica/tesseract',['LICENSE']],
  ['openlibm','JuliaMath/openlibm',['LICENSE.md']]
];
for(const [name,repo,files] of components){
  if(!hashes[name])throw Error('Missing upstream pinned revision: '+name);
  for(const file of files){const url=`https://raw.githubusercontent.com/${repo}/${hashes[name]}/${file}`;const text=download(url);notices.push(`\n\n===== ${name} @ ${hashes[name]} / ${file} =====\nSource: ${url}\n\n${text}`);}
}
if(hashes.libtiff){const url=`https://raw.githubusercontent.com/libsdl-org/libtiff/${hashes.libtiff}/COPYRIGHT`;notices.push(`\n\n===== libtiff @ ${hashes.libtiff} =====\nSource: ${url} (mirror of upstream libtiff, same pinned commit)\n\n${download(url)}`);}
// Buffer and ieee754 are included in the prebuilt browser worker.
for(const [name,url] of [
  ['buffer','https://raw.githubusercontent.com/feross/buffer/v6.0.3/LICENSE'],
  ['ieee754','https://raw.githubusercontent.com/feross/ieee754/v1.2.1/LICENSE'],
  ['Emscripten','https://raw.githubusercontent.com/emscripten-core/emscripten/main/LICENSE'],
  ['LLVM runtime exception','https://raw.githubusercontent.com/llvm/llvm-project/main/libcxx/LICENSE.TXT']
])notices.push(`\n\n===== ${name} =====\nSource: ${url}\n\n${download(url)}`);
fs.writeFileSync(path.join(target,'OPEN-SOURCE-NOTICES.txt'),notices.join('\n'));
fs.writeFileSync(path.join(target,'license-inventory.json'),JSON.stringify({coreVersion:'7.0.0',source:'https://github.com/naptha/tesseract.js-core/tree/v7.0.0',revisions:hashes},null,2));
console.log('Collected pinned OCR component licenses and browser dependency notices.');

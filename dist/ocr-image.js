// Shared pixel processing for the browser and reproducible Node OCR benchmarks.
// No font-name guessing, external image upload, or alteration of recognized digits.
export const MAX_OCR_PIXELS = 8_000_000;
const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
function percentile(histogram, fraction, total) {
  let count = 0;
  for (let i = 0; i < 256; i++) {count += histogram[i]; if (count >= total * fraction) return i;}
  return 255;
}
export function otsuThreshold(gray) {
  const histogram = new Uint32Array(256);
  for (const value of gray) histogram[value]++;
  let sum = 0, weight = 0, weighted = 0, best = -1, threshold = 127;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  for (let i = 0; i < 256; i++) {
    weight += histogram[i]; if (!weight) continue;
    const rest = gray.length - weight; if (!rest) break;
    weighted += i * histogram[i];
    const difference = weighted / weight - (sum - weighted) / rest;
    const variance = weight * rest * difference * difference;
    if (variance > best) {best = variance; threshold = i;}
  }
  return threshold;
}
export function resizeGray(gray, width, height, targetWidth, targetHeight) {
  if (width === targetWidth && height === targetHeight) return gray.slice();
  const output = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.max(0, Math.min(height - 1, (y + .5) * height / targetHeight - .5));
    const y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.max(0, Math.min(width - 1, (x + .5) * width / targetWidth - .5));
      const x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0;
      output[y * targetWidth + x] = Math.round((1 - fy) * ((1 - fx) * gray[y0 * width + x0] + fx * gray[y0 * width + x1]) + fy * ((1 - fx) * gray[y1 * width + x0] + fx * gray[y1 * width + x1]));
    }
  }
  return output;
}
function textHeight(gray, width, height) {
  const cutoff = Math.min(220, Math.max(90, otsuThreshold(gray) + 16));
  const runs = []; let start = -1, gap = 0;
  for (let y = 0; y <= height; y++) {
    let dark = 0;
    if (y < height) for (let x = 0; x < width; x++) if (gray[y * width + x] < cutoff) dark++;
    const ink = dark >= Math.max(3, width * .003) && dark < width * .8;
    if (ink) {if (start < 0) start = y; gap = 0;}
    else if (start >= 0 && (++gap > 2 || y === height)) {
      const size = y - gap + 1 - start;
      if (size >= 5 && size <= 100) runs.push(size);
      start = -1;
    }
  }
  if (!runs.length) return null;
  runs.sort((a,b)=>a-b);
  return runs[Math.floor(runs.length / 2)];
}
export function prepareOcrImage({data, width, height}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 40_000_000 || data.length !== width * height * 4) throw Error('图片尺寸无效或过大，请将长截图分成几张后导入');
  const gray = new Uint8Array(width * height), histogram = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    const alpha = data[i * 4 + 3] / 255;
    const value = Math.round((.299 * data[i*4] + .587 * data[i*4+1] + .114 * data[i*4+2]) * alpha + 255 * (1 - alpha));
    gray[i] = value; histogram[value]++;
  }
  // Keep the previous conservative resampling strategy as an independent candidate.
  const legacyScale=Math.min(2,Math.max(1,1400/width),Math.sqrt(12_000_000/(width*height)));
  const legacyWidth=Math.round(width*legacyScale),legacyHeight=Math.round(height*legacyScale);
  const reference={gray:resizeGray(gray,width,height,legacyWidth,legacyHeight),width:legacyWidth,height:legacyHeight};
  const inverted = percentile(histogram, .5, gray.length) < 118;
  if (inverted) {histogram.fill(0); for (let i = 0; i < gray.length; i++) {gray[i] = 255 - gray[i]; histogram[gray[i]]++;}}
  let low = percentile(histogram, .005, gray.length), high = percentile(histogram, .995, gray.length);
  const lowContrast = high - low < 150;
  if (high - low < 12) {low = 0; high = 255;}
  for (let i = 0; i < gray.length; i++) gray[i] = clamp((gray[i] - low) * 255 / (high - low));
  const estimatedHeight = textHeight(gray, width, height);
  const desiredScale = Math.min(3, Math.max(1, estimatedHeight ? 36 / estimatedHeight : 1400 / width));
  const scale = Math.min(desiredScale, Math.sqrt(MAX_OCR_PIXELS / (width * height)), 15000 / height, 4096 / width);
  const scaledWidth = Math.max(1, Math.round(width * scale)), scaledHeight = Math.max(1, Math.round(height * scale));
  const scaled = resizeGray(gray, width, height, scaledWidth, scaledHeight), padding = 14;
  const outputWidth = scaledWidth + padding * 2, outputHeight = scaledHeight + padding * 2;
  const output = new Uint8Array(outputWidth * outputHeight); output.fill(255);
  for (let y = 0; y < scaledHeight; y++) output.set(scaled.subarray(y * scaledWidth, (y + 1) * scaledWidth), (y + padding) * outputWidth + padding);
  const treatments = [];
  if (inverted) treatments.push('深色背景转浅色');
  if (scale > 1.15) treatments.push('按文字高度放大');
  if (lowContrast) treatments.push('对比度增强');
  treatments.push('灰度与边缘留白');
  return {gray:output,width:outputWidth,height:outputHeight,reference,analysis:{inverted,lowContrast,scale,estimatedHeight,treatments,limited:scale<1}};
}
export function adaptiveOcrImage(image) {
  const {gray,width,height} = image, output = new Uint8Array(gray.length);
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y=0;y<height;y++) {let sum=0;for(let x=0;x<width;x++){sum+=gray[y*width+x];integral[(y+1)*(width+1)+x+1]=integral[y*(width+1)+x+1]+sum;}}
  const radius = 17;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const x0=Math.max(0,x-radius),x1=Math.min(width,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(height,y+radius+1),stride=width+1;
    const mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
    const i=y*width+x,c=gray[i];
    const neighbor=(gray[y*width+Math.max(0,x-1)]+gray[y*width+Math.min(width-1,x+1)]+gray[Math.max(0,y-1)*width+x]+gray[Math.min(height-1,y+1)*width+x])/4;
    output[i]=clamp(c+.45*(c-neighbor))<Math.min(235,mean-9)?0:255;
  }
  return {...image,gray:output};
}

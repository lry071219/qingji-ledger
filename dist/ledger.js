export const CATEGORIES = [
  {id:'food',name:'餐饮美食',icon:'bowl',color:'#e9ad69',bg:'#fcf0df',words:['餐','饭','面馆','面包','火锅','肯德基','麦当劳','汉堡','美团','饿了么','食堂','小吃','咖啡','星巴克','瑞幸','奶茶','茶百道','蜜雪','喜茶','霸王茶姬','海底捞','饮品','早餐','午餐','晚餐']},
  {id:'shopping',name:'购物消费',icon:'bag',color:'#829cca',bg:'#edf1fa',words:['淘宝','天猫','京东','拼多多','购物','服饰','优衣库','耐克','商店','数码','Apple','苹果','文具','便利店','超市','盒马','永辉','山姆','全家','罗森','沃尔玛','日用']},
  {id:'transport',name:'交通出行',icon:'train',color:'#82b2a3',bg:'#eaf4ef',words:['地铁','公交','滴滴','打车','高德','铁路','火车','机票','航空','出行','单车','停车','加油','交通','12306','哈啰','油费']},
  {id:'living',name:'生活缴费',icon:'home',color:'#b1a0c8',bg:'#f2edf8',words:['电费','水费','燃气','物业','房租','房贷','宽带','话费','移动','联通','电信','生活缴费']},
  {id:'fun',name:'休闲娱乐',icon:'game',color:'#db9b98',bg:'#fbefef',words:['电影','影城','游戏','会员','爱奇艺','腾讯视频','哔哩','音乐','演出','门票','旅游','酒店','KTV','健身','娱乐','网易']},
  {id:'health',name:'医疗健康',icon:'heart',color:'#d38d9f',bg:'#fbedf2',words:['医院','药房','药店','医疗','挂号','体检','诊所','健康','口腔']},
  {id:'study',name:'学习成长',icon:'book',color:'#b1ad7b',bg:'#f3f2e6',words:['书店','读书','图书','课程','学费','培训','教育','考试','学习','当当']},
  {id:'social',name:'人情往来',icon:'gift',color:'#d6a37d',bg:'#f8efe8',words:['红包','礼物','礼金','人情','随礼']},
  {id:'transfer',name:'转账往来',icon:'swap',color:'#94a3b8',bg:'#eef1f5',words:['转账','转入','转出']},
  {id:'other',name:'其他支出',icon:'dots',color:'#a3a9a5',bg:'#f1f3f1',words:[]},
  {id:'salary',name:'工资收入',icon:'wallet',color:'#4e927a',bg:'#e7f3ed',words:['工资','薪资','薪酬','奖金']},
  {id:'income',name:'其他收入',icon:'plus',color:'#7caa89',bg:'#edf5ec',words:[]}
];
export const catById = id => CATEGORIES.find(c=>c.id===id) || CATEGORIES.find(c=>c.id==='other');
export const dateKey = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const parseDay = str => new Date(str+'T12:00:00');
export const uuid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const money = cents => (cents/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export function toCents(value) {
  const str = String(value).replace(/[,，￥¥\s]/g,'');
  if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(str)) return null;
  const amount = Math.round(Math.abs(Number(str))*100);
  return Number.isSafeInteger(amount) && amount>0 && amount<=100000000000 ? amount : null;
}
export function classify(merchant, type='expense', rules=[]) {
  const text = merchant.toLowerCase();
  const custom = rules.find(r=>r.keyword && text.includes(r.keyword.toLowerCase()) && CATEGORIES.some(c=>c.id===r.category));
  if(custom) return custom.category;
  if(type==='income') return /工资|薪资|薪酬|奖金/.test(text)?'salary':'income';
  return CATEGORIES.filter(c=>!['income','salary'].includes(c.id)).find(c=>c.words.some(w=>text.includes(w.toLowerCase())))?.id || 'other';
}
export function validDate(s) {return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseDay(s)) && dateKey(parseDay(s))===s;}
export function validateRecord(r) {
  return r && typeof r.id==='string' && typeof r.merchant==='string' && r.merchant.trim().length>0 && r.merchant.length<=200 && validDate(r.date) && Number.isSafeInteger(r.amount) && r.amount>0 && r.amount<=100000000000 && ['expense','income'].includes(r.type) && CATEGORIES.some(c=>c.id===r.category) && ['wechat','alipay','manual','unknown'].includes(r.source);
}
export function fingerprint(r) {return [r.date,r.type,r.amount,r.merchant.replace(/[\s·•()（）]/g,'').toLowerCase()].join('|');}
export function rangeFor(mode, anchor) {
  const d=parseDay(anchor), start=new Date(d), end=new Date(d);
  if(mode==='week') {start.setDate(d.getDate()-((d.getDay()+6)%7));end.setTime(start.getTime());end.setDate(start.getDate()+6);}
  else {start.setDate(1);end.setMonth(d.getMonth()+1,0);}
  return {start:dateKey(start),end:dateKey(end)};
}
export function shiftAnchor(mode, anchor, delta) {
  const d=parseDay(anchor);
  if(mode==='week') d.setDate(d.getDate()+delta*7);
  else {d.setDate(1);d.setMonth(d.getMonth()+delta);}
  return dateKey(d);
}
export function inRange(r,range) {return r.date>=range.start && r.date<=range.end;}
export function totals(records) {
  return records.reduce((a,r)=>{a[r.type]+=r.amount;return a;},{expense:0,income:0});
}
function extractDate(line, reference, yearHint) {
  const clean=line.replace(/\s/g,'');
  let m=clean.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/);
  if(m) {const value=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return validDate(value)?{value,inferred:false}:null;}
  m=clean.match(/(?:^|[^\d])(\d{1,2})[月\-/](\d{1,2})(?:日|[^\d]|$)/);
  if(m) {const value=`${yearHint || reference.slice(0,4)}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;return validDate(value)?{value,inferred:!yearHint}:null;}
  if(/今天|昨天|前天/.test(clean)) {const d=parseDay(reference);d.setDate(d.getDate()-(clean.includes('前天')?2:clean.includes('昨天')?1:0));return {value:dateKey(d),inferred:false};}
  return null;
}
const isMeta = s => /^(?:微信|支付宝|账单|全部|筛选|收入|支出|本月|共\d|支付方式|付款方式|交易单号|商户单号|订单号|创建时间|支付时间|交易时间|交易状态|当前状态|收单机构|服务|更多|账单详情|交易详情|支付成功|交易成功|收款成功|完成|零钱|余额|银行卡|返回|查看往来|全部账单|小计|总计|\d{1,2}:\d{2})/.test(s);
export function parseBillText(raw, {reference=dateKey(),source:forcedSource,rules=[]}={}) {
  const text=String(raw).replace(/[−–—]/g,'-').replace(/[￥Ｙ]/g,'¥').replace(/([\u4e00-\u9fff])[ \t]+(?=[\u4e00-\u9fff])/g,'$1').replace(/：/g,':');
  const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const source=forcedSource && forcedSource!=='auto'?forcedSource:/支付宝|alipay/i.test(text)?'alipay':/微信|零钱|wechat/i.test(text)?'wechat':'unknown';
  const yearHint=text.match(/(20\d{2})年/)?.[1];
  let contextDate=null; const rows=[]; const warnings=[];
  if(/已退款|退款成功|交易关闭|支付失败|已撤销|已取消/.test(text) && /账单详情|交易详情|交易状态|当前状态/.test(text)) return {rows:[],warnings:['此截图包含退款、取消或失败状态，请确认实际收支后手动记账。'],source};
  const detail=/账单详情|交易详情|交易时间|支付时间|创建时间|商户单号|交易单号/.test(text);
  const add=(merchant,amount,dateInfo,type,uncertain=false)=>{
    merchant=merchant.replace(/^[\s:·•]+|[\s:·•]+$/g,'').slice(0,200);
    if(!merchant || isMeta(merchant)) merchant='待核对商户';
    rows.push({id:uuid(),merchant,amount,date:dateInfo?.value||reference,type,source,category:classify(merchant,type,rules),note:'截图导入',needsReview:!dateInfo || dateInfo.inferred || uncertain || merchant==='待核对商户',dateInferred:!dateInfo || !!dateInfo.inferred});
  };
  if(detail) {
    const dateInfo=lines.map(l=>extractDate(l,reference,yearHint)).find(Boolean);
    let amountLine=lines.find(l=>/^[+\-¥]?\s*\d[\d,]*\.\d{2}\s*(?:元)?$/.test(l));
    if(!amountLine) amountLine=lines.find(l=>/(?:金额|实付|付款)\s*:?\s*[¥+\-]?\s*\d[\d,]*\.\d{2}/.test(l));
    const am=amountLine?.match(/[+\-¥]?\s*(\d[\d,]*\.\d{2})/);
    if(am) {
      let merchant='';
      for(let i=0;i<lines.length;i++) {
        const label=lines[i].match(/^(?:商品说明|商品|商户名称|商户|收款方|付款方|对方账户|转账备注)\s*:?\s*(.*)/);
        if(label) {merchant=label[1] || lines[i+1] || '';if(merchant) break;}
      }
      if(!merchant) merchant=lines.filter(l=>!isMeta(l) && !extractDate(l,reference,yearHint) && !/[¥+\-]?\s*\d[\d,]*\.\d{2}|\d{9,}/.test(l))[0] || '待核对商户';
      const income=/^\s*\+/.test(amountLine) || /收款成功|收入|付款方/.test(text);
      const known=income || /^\s*-/.test(amountLine) || /支付成功|付款|收款方|支出/.test(text);
      const amount=toCents(am[1]);if(amount)add(merchant,amount,dateInfo,income?'income':'expense',!known);
    }
  } else {
    const firstAmount=lines.findIndex(l=>/[+\-¥]\s*\d[\d,]*\.\d{2}/.test(l));
    const firstDate=lines.findIndex(l=>extractDate(l,reference,yearHint));
    const datesBelow=firstAmount>=0 && firstDate>firstAmount;
    for(let i=0;i<lines.length;i++) {
      const line=lines[i], found=extractDate(line,reference,yearHint);
      if(found) contextDate=found;
      // A dotted date header (2026.10.31) is never a decimal amount (10.31).
      if(found && /^(?:20\d{2}[年./-])?\d{1,2}[月./-]\d{1,2}日?(?:\d{1,2}:\d{2}(?::\d{2})?)?$/.test(line.replace(/\s/g,'')))continue;
      if(/收入.*支出|支出.*收入|合计|总计|小计|共\d+笔/.test(line)) continue;
      const m=line.match(/([+\-¥]?)\s*(\d[\d,]*\.\d{2})(?:\s*元)?(?:\s*(?:收入|支出))?\s*$/);
      if(!m || /\d{1,2}:\d{2}:\d{2}/.test(m[0])) continue;
      const amount=toCents(m[2]);if(!amount)continue;
      let merchant=line.slice(0,m.index).replace(/20\d{2}[年\-/.]\d{1,2}[月\-/.]\d{1,2}日?|\d{1,2}月\d{1,2}日|\d{1,2}:\d{2}(?::\d{2})?|今天|昨天|前天|收入|支出/g,'').trim();
      if(!merchant || isMeta(merchant)) {
        merchant=[lines[i-1],lines[i-2]].find(l=>l && !isMeta(l) && !extractDate(l,reference,yearHint) && !/^[+\-¥]?\s*\d[\d,]*\.\d{2}/.test(l) && !/\d{9,}/.test(l)) || '待核对商户';
      }
      const type=m[1]==='+' || /收入/.test(line)?'income':'expense';
      add(merchant,amount,found||(datesBelow?extractDate(lines[i+1]||'',reference,yearHint):null)||contextDate,type,!m[1] && !/支出|收入/.test(line));
    }
  }
  if(!rows.length) warnings.push('未识别到可用账单。请使用含商户、金额和日期的清晰截图，或修正识别文字后重试。');
  if(rows.some(r=>r.dateInferred))warnings.push('部分日期使用参考日期或年份补全，请逐条核对。');
  if(rows.some(r=>r.needsReview))warnings.push('带「待核对」标记的账单需要确认商户、收支方向与日期。');
  if(source==='unknown')warnings.push('未检测到支付平台，可在预览中手动选择。');
  return {rows,warnings,source};
}
export function makeDemo(today=dateKey()) {
  const d=parseDay(today);d.setDate(1);d.setMonth(d.getMonth()-1);
  const year=d.getFullYear(),month=d.getMonth(), days=new Date(year,month+1,0).getDate();
  const merchants=[['瑞幸咖啡',1490,'wechat'],['盒马鲜生',8630,'alipay'],['地铁出行',600,'alipay'],['美团外卖',2850,'wechat'],['优衣库',19900,'alipay'],['星巴克',3200,'wechat'],['滴滴出行',2450,'wechat'],['罗森便利店',1850,'alipay'],['海底捞火锅',16800,'wechat'],['网易云音乐会员',1800,'alipay'],['生活电费',8650,'alipay'],['西西弗书店',5900,'wechat']];
  const rows=[];
  for(let day=1;day<=days;day++) {
    const count=day%3===0?2:1;
    for(let j=0;j<count;j++) {const [merchant,amount,source]=merchants[(day*7+j*3)%merchants.length];rows.push({id:`demo-${day}-${j}`,merchant,date:dateKey(new Date(year,month,day)),amount:amount+(day%5)*100,type:'expense',category:classify(merchant),source,note:'示例数据'});}
  }
  rows.push({id:'demo-salary',merchant:`${month+1}月工资`,date:dateKey(new Date(year,month,10)),amount:850000,type:'income',category:'salary',source:'alipay',note:'示例数据'});
  return {records:rows,anchor:dateKey(new Date(year,month,days))};
}

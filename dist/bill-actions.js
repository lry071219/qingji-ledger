export const isImportedBill = r => r.origin==='import'||r.note==='截图导入';
export function deleteSelectedBills(state,ids,now=Date.now()){
  const selected=new Set(ids),removed=state.records.filter(r=>selected.has(r.id));
  if(!removed.length)return {state,count:0};
  return {state:{...state,records:state.records.filter(r=>!selected.has(r.id)),lastDeleted:{records:removed,deletedAt:now}},count:removed.length};
}
export function restoreDeletedBills(state){
  const removed=state.lastDeleted?.records||[],existing=new Set(state.records.map(r=>r.id)),restored=removed.filter(r=>!existing.has(r.id));
  const next={...state,records:[...state.records,...restored]};delete next.lastDeleted;
  return {state:next,count:restored.length};
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isImportedBill,deleteSelectedBills,restoreDeletedBills} from '../dist/bill-actions.js';
import {normalizeDisplayMode} from '../dist/display.js';
const records=[{id:'a',amount:1490,origin:'import'},{id:'b',amount:600,note:'截图导入'},{id:'c',amount:850000,origin:'manual'}];
test('batch delete acts only on explicit IDs and leaves a persisted undo batch',()=>{
  const before={records,budget:10000};const result=deleteSelectedBills(before,['a','b','a','missing'],123);
  assert.equal(result.count,2);assert.deepEqual(result.state.records,[records[2]]);assert.deepEqual(result.state.lastDeleted,{records:records.slice(0,2),deletedAt:123});assert.equal(result.state.budget,10000);assert.equal(before.records.length,3);
  const restored=restoreDeletedBills(JSON.parse(JSON.stringify(result.state)));assert.equal(restored.count,2);assert.equal(restored.state.records.length,3);assert.equal(restored.state.lastDeleted,undefined);
});
test('undo never overwrites an existing record with the same ID',()=>{
  const changed={...records[0],amount:9900},state={records:[changed,records[2]],lastDeleted:{records:records.slice(0,2)}};
  const result=restoreDeletedBills(state);assert.equal(result.count,1);assert.equal(result.state.records[0].amount,9900);
});
test('empty selection preserves state and a later delete replaces the undo batch',()=>{
  const state={records};assert.equal(deleteSelectedBills(state,[]).state,state);
  const first=deleteSelectedBills(state,['a']).state;const second=deleteSelectedBills(first,['b']).state;
  assert.deepEqual(second.lastDeleted.records,[records[1]]);assert.equal(restoreDeletedBills(second).state.records.length,2);
});
test('legacy import markers are recognized and display modes reject arbitrary CSS',()=>{
  assert.deepEqual(records.map(isImportedBill),[true,true,false]);assert.equal(normalizeDisplayMode('large'),'large');assert.equal(normalizeDisplayMode('100;display:none'),'standard');
});

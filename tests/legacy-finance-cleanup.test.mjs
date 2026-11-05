import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('legacy Uche and Gabriel payments are removed but all office expenses survive',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function cleanLegacyRecords(){');
 const end=html.indexOf('function load(){',start);
 assert.ok(start>0&&end>start,'Stored data migration must be installed');
 const fn=html.slice(start,end);
 const state={members:[{id:'gabriel',name:'Mr Gabriel Success'},{id:'uche',name:'Mr Uche'},{id:'new-user',name:'Registered Test'}],transactions:[{id:'opening-gabriel',type:'income',memberId:'gabriel',amount:20000},{id:'opening-uche',type:'income',memberId:'uche',amount:3000},{id:'gas-nov2',type:'expense',amount:11100},{id:'gas-nov3',type:'expense',amount:7500},{id:'later-office-expense',type:'expense',amount:4800},{id:'other-income',type:'income',memberId:'new-user',amount:2500}],monthlyObligations:{gabriel:25000,uche:25000,'new-user':10000}};
 const context=vm.createContext({state});
 vm.runInContext(fn+';cleanLegacyRecords()',context);
 assert.deepEqual(state.members.map(x=>x.id),['new-user']);
 assert.deepEqual(state.transactions.filter(x=>x.type==='expense').map(x=>x.id),['gas-nov2','gas-nov3','later-office-expense']);
 assert.equal(state.transactions.some(x=>['opening-uche','opening-gabriel'].includes(x.id)),false);
 assert.equal(state.transactions.some(x=>x.id==='other-income'),true,'Unrelated legacy records should not be silently deleted');
 assert.equal(state.monthlyObligations.uche,undefined);
 assert.equal(state.monthlyObligations.gabriel,undefined);
 assert.equal(state.monthlyObligations['new-user'],10000);
 assert.match(html,/if\(type!=='expense'\)return alert/,'Browser-only income creation must be disabled');
 assert.match(html,/cleanLegacyRecords\(\);localStorage\.setItem/,'Migration must run for returning visitors');
});

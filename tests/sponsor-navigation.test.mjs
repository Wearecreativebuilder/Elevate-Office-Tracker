import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
test('sponsor codes include the member first name and a stable unique suffix',async()=>{
 const source=await readFile(new URL('api/backend.js',root),'utf8');
 const start=source.indexOf('function namedSponsorCode('),end=source.indexOf('function roleDue(',start);
 assert.ok(start>0&&end>start);
 const ctx=vm.createContext({});
 vm.runInContext(source.slice(start,end),ctx);
 const id='12345678-abcd-4321-aaaa-bbbbbbbbbbbb';
 assert.equal(ctx.namedSponsorCode('Friday James',id),'FRIDAY-12345678ABCD');
 assert.equal(ctx.namedSponsorCode('Mr Benjamin',id),'BENJAMI-12345678ABCD');
 assert.equal(ctx.namedSponsorCode('Akolo Uche',id),'AKOLO-12345678ABCD');
 assert.ok(ctx.namedSponsorCode('Friday James',id).length<=20);
});
test('member dashboard exposes sponsor changes and mobile dropdown navigation',async()=>{
 const html=await readFile(new URL('member.html',root),'utf8');
 assert.match(html,/id="mobileMenuToggle"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/aria-controls="mobileNav"/);
 assert.match(html,/#siteHeader\.menu-open nav\{display:flex!important\}/);
 assert.match(html,/id="sponsorPanel"/);
 assert.match(html,/id="sponsorForm"/);
 assert.match(html,/api\('sponsor',\{sponsorCode:code\}\)/);
 assert.match(html,/id="quickAdministration"/);
 assert.match(html,/show\('sponsorPanel',true\)/);
});
test('server sponsorship checks ownership, cycle safety and preserves legacy codes',async()=>{
 const source=await readFile(new URL('api/backend.js',root),'utf8');
 assert.match(source,/pg_advisory_xact_lock\(748201\)/);
 assert.match(source,/select 1 from chain where id=\$2 limit 1/);
 assert.match(source,/insert into sponsor_change_history/);
 assert.match(source,/select member_id from sponsor_code_aliases where code=\$1/);
});

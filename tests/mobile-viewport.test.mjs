import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const pages=['member.html','attendance.html','index.html','teams.html'];
for(const page of pages){
 test(page+' contains viewport-safe mobile layout rules',async()=>{
  const html=await readFile(new URL('../'+page,import.meta.url),'utf8');
  assert.match(html,/<meta name="viewport"[^>]*width=device-width/);
  assert.match(html,/html\{width:100%;max-width:100%;overflow-x:clip\}/);
  assert.match(html,/\.tablewrap\{width:100%;max-width:100%;overflow-x:auto/);
  assert.match(html,/@media\(max-width:600px\)/);
  assert.match(html,/@media\(max-width:360px\)/);
  assert.match(html,/input,select,textarea\{max-width:100%;min-width:0\}/);
  assert.match(html,/\.grid>\*,\.grid2>\*,\.cards>\*/);
 });
}
test('attendance calendar uses seven flexible columns without viewport overflow',async()=>{
 const s=await readFile(new URL('../attendance.html',import.meta.url),'utf8');
 assert.match(s,/\.attendance-calendar\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\);gap:3px\}/);
});
test('mobile member dashboard maintains collapsed navigation',async()=>{
 const s=await readFile(new URL('../member.html',import.meta.url),'utf8');
 assert.match(s,/#siteHeader\.menu-open nav\{display:flex!important\}/);
 assert.match(s,/\.dashboard-shortcuts\{width:100%;max-width:100%\}/);
});

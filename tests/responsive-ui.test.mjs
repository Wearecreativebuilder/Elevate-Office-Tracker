import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const pages=['index.html','teams.html','attendance.html','member.html'];
for(const page of pages){
 test(page+' exposes responsive mobile styling and blue/light/dark appearance',async()=>{
  const html=await readFile(new URL('../'+page,import.meta.url),'utf8');
  assert.match(html,/<meta name="viewport"[^>]*width=device-width/);
  assert.match(html,/--e-blue:#2563eb/);
  assert.match(html,/--e-bg:#f4f7fc/);
  assert.match(html,/:root\[data-theme="dark"\]/);
  assert.match(html,/@media\(max-width:640px\)/);
  assert.match(html,/elevateThemeToggle/);
  assert.match(html,/elevate-color-theme/);
  assert.match(html,/\.tablewrap\{[^}]*overflow:auto/);
  assert.ok(html.indexOf('document.documentElement.dataset.theme')<html.indexOf('</style>'),'Saved appearance is applied early');
 });
}

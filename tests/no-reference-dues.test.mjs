import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('members submit dues without payment reference while administrator confirms',async()=>{
 const page=await readFile(new URL('../member.html',import.meta.url),'utf8');
 const backend=await readFile(new URL('../api/backend.js',import.meta.url),'utf8');
 assert.doesNotMatch(page,/id="myDueReference"/);
 assert.match(page,/id="myDueMonth"/);
 assert.match(page,/id="myDueAmount"/);
 assert.match(page,/id="myDueDate"/);
 assert.doesNotMatch(page,/reference:\$\('myDueReference'\)/);
 assert.match(backend,/reference='AUTO-'\+randomUUID\(\)/);
 assert.match(backend,/if\(action==='admin-due-review'/);
 assert.match(backend,/if\(item.status!=='pending'\)/);
});
test('admin can edit and restore member monthly dues with audit logging',async()=>{
 const page=await readFile(new URL('../member.html',import.meta.url),'utf8');
 const backend=await readFile(new URL('../api/backend.js',import.meta.url),'utf8');
 for(const id of ['responsibilityEditForm','editDueAmount','editDueMonth','editDueReason','restoreResponsibilityDefault'])assert.ok(page.includes('id="'+id+'"'),id+' missing');
 assert.match(page,/data-edit-office-due/);
 assert.match(page,/admin-responsibility-set/);
 assert.match(backend,/monthly_responsibility_override/);
 assert.match(backend,/if\(!m.is_admin\)return fail\(res,403/);
});

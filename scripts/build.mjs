import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {execFileSync} from 'node:child_process';
const pages=['index.html','attendance.html','teams.html','member.html'];
await mkdir('dist',{recursive:true});
for(const page of pages){
  const source=await readFile(page,'utf8');
  if(!source.includes('<!doctype html>')||!source.includes('</html>'))throw Error('Invalid HTML: '+page);
  for(const match of source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)){
    if(match[1].trim())new Script(match[1],{filename:page});
  }
  await copyFile(page,'dist/'+page);
  console.log('Validated and copied',page);
}
execFileSync(process.execPath,['--check','api/backend.js'],{stdio:'inherit'});
console.log('Backend syntax validated; static build output: dist/');

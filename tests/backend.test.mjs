import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/backend.js';

async function call(action,method='GET',body={}){
 const headers={'content-type':'application/json',host:'localhost'};
 const req={method,query:{action},headers,body};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(c){this.statusCode=c;return this},json(v){this.data=v;return this}};
 await handler(req,res);
 return res;
}
test('server status reports backend not configured when secrets missing',async()=>{
 const r=await call('status');assert.equal(r.statusCode,200);assert.equal(r.data.configured,false);
 assert.equal(r.data.backend,'Custom Node.js + PostgreSQL');
});
test('registration is blocked when no database and session secrets exist',async()=>{
 const r=await call('register','POST',{name:'Test User',email:'test@example.com',password:'a-strong-long-password'});
 assert.equal(r.statusCode,503);assert.match(r.data.error,/Backend setup required/);
});
test('login is blocked when database not configured',async()=>{
 const r=await call('login','POST',{email:'test@example.com',password:'test'});
 assert.equal(r.statusCode,503);
});

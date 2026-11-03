import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import handler from '../api/backend.js';

const root=resolve('dist');
const type={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const port=Number(process.env.PORT||3000);
const server=createServer(async(req,res)=>{
 const target=new URL(req.url,'http://localhost');
 if(target.pathname==='/api/backend'){
   let body={},data='';
   if(req.method==='POST'){
     for await(const chunk of req){data+=chunk;if(data.length>65536){res.writeHead(413);res.end('Payload too large');return}}
     try{body=JSON.parse(data||'{}')}catch{res.writeHead(400);res.end('Invalid JSON');return}
   }
   const response={
     headers:{},
     setHeader(name,value){this.headers[name]=value;return this},
     status(code){this.statusCode=code;return this},
     json(obj){res.writeHead(this.statusCode||200,{'Content-Type':'application/json; charset=utf-8',...this.headers});res.end(JSON.stringify(obj))}
   };
   return handler({method:req.method,headers:{...req.headers,host:req.headers.host},query:Object.fromEntries(target.searchParams),body},response);
 }
 const pathname=target.pathname==='/'?'/index.html':decodeURIComponent(target.pathname);
 const path=resolve(root,'.'+pathname);
 if(!(path===root||path.startsWith(root+sep))){res.writeHead(403);return res.end('Forbidden')}
 try{const data=await readFile(path);res.writeHead(200,{'Content-Type':type[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)}
 catch{res.writeHead(404);res.end('Not found')}
});
server.listen(port,'0.0.0.0',()=>console.log('Elevate local dev server: http://127.0.0.1:'+port));

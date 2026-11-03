import pg from 'pg';
import bcrypt from 'bcryptjs';
import {SignJWT,jwtVerify} from 'jose';
import {randomBytes,timingSafeEqual} from 'node:crypto';

const {Pool}=pg;
const KEY='elevate_session';
let pool;
function configured(){return Boolean(process.env.DATABASE_URL&&process.env.SESSION_SECRET)}
function getPool(){if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='disable'?false:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:5000});return pool}
const key=()=>new TextEncoder().encode(process.env.SESSION_SECRET||'');
const fail=(res,status,error)=>res.status(status).json({error});
function sameOrigin(req){try{const origin=req.headers.origin;if(!origin)return true;const o=new URL(origin);return o.host===req.headers.host&&o.protocol==='https:'}catch{return false}}
function safeEq(a,b){if(!a||!b)return false;const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
function cookie(req){const raw=req.headers.cookie||'';const found=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(KEY+'='));return found?decodeURIComponent(found.slice(KEY.length+1)):''}
function makeCookie(token,maxAge){return KEY+'='+encodeURIComponent(token||'')+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge}
async function session(req){const token=cookie(req);if(!token)return null;try{const {payload}=await jwtVerify(token,key(),{issuer:'elevate-office',audience:'members'});return payload.sub||null}catch{return null}}
async function jwt(id){return await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setIssuer('elevate-office').setAudience('members').setSubject(id).setIssuedAt().setExpirationTime('7d').sign(key())}
function sanitize(m){return{id:m.id,name:m.name,email:m.email,phone:m.phone,rank:m.rank,isAdmin:m.is_admin,teamId:m.team_id,sponsorId:m.sponsor_id,sponsorCode:m.sponsor_code,approvalStatus:m.approval_status,createdAt:m.created_at}}
function roleDue(rank){return rank==='Member'?0:['Distributor','Manager'].includes(rank)?10000:['Senior Manager','Executive Manager','Director','Emirald Director'].includes(rank)?25000:null}
function validUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&['fiverr.com','www.fiverr.com'].includes(u.hostname)&&/^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)}catch{return false}}
const statuses=['Member','Distributor','Manager','Senior Manager','Executive Manager','Director','Emirald Director'];

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const action=String(req.query.action||'');
 if(req.method==='GET'&&action==='status')return res.status(200).json({configured:configured()&&key().length>=32,backend:'Custom Node.js + PostgreSQL'});
 if(!configured()||key().length<32)return fail(res,503,'Backend setup required. Configure DATABASE_URL and SESSION_SECRET on Vercel.');
 if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed');
 if(req.method==='POST'&&(!sameOrigin(req)||!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')))return fail(res,403,'Invalid request origin or content type');
 try{
  const db=getPool(),body=req.body&&typeof req.body==='object'?req.body:{};
  if(action==='health'&&req.method==='GET'){
    const result=await db.query("select current_database() as name, to_regclass('public.members') is not null as members_ready, to_regclass('public.payments') is not null as payments_ready");
    return res.status(200).json({database:'connected',schemaReady:!!(result.rows[0]?.members_ready&&result.rows[0]?.payments_ready)});
  }
  if(action==='register'&&req.method==='POST'){
   const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
   if(name.length<2||name.length>90||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||password.length<12||password.length>128)return fail(res,400,'Provide your name, a valid email and a password of at least 12 characters.');
   const adminRequested=Boolean(body.adminSetupKey);
   if(adminRequested&&!process.env.ADMIN_SETUP_KEY)return fail(res,403,'Administrator bootstrap is disabled.');
   if(adminRequested&&!safeEq(body.adminSetupKey,process.env.ADMIN_SETUP_KEY))return fail(res,403,'Invalid administrator setup key.');
   const count=await db.query('select count(*)::int as n from members where is_admin=true');
   const admin=adminRequested&&count.rows[0].n===0;
   if(adminRequested&&!admin)return fail(res,403,'An administrator already exists. Ask the administrator to grant access.');
   let sponsorId=null;
   if(body.sponsorCode){
    const sponsor=await db.query("select id from members where sponsor_code=$1 and approval_status='approved'",[String(body.sponsorCode).toUpperCase().trim()]);
    if(!sponsor.rowCount)return fail(res,400,'Sponsor code was not found.');
    sponsorId=sponsor.rows[0].id;
   }
   const hash=await bcrypt.hash(password,12);
   let created;
   try{created=await db.query('insert into members(name,email,password_hash,sponsor_id,is_admin,approval_status) values ($1,$2,$3,$4,$5,$6) returning id,name,email,phone,rank,is_admin,team_id,sponsor_id,sponsor_code,approval_status,created_at',[name,email,hash,sponsorId,admin,admin?'approved':'pending'])}
   catch(e){if(e.code==='23505')return fail(res,409,'This email address is already registered.');throw e}
   if(admin)res.setHeader('Set-Cookie',makeCookie(await jwt(created.rows[0].id),604800));
   return res.status(201).json({member:sanitize(created.rows[0]),pendingApproval:!admin,message:admin?'Administrator account created.':'Registration submitted. An administrator must approve your account before you can sign in.'});
  }
  if(action==='login'&&req.method==='POST'){
   const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
   if(email.length>254||password.length>128)return fail(res,401,'Invalid email or password.');
   const lock=await db.query('select failures,locked_until from auth_attempts where email=$1',[email]);
   if(lock.rows[0]?.locked_until&&new Date(lock.rows[0].locked_until)>new Date())return fail(res,429,'Too many attempts. Try again later.');
   const found=await db.query('select id,password_hash,approval_status from members where email=$1',[email]);
   // Constant-time slow verification even if email is unknown.
   const dummy='$2b$12$0T0I2pCdHTCzgZV0Wlku9e3QiVJ8Q6yvHdZ8Cl2mmzqNwbTFTg6cC';
   const ok=await bcrypt.compare(password,found.rows[0]?.password_hash||dummy);
   if(!ok){
    await db.query(`insert into auth_attempts(email,failures,locked_until) values($1,1,null) on conflict(email) do update set failures=case when auth_attempts.updated_at<now()-interval '1 hour' then 1 else auth_attempts.failures+1 end,locked_until=case when auth_attempts.failures>=4 and auth_attempts.updated_at>now()-interval '1 hour' then now()+interval '15 minutes' else null end,updated_at=now()`,[email]);
    return fail(res,401,'Invalid email or password.');
   }
   await db.query('delete from auth_attempts where email=$1',[email]);
   if(found.rows[0].approval_status!=='approved')return fail(res,403,found.rows[0].approval_status==='pending'?'Account pending administrator approval.':'This registration was rejected. Contact your office administrator.');
   res.setHeader('Set-Cookie',makeCookie(await jwt(found.rows[0].id),604800));
   return res.status(200).json({ok:true});
  }
  if(action==='logout'&&req.method==='POST'){res.setHeader('Set-Cookie',makeCookie('',0));return res.status(200).json({ok:true})}
  const uid=await session(req);
  if(!uid)return fail(res,401,'Please sign in.');
  const self=await db.query('select id,name,email,phone,rank,is_admin,team_id,sponsor_id,sponsor_code,approval_status,created_at from members where id=$1',[uid]);
  if(!self.rowCount)return fail(res,401,'Account not found.');
  const m=self.rows[0];
  if(m.approval_status!=='approved')return fail(res,403,'Your account is not approved. Contact an office administrator.');
  if(action==='me'&&req.method==='GET'){
   const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit'}).formatToParts(new Date()),yy=month.find(x=>x.type==='year').value,mm=month.find(x=>x.type==='month').value,period=yy+'-'+mm+'-01';
   const [team,sponsor,direct,downlines,accounts,payments,attendance,override,paid]=await Promise.all([
    db.query('select name from teams where id=$1',[m.team_id]),
    db.query('select name from members where id=$1',[m.sponsor_id]),
    db.query('select id,name,rank from members where sponsor_id=$1 order by name',[uid]),
    db.query(`with recursive children as (select id,sponsor_id,array[id] as path from members where sponsor_id=$1 union all select m.id,m.sponsor_id,c.path||m.id from members m join children c on m.sponsor_id=c.id where not m.id=any(c.path)) select count(distinct id)::int as total from children`,[uid]),
    db.query('select id,label,url from member_fiverr_accounts where member_id=$1 order by created_at desc',[uid]),
    db.query('select paid_on,for_month,amount,notes from payments where member_id=$1 order by paid_on desc limit 40',[uid]),
    db.query('select checked_at from attendance_records where member_id=$1 order by checked_at desc limit 10',[uid]),
    db.query('select amount from monthly_responsibilities where member_id=$1 and month=$2',[uid,period]),
    db.query('select coalesce(sum(amount),0) as total from payments where member_id=$1 and for_month=$2',[uid,period])
   ]);
   const expected=override.rows[0]?.amount??roleDue(m.rank),received=Number(paid.rows[0].total);
   return res.status(200).json({member:sanitize(m),teamName:team.rows[0]?.name||null,sponsorName:sponsor.rows[0]?.name||null,directDownlines:direct.rows,totalDownlines:downlines.rows[0].total,accounts:accounts.rows,payments:payments.rows,attendance:attendance.rows,month:yy+'-'+mm,expected:expected===null?null:Number(expected),received,outstanding:expected===null?null:Math.max(0,Number(expected)-received)});
  }
  if(action==='profile'&&req.method==='POST'){
   const name=String(body.name||'').trim(),phone=String(body.phone||'').trim();
   if(name.length<2||name.length>90||phone.length>30)return fail(res,400,'Name or phone number is invalid.');
   await db.query('update members set name=$2,phone=$3 where id=$1',[uid,name,phone]);
   return res.json({ok:true});
  }
  if(action==='fiverr-add'&&req.method==='POST'){
   const label=String(body.label||'').trim(),url=String(body.url||'').trim();
   if(!label||label.length>80||!validUrl(url))return fail(res,400,'Enter a label and public Fiverr profile URL.');
   try{const result=await db.query('insert into member_fiverr_accounts(member_id,label,url) values($1,$2,$3) returning id,label,url',[uid,label,url]);return res.status(201).json({account:result.rows[0]})}catch(e){if(e.code==='23505')return fail(res,409,'This Fiverr profile is already saved.');throw e}
  }
  if(action==='fiverr-delete'&&req.method==='POST'){const id=String(body.id||'');if(!/^[0-9a-f-]{36}$/i.test(id))return fail(res,400,'Invalid account ID.');await db.query('delete from member_fiverr_accounts where id=$1 and member_id=$2',[id,uid]);return res.json({ok:true})}
  if(action==='sponsor'&&req.method==='POST'){
   if(m.sponsor_id)return fail(res,409,'Sponsor is already assigned.');
   const code=String(body.sponsorCode||'').trim().toUpperCase(),sponsor=await db.query('select id from members where sponsor_code=$1 and approval_status='approved'',[code]);
   if(!sponsor.rowCount||sponsor.rows[0].id===uid)return fail(res,400,'Sponsor code invalid.');
   const candidate=sponsor.rows[0].id;
   const cyc=await db.query(`with recursive chain as (select id,sponsor_id,array[id] path from members where id=$1 union all select m.id,m.sponsor_id,chain.path||m.id from members m join chain on m.id=chain.sponsor_id where not m.id=any(chain.path)) select 1 from chain where id=$2 limit 1`,[candidate,uid]);
   if(cyc.rowCount)return fail(res,400,'Circular sponsorship is not allowed.');
   const changed=await db.query('update members set sponsor_id=$2 where id=$1 and sponsor_id is null returning id',[uid,candidate]);
   if(!changed.rowCount)return fail(res,409,'Sponsor is already assigned.');
   return res.json({ok:true});
  }
  if(action==='team-list'&&req.method==='GET'){const list=await db.query('select id,name,leader_id from teams order by name');return res.json({teams:list.rows})}
  if(!m.is_admin)return fail(res,403,'Administrator access required.');
  if(action==='admin-pending'&&req.method==='GET'){
   const rows=await db.query("select id,name,email,rank,sponsor_id,created_at from members where approval_status='pending' order by created_at asc limit 200");
   return res.json({requests:rows.rows});
  }
  if(action==='admin-review'&&req.method==='POST'){
   const id=String(body.id||''),decision=String(body.decision||'');
   if(!/^[0-9a-f-]{36}$/i.test(id)||!['approved','rejected'].includes(decision))return fail(res,400,'Invalid approval decision.');
   if(id===uid)return fail(res,400,'You cannot review your own administrator account.');
   const result=await db.query("update members set approval_status=$2,reviewed_by=$3,reviewed_at=now() where id=$1 and approval_status='pending' returning id,name,email,approval_status",[id,decision,uid]);
   if(!result.rowCount)return fail(res,409,'This application has already been reviewed or was not found.');
   return res.json({member:result.rows[0]});
  }
  if(action==='admin-members'&&req.method==='GET'){
   const rows=await db.query("select id,name,email,rank,team_id,sponsor_id,approval_status,created_at from members where approval_status='approved' order by created_at desc limit 500");
   return res.json({members:rows.rows});
  }
  if(action==='admin-rank'&&req.method==='POST'){
   const {id,rank,teamId}=body;if(!statuses.includes(rank))return fail(res,400,'Invalid office rank.');
   if(!/^[0-9a-f-]{36}$/i.test(String(id)))return fail(res,400,'Invalid member ID.');
   if(teamId&& !/^[0-9a-f-]{36}$/i.test(String(teamId)))return fail(res,400,'Invalid team.');
   await db.query('update members set rank=$2,team_id=$3 where id=$1',[id,rank,teamId||null]);return res.json({ok:true});
  }
  if(action==='admin-team'&&req.method==='POST'){
   const name=String(body.name||'').trim();if(name.length<2||name.length>90)return fail(res,400,'Invalid team name.');
   const r=await db.query('insert into teams(name) values($1) returning id,name',[name]);return res.status(201).json({team:r.rows[0]});
  }
  if(action==='admin-payment'&&req.method==='POST'){
   const id=String(body.memberId||''),amount=Number(body.amount),paidOn=String(body.paidOn||''),forMonth=String(body.forMonth||''),notes=String(body.notes||'').trim();
   if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isFinite(amount)||amount<=0||amount>100000000||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(paidOn)||!/^[0-9]{4}-[0-9]{2}$/.test(forMonth)||notes.length>300)return fail(res,400,'Invalid payment data.');
   const r=await db.query('insert into payments(member_id,amount,paid_on,for_month,notes,recorded_by) values($1,$2,$3,$4,$5,$6) returning id',[id,Math.round(amount*100)/100,paidOn,forMonth+'-01',notes,uid]);return res.status(201).json({id:r.rows[0].id});
  }
  return fail(res,404,'Unknown action');
 }catch(e){console.error('Backend error',e.code||e.name||'Error');return fail(res,500,'Server or database error. Check deployment configuration and database migrations.')}
}

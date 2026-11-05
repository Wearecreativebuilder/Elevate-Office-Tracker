import pg from 'pg';
import bcrypt from 'bcryptjs';
import {SignJWT,jwtVerify} from 'jose';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

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
function namedSponsorCode(name,id){const first=String(name).trim().replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i,'').split(/\s+/)[0].replace(/[^A-Za-z0-9]/g,'').slice(0,7).toUpperCase()||'MEMBER';return first+'-'+id.replace(/-/g,'').slice(0,12).toUpperCase()}
function roleDue(rank){return rank==='Member'?0:['Distributor','Manager'].includes(rank)?10000:['Senior Manager','Executive Manager','Director','Emirald Director'].includes(rank)?25000:null}
function responsibility(expected,received){return expected===null?{status:'not_configured',required:false}:Number(expected)===0?{status:'exempt',required:false}:Number(received)>=Number(expected)?{status:'paid',required:true}:{status:Number(received)>0?'partially_paid':'due',required:true}}
function validUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&['fiverr.com','www.fiverr.com'].includes(u.hostname)&&/^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)}catch{return false}}
const statuses=['Member','Distributor','Manager','Senior Manager','Executive Manager','Director','Emirald Director'];
const attendanceClock=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return {date:p.year+'-'+p.month+'-'+p.day,day:p.weekday,minutes:Number(p.hour)*60+Number(p.minute)}};
function attendanceWindow(t){const start=t.day==='Fri'?870:690;return !['Sat','Sun'].includes(t.day)&&t.minutes>=start&&t.minutes<960}
function distanceMeters(a,b,c,d){const rad=Math.PI/180,R=6371000,dl=(c-a)*rad,dn=(d-b)*rad,x=Math.sin(dl/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dn/2)**2;return R*2*Math.asin(Math.min(1,Math.sqrt(x)))}
function validPosition(data){const lat=Number(data.latitude),lng=Number(data.longitude),accuracy=Number(data.accuracy);return Object.hasOwn(data,'latitude')&&Object.hasOwn(data,'longitude')&&Object.hasOwn(data,'accuracy')&&Number.isFinite(lat)&&Number.isFinite(lng)&&Number.isFinite(accuracy)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180&&accuracy>0&&accuracy<=100000?{lat,lng,accuracy}:null}
function locationResult(settings,coords){const hasOffice=settings.office_lat!==null&&settings.office_lng!==null;const d=hasOffice?distanceMeters(Number(settings.office_lat),Number(settings.office_lng),coords.lat,coords.lng):null;const within=d!==null&&d<=Number(settings.radius_m)&&coords.accuracy<=Math.max(100,Number(settings.radius_m));return {distanceMeters:d===null?null:Math.round(d*10)/10,withinRadius:hasOffice?within:null,locationStatus:!hasOffice?'location_captured':within?'within_configured_radius':'outside_or_inaccurate'};}


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
   const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||''),requestedRank=String(body.officeStatus||'').trim();
   if(name.length<2||name.length>90||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||password.length<12||password.length>128)return fail(res,400,'Provide your name, a valid email and a password of at least 12 characters.');
   if(!statuses.includes(requestedRank))return fail(res,400,'Please choose a valid office status before registering.');
   const adminRequested=Boolean(body.adminSetupKey);
   if(adminRequested&&!process.env.ADMIN_SETUP_KEY)return fail(res,403,'Administrator bootstrap is disabled.');
   if(adminRequested&&!safeEq(body.adminSetupKey,process.env.ADMIN_SETUP_KEY))return fail(res,403,'Invalid administrator setup key.');
   const count=await db.query('select count(*)::int as n from members where is_admin=true');
   const admin=adminRequested&&count.rows[0].n===0;
   if(adminRequested&&!admin)return fail(res,403,'An administrator already exists. Ask the administrator to grant access.');
   let sponsorId=null;
   if(body.sponsorCode){
    const sponsor=await db.query("select id from members where approval_status='approved' and (sponsor_code=$1 or id in (select member_id from sponsor_code_aliases where code=$1))",[String(body.sponsorCode).toUpperCase().trim()]);
    if(!sponsor.rowCount)return fail(res,400,'Sponsor code was not found.');
    sponsorId=sponsor.rows[0].id;
   }
   const hash=await bcrypt.hash(password,12),newId=randomUUID(),newSponsorCode=namedSponsorCode(name,newId);
   let created;
   try{created=await db.query('insert into members(id,name,email,password_hash,sponsor_id,is_admin,approval_status,sponsor_code,requested_rank) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id,name,email,phone,rank,requested_rank,is_admin,team_id,sponsor_id,sponsor_code,approval_status,created_at',[newId,name,email,hash,sponsorId,admin,admin?'approved':'pending',newSponsorCode,requestedRank])}
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

  if(action.startsWith('attendance-')){
   const settingsResult=await db.query('select id,office_lat,office_lng,radius_m,schedule_enforced,test_mode,live_since,office_address from attendance_settings where id=1');
   if(!settingsResult.rowCount)return fail(res,503,'Attendance configuration has not been initialized.');
   const settings=settingsResult.rows[0],clock=attendanceClock();
   const config={officeConfigured:settings.office_lat!==null&&settings.office_lng!==null,radiusMeters:settings.radius_m,scheduleEnforced:settings.schedule_enforced,testMode:settings.test_mode,officeLatitude:settings.office_lat,officeLongitude:settings.office_lng,officeTimeZone:'Africa/Lagos',liveSince:settings.live_since,officeAddress:settings.office_address,liveReady:!settings.test_mode&&settings.schedule_enforced&&settings.office_lat!==null&&settings.office_lng!==null};
   if(action==='attendance-calendar-members'&&req.method==='GET'){
    if(!m.is_admin)return fail(res,403,'Administrator access required.');
    const r=await db.query("select id,name from members where approval_status='approved' order by name limit 1000");
    return res.json({members:r.rows});
   }
   if(action==='attendance-calendar'&&req.method==='GET'){
    const currentMonth=clock.date.slice(0,7),month=String(req.query.month||currentMonth);
    if(!/^\d{4}-\d{2}$/.test(month)||Number(month.slice(5))<1||Number(month.slice(5))>12)return fail(res,400,'Choose a valid calendar month.');
    const target=req.query.memberId?String(req.query.memberId):uid;
    if(target!==uid&&!m.is_admin)return fail(res,403,'Only administrators can view another member calendar.');
    if(!/^[0-9a-f-]{36}$/i.test(target))return fail(res,400,'Invalid member.');
    const who=await db.query('select name,created_at,reviewed_at from members where id=$1 and approval_status=$2',[target,'approved']);
    if(!who.rowCount)return fail(res,404,'Member not found.');
    const data=await db.query("select office_date,checked_at,is_test from attendance_records where member_id=$1 and office_date >= $2::date and office_date < ($2::date + interval '1 month') and kind='checkin' order by office_date",[target,month+'-01']);
    const approved=who.rows[0].reviewed_at||who.rows[0].created_at;
    const approvedDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(approved);
    const o=Object.fromEntries(approvedDate.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return res.json({month,officeDate:clock.date,officeMinutes:clock.minutes,timeZone:'Africa/Lagos',memberName:who.rows[0].name,memberId:target,approvedDate:o.year+'-'+o.month+'-'+o.day,liveSince:settings.live_since,liveMode:!settings.test_mode&&config.officeConfigured&&settings.schedule_enforced,records:data.rows});
   }
   if(action==='attendance-daily'&&req.method==='GET'){
    const date=clock.date;
    const [rows,history]=await Promise.all([
     db.query("select kind,checked_at,is_test,location_status,accuracy_m,distance_m from attendance_records where member_id=$1 and office_date=$2 order by checked_at",[uid,date]),
     db.query("select office_date, min(checked_at) filter (where kind='checkin') as checkin_at, max(checked_at) filter (where kind='checkout') as checkout_at, bool_or(is_test) as is_test from attendance_records where member_id=$1 group by office_date order by office_date desc limit 14",[uid])
    ]);
    const entry=rows.rows.find(x=>x.kind==='checkin')||null,exit=rows.rows.find(x=>x.kind==='checkout')||null;
    return res.json({date,timeZone:'Africa/Lagos',checkin:entry,checkout:exit,status:exit?'checked_out':entry?'checked_in':'not_checked_in',history:history.rows,mode:settings.test_mode?'test':'live'});
   }
   if(action==='attendance-admin-daily'&&req.method==='GET'){
    if(!m.is_admin)return fail(res,403,'Administrator access required.');
    const requested=req.query.date?String(req.query.date):clock.date;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(requested)||!Number.isFinite(Date.parse(requested+'T00:00:00Z'))||new Date(requested+'T00:00:00Z').toISOString().slice(0,10)!==requested)return fail(res,400,'Enter a valid date (YYYY-MM-DD).');
    const roster=await db.query(`select m.id,m.name,m.email,m.rank,
      ci.checked_at as checkin_at,ci.is_test as checkin_test,ci.location_status as checkin_location_status,
      co.checked_at as checkout_at,co.is_test as checkout_test,
      case when co.id is not null then 'checked_out' when ci.id is not null then 'checked_in' else 'not_checked_in' end as status
      from members m
      left join attendance_records ci on ci.member_id=m.id and ci.office_date=$1 and ci.kind='checkin'
      left join attendance_records co on co.member_id=m.id and co.office_date=$1 and co.kind='checkout'
      where m.approval_status='approved'
      order by case when ci.id is not null then 0 else 1 end,m.name`,[requested]);
    const members=roster.rows,checkedIn=members.filter(x=>x.checkin_at).length,checkedOut=members.filter(x=>x.checkout_at).length;
    return res.json({date:requested,timeZone:'Africa/Lagos',testMode:settings.test_mode,totals:{approvedMembers:members.length,checkedIn,checkedOut,notCheckedIn:members.length-checkedIn,testCheckins:members.filter(x=>x.checkin_at&&x.checkin_test).length},members});
   }
   if(action==='attendance-info'&&req.method==='GET'){
    const mine=await db.query("select id,kind,checked_at,office_date,accuracy_m,distance_m,within_radius,is_test,location_status from attendance_records where member_id=$1 order by checked_at desc limit 40",[uid]);
    return res.json({config,windowOpen:attendanceWindow(clock),officeDate:clock.date,records:mine.rows,member:{name:m.name,isAdmin:m.is_admin}});
   }
   if(action==='attendance-location-test'&&req.method==='POST'){
    const coords=validPosition(body);if(!coords)return fail(res,400,'Share a valid GPS reading and accuracy.');
    return res.json({ok:true,captured:true,accuracyMeters:coords.accuracy,...locationResult(settings,coords),testOnly:true,message:'GPS reading captured for testing; device location is not independently authenticated.'});
   }
   if(['attendance-checkin','attendance-checkout'].includes(action)&&req.method==='POST'){
    const coords=validPosition(body);if(!coords)return fail(res,400,'Valid GPS position and accuracy are required.');
    if(settings.schedule_enforced&&!attendanceWindow(clock))return fail(res,403,'Sign in is closed. Office hours are Monday–Thursday, 11:30 AM–4:00 PM, and Friday, 2:30 PM–4:00 PM (Nigeria time). Weekends are closed.');
    const verdict=locationResult(settings,coords);
    if(!settings.test_mode){
     if(!config.officeConfigured)return fail(res,409,'Office location has not been set up. Please contact your office administrator before signing in.');
     if(!verdict.withinRadius)return fail(res,403,'Sign in failed: your device is outside the allowed office area or the GPS signal is too inaccurate. '+(verdict.distanceMeters===null?'':('Detected distance: '+Math.round(verdict.distanceMeters)+' m. Office limit: '+settings.radius_m+' m. '))+'Move closer to the office and enable precise location.');
    }
    const kind=action==='attendance-checkout'?'checkout':'checkin';
    if(kind==='checkout'){
     const prior=await db.query("select 1 from attendance_records where member_id=$1 and office_date=$2 and kind='checkin' limit 1",[uid,clock.date]);
     if(!prior.rowCount)return fail(res,409,'Check in before checking out.');
    }
    try{
     const created=await db.query("insert into attendance_records(member_id,checked_at,office_date,kind,latitude,longitude,accuracy_m,distance_m,within_radius,is_test,location_status) values($1,now(),$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id,kind,checked_at,office_date,accuracy_m,distance_m,within_radius,is_test,location_status",[uid,clock.date,kind,coords.lat,coords.lng,coords.accuracy,verdict.distanceMeters,verdict.withinRadius,settings.test_mode,verdict.locationStatus]);
     return res.status(201).json({record:created.rows[0],message:settings.test_mode?'Test sign-in saved. This is not verified attendance.':kind==='checkin'?'Sign in successful! Your attendance has been recorded.':'Sign out successful! Your departure has been recorded.'});
    }catch(e){if(e.code==='23505')return fail(res,409,'You already recorded this attendance action today.');throw e}
   }
   if(!m.is_admin)return fail(res,403,'Administrator access required.');
   if(action==='attendance-admin'&&req.method==='GET'){
    const rows=await db.query("select a.id,a.kind,a.checked_at,a.office_date,a.accuracy_m,a.distance_m,a.within_radius,a.is_test,a.location_status,m.name,m.email from attendance_records a join members m on m.id=a.member_id order by a.checked_at desc limit 300");
    return res.json({config,records:rows.rows});
   }
   if(action==='attendance-settings'&&req.method==='POST'){
    const lat=body.officeLatitude,lng=body.officeLongitude;
    const cleared=(lat===null||lat==='')&&(lng===null||lng==='');
    const coords=cleared?null:validPosition({latitude:lat,longitude:lng,accuracy:1});
    if(!cleared&&!coords)return fail(res,400,'Set valid office latitude and longitude together.');
    const radius=Number(body.radiusMeters);
    if(!Number.isInteger(radius)||radius<20||radius>2000||typeof body.scheduleEnforced!=='boolean'||typeof body.testMode!=='boolean')return fail(res,400,'Set a radius of 20–2000 metres and valid attendance mode switches.');
    if(!body.testMode&&!coords)return fail(res,400,'Set the office GPS coordinates before enabling live attendance.');
    if(!body.testMode&&!body.scheduleEnforced)return fail(res,400,'Enable office hours when switching to live attendance.');
    const updated=await db.query("update attendance_settings set office_lat=$1,office_lng=$2,radius_m=$3,schedule_enforced=$4,test_mode=$5,live_since=case when $5::boolean=false and $1::double precision is not null and $2::double precision is not null and live_since is null then (now() at time zone 'Africa/Lagos')::date else live_since end,updated_at=now(),updated_by=$6 where id=1 returning id",[coords?.lat??null,coords?.lng??null,radius,body.scheduleEnforced,body.testMode,uid]);
    if(!updated.rowCount)return fail(res,503,'Attendance settings unavailable.');
    return res.json({ok:true});
   }
   return fail(res,404,'Unknown attendance action.');
  }
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
   const expected=override.rows[0]?.amount??roleDue(m.rank),received=Number(paid.rows[0].total),canViewFinance=m.is_admin||roleDue(m.rank)!==0;
   return res.status(200).json({member:sanitize(m),teamName:team.rows[0]?.name||null,sponsorName:sponsor.rows[0]?.name||null,directDownlines:direct.rows,totalDownlines:downlines.rows[0].total,accounts:accounts.rows,payments:canViewFinance?payments.rows:[],attendance:attendance.rows,month:yy+'-'+mm,canViewFinance,expected:canViewFinance?(expected===null?null:Number(expected)):null,received:canViewFinance?received:null,outstanding:canViewFinance?(expected===null?null:Math.max(0,Number(expected)-received)):null,responsibility:canViewFinance?responsibility(expected,received):null,responsibilitySource:canViewFinance?(override.rowCount?'monthly_override':'office_rank'):null});
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
   const code=String(body.sponsorCode||'').trim().toUpperCase();
   if(code.length<3||code.length>20)return fail(res,400,'Enter a valid sponsor code.');
   const client=await db.connect();
   try{
    await client.query('begin');
    // Serialize sponsorship changes to avoid simultaneous edits forming a referral loop.
    await client.query('select pg_advisory_xact_lock(748201)');
    const self=await client.query('select id,sponsor_id from members where id=$1 and approval_status=$2 for update',[uid,'approved']);
    if(!self.rowCount){await client.query('rollback');return fail(res,403,'Approved account required.')}
    const target=await client.query("select id,name from members where approval_status='approved' and (sponsor_code=$1 or id in (select member_id from sponsor_code_aliases where code=$1))",[code]);
    if(!target.rowCount){await client.query('rollback');return fail(res,404,'Sponsor code was not found. Check the code and try again.')}
    const candidate=target.rows[0];
    if(candidate.id===uid){await client.query('rollback');return fail(res,400,'You cannot be your own sponsor.')}
    if(self.rows[0].sponsor_id===candidate.id){await client.query('rollback');return fail(res,409,'This sponsor is already assigned to your account.')}
    const cyc=await client.query(`with recursive chain as (
     select id,sponsor_id,array[id] path from members where id=$1
     union all
     select m.id,m.sponsor_id,chain.path||m.id from members m join chain on m.id=chain.sponsor_id where not m.id=any(chain.path)
    ) select 1 from chain where id=$2 limit 1`,[candidate.id,uid]);
    if(cyc.rowCount){await client.query('rollback');return fail(res,409,'You cannot select one of your own downlines as sponsor.')}
    await client.query('update members set sponsor_id=$2 where id=$1',[uid,candidate.id]);
    await client.query('insert into sponsor_change_history(member_id,old_sponsor_id,new_sponsor_id) values($1,$2,$3)',[uid,self.rows[0].sponsor_id,candidate.id]);
    await client.query('commit');
    return res.json({ok:true,sponsorName:candidate.name,message:'Your sponsor has been updated successfully.'});
   }catch(e){await client.query('rollback');throw e}finally{client.release()}
  }

  if(action==='my-due-submissions'&&req.method==='GET'){
   if(roleDue(m.rank)===0)return fail(res,403,'Financial dues are available to Distributor rank and above.');
   const r=await db.query("select id,for_month,paid_on,amount,payment_reference,note,status,submitted_at,reviewed_at,review_note from member_due_submissions where member_id=$1 order by submitted_at desc limit 100",[uid]);
   return res.json({submissions:r.rows});
  }
  if(action==='due-submit'&&req.method==='POST'){
   if(roleDue(m.rank)===0)return fail(res,403,'Financial dues are available to Distributor rank and above.');
   const month=String(body.month||''),date=String(body.paidOn||''),amount=Number(body.amount),reference=String(body.reference||'').trim(),note=String(body.note||'').trim();
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>attendanceClock().date||!Number.isFinite(amount)||amount<=0||amount>100000000||reference.length<4||reference.length>120||note.length>300)return fail(res,400,'Enter a valid month, past payment date, amount, and transaction reference.');
   const ov=await db.query('select amount from monthly_responsibilities where member_id=$1 and month=$2::date',[uid,month+'-01']);
   const due=ov.rowCount?Number(ov.rows[0].amount):roleDue(m.rank);
   if(due===null||due<=0)return fail(res,403,'No dues are required for this period. Contact the office administrator.');
   try{
    const r=await db.query("insert into member_due_submissions(member_id,for_month,paid_on,amount,payment_reference,note) values($1,$2::date,$3::date,$4,$5,$6) returning id,status,submitted_at",[uid,month+'-01',date,Math.round(amount*100)/100,reference,note]);
    return res.status(201).json({submission:r.rows[0],message:'Submission pending administrator approval. Your balance is unchanged until it is confirmed.'});
   }catch(e){if(e.code==='23505')return fail(res,409,'A payment with this reference is already pending or approved.');throw e}
  }
  if(action==='office-financial-summary'&&req.method==='GET'){
   if(!m.is_admin&&roleDue(m.rank)===0)return fail(res,403,'Office finances are available to Distributor rank and above.');
   const part=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit'}).formatToParts(new Date());
   const year=part.find(x=>x.type==='year').value,month=part.find(x=>x.type==='month').value,period=year+'-'+month+'-01';
   const [r,ov,verified]=await Promise.all([
    db.query("select coalesce(sum(amount),0) as received from payments"),
    db.query('select amount from monthly_responsibilities where member_id=$1 and month=$2::date',[uid,period]),
    db.query("select coalesce(sum(amount),0) as member_paid from payments where member_id=$1 and for_month=$2::date",[uid,period])
   ]);
   const expected=ov.rowCount?Number(ov.rows[0].amount):roleDue(m.rank),paid=Number(verified.rows[0].member_paid);
   return res.json({month:year+'-'+month,totalVerifiedContributions:Number(r.rows[0].received),myExpected:expected,myPaid:paid,myOutstanding:Math.max(0,(expected||0)-paid),scope:'verified_contributions_only'});
  }
  if(action==='team-list'&&req.method==='GET'){const list=await db.query('select id,name,leader_id from teams order by name');return res.json({teams:list.rows})}
  if(!m.is_admin)return fail(res,403,'Administrator access required.');


  if(action==='admin-due-submissions'&&req.method==='GET'){
   const r=await db.query("select s.id,s.member_id,m.name,m.email,m.rank,s.for_month,s.paid_on,s.amount,s.payment_reference,s.note,s.status,s.submitted_at,s.reviewed_at,s.review_note from member_due_submissions s join members m on m.id=s.member_id order by case when s.status='pending' then 0 else 1 end,s.submitted_at desc limit 250");
   return res.json({submissions:r.rows,pending:r.rows.filter(x=>x.status==='pending').length});
  }
  if(action==='admin-due-review'&&req.method==='POST'){
   const id=String(body.id||''),decision=String(body.decision||''),note=String(body.note||'').trim();
   if(!/^[0-9a-f-]{36}$/i.test(id)||!['approved','rejected'].includes(decision)||note.length>300||(decision==='rejected'&&note.length<6))return fail(res,400,'Provide a valid decision and an explanation for rejected submissions.');
   const client=await db.connect();
   try{
    await client.query('begin');
    const found=await client.query('select id,member_id,amount,paid_on,for_month,payment_reference,note,status from member_due_submissions where id=$1 for update',[id]);
    if(!found.rowCount){await client.query('rollback');return fail(res,404,'Submission not found.')}
    const item=found.rows[0];if(item.status!=='pending'){await client.query('rollback');return fail(res,409,'Submission already reviewed.')}
    let paymentId=null;
    if(decision==='approved'){
     const recorded=await client.query("insert into payments(member_id,amount,paid_on,for_month,notes,recorded_by) values($1,$2,$3,$4,$5,$6) returning id",[item.member_id,item.amount,item.paid_on,item.for_month,('Confirmed submission / Ref: '+item.payment_reference+' / '+item.note).slice(0,300),uid]);
     paymentId=recorded.rows[0].id;
    }
    await client.query('update member_due_submissions set status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4,payment_id=$5 where id=$1',[id,decision,uid,note,paymentId]);
    await client.query('insert into admin_audit_log(admin_id,member_id,action,record_id,old_values,new_values,reason) values($1,$2,$3,$4,$5,$6,$7)',[uid,item.member_id,'monthly_due_review',id,JSON.stringify({status:'pending',amount:item.amount,reference:item.payment_reference}),JSON.stringify({status:decision,paymentId}),note||'Administrator confirmed receipt']);
    await client.query('commit');return res.json({ok:true,status:decision,paymentId});
   }catch(e){await client.query('rollback');throw e}finally{client.release()}
  }
  if(action==='admin-member-details'&&req.method==='GET'){
   const id=String(req.query.id||'');
   if(!/^[0-9a-f-]{36}$/i.test(id))return fail(res,400,'Invalid member identifier.');
   const [member,payments,attendance,accounts,audits]=await Promise.all([
    db.query('select id,name,email,phone,rank,team_id,sponsor_id,sponsor_code,is_admin,approval_status,created_at from members where id=$1',[id]),
    db.query('select id,paid_on,for_month,amount,notes,created_at from payments where member_id=$1 order by paid_on desc limit 100',[id]),
    db.query('select id,office_date,kind,checked_at,is_test,location_status,accuracy_m,distance_m,admin_note from attendance_records where member_id=$1 order by checked_at desc limit 100',[id]),
    db.query('select id,label,url from member_fiverr_accounts where member_id=$1 order by created_at desc limit 50',[id]),
    db.query('select id,action,reason,created_at from admin_audit_log where member_id=$1 order by created_at desc limit 25',[id])
   ]);
   if(!member.rowCount)return fail(res,404,'Member not found.');
   return res.json({member:member.rows[0],payments:payments.rows,attendance:attendance.rows,accounts:accounts.rows,audits:audits.rows});
  }
  if(action==='admin-member-update'&&req.method==='POST'){
   const id=String(body.id||''),name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),phone=String(body.phone||'').trim(),rank=String(body.rank||''),teamId=body.teamId?String(body.teamId):null,reason=String(body.reason||'').trim();
   if(!/^[0-9a-f-]{36}$/i.test(id)||name.length<2||name.length>90||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||phone.length>30||!statuses.includes(rank)||(teamId&&!/^[0-9a-f-]{36}$/i.test(teamId))||reason.length>300)return fail(res,400,'Invalid member update.');
   const client=await db.connect();
   try{
    await client.query('begin');
    const before=await client.query('select id,name,email,phone,rank,team_id,is_admin from members where id=$1 for update',[id]);
    if(!before.rowCount){await client.query('rollback');return fail(res,404,'Member not found.')}
    if(teamId){const t=await client.query('select id from teams where id=$1',[teamId]);if(!t.rowCount){await client.query('rollback');return fail(res,400,'Team not found.')}}
    const after=await client.query('update members set name=$2,email=$3,phone=$4,rank=$5,team_id=$6 where id=$1 returning id,name,email,phone,rank,team_id,is_admin',[id,name,email,phone,rank,teamId]);
    await client.query('insert into admin_audit_log(admin_id,member_id,action,record_id,old_values,new_values,reason) values($1,$2,$3,$4,$5,$6,$7)',[uid,id,'member_update',id,JSON.stringify(before.rows[0]),JSON.stringify(after.rows[0]),reason]);
    await client.query('commit');
    return res.json({member:after.rows[0]});
   }catch(e){await client.query('rollback');if(e.code==='23505')return fail(res,409,'This email is already in use.');throw e}finally{client.release()}
  }
  if(action==='admin-payment-correct'&&req.method==='POST'){
   const id=String(body.id||''),amount=Number(body.amount),paidOn=String(body.paidOn||''),forMonth=String(body.forMonth||''),notes=String(body.notes||'').trim(),reason=String(body.reason||'').trim();
   if(!/^[0-9a-f-]{36}$/i.test(id)||!Number.isFinite(amount)||amount<=0||amount>100000000||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(paidOn)||!/^[0-9]{4}-[0-9]{2}$/.test(forMonth)||notes.length>300||reason.length<8||reason.length>300)return fail(res,400,'Enter valid payment details and a correction reason of at least eight characters.');
   const client=await db.connect();
   try{
    await client.query('begin');
    const old=await client.query('select id,member_id,amount,paid_on,for_month,notes from payments where id=$1 for update',[id]);
    if(!old.rowCount){await client.query('rollback');return fail(res,404,'Payment not found.')}
    const updated=await client.query('update payments set amount=$2,paid_on=$3,for_month=$4,notes=$5 where id=$1 returning id,member_id,amount,paid_on,for_month,notes',[id,Math.round(amount*100)/100,paidOn,forMonth+'-01',notes]);
    await client.query('insert into admin_audit_log(admin_id,member_id,action,record_id,old_values,new_values,reason) values($1,$2,$3,$4,$5,$6,$7)',[uid,old.rows[0].member_id,'payment_correction',id,JSON.stringify(old.rows[0]),JSON.stringify(updated.rows[0]),reason]);
    await client.query('commit');return res.json({payment:updated.rows[0]});
   }catch(e){await client.query('rollback');throw e}finally{client.release()}
  }
  if(action==='admin-attendance-note'&&req.method==='POST'){
   const id=String(body.id||''),note=String(body.note||'').trim();
   if(!/^[0-9a-f-]{36}$/i.test(id)||note.length<8||note.length>300)return fail(res,400,'Provide an attendance correction note of 8–300 characters.');
   const client=await db.connect();
   try{
    await client.query('begin');
    const previous=await client.query('select id,member_id,admin_note from attendance_records where id=$1 for update',[id]);
    if(!previous.rowCount){await client.query('rollback');return fail(res,404,'Attendance record not found.')}
    const after=await client.query('update attendance_records set admin_note=$2 where id=$1 returning id,member_id,admin_note',[id,note]);
    await client.query('insert into admin_audit_log(admin_id,member_id,action,record_id,old_values,new_values,reason) values($1,$2,$3,$4,$5,$6,$7)',[uid,previous.rows[0].member_id,'attendance_note',id,JSON.stringify(previous.rows[0]),JSON.stringify(after.rows[0]),note]);
    await client.query('commit');return res.json({record:after.rows[0]});
   }catch(e){await client.query('rollback');throw e}finally{client.release()}
  }
  if(action==='admin-pending'&&req.method==='GET'){
   const rows=await db.query("select id,name,email,rank,requested_rank,sponsor_id,created_at from members where approval_status='pending' order by created_at asc limit 200");
   return res.json({requests:rows.rows});
  }
  if(action==='admin-review'&&req.method==='POST'){
   const id=String(body.id||''),decision=String(body.decision||''),rank=decision==='approved'?String(body.rank||'Member'):'Member';
   if(decision==='approved'&&!statuses.includes(rank))return fail(res,400,'Choose a valid office status before approving.');
   if(!/^[0-9a-f-]{36}$/i.test(id)||!['approved','rejected'].includes(decision))return fail(res,400,'Invalid approval decision.');
   if(id===uid)return fail(res,400,'You cannot review your own administrator account.');
   const result=await db.query("update members set approval_status=$2,rank=case when $2::varchar='approved' then $4::varchar else rank end,reviewed_by=$3,reviewed_at=now() where id=$1 and approval_status='pending' returning id,name,email,rank,approval_status",[id,decision,uid,rank]);
   if(!result.rowCount)return fail(res,409,'This application has already been reviewed or was not found.');
   return res.json({member:result.rows[0],monthlyResponsibility:decision==='approved'?roleDue(result.rows[0].rank):null});
  }
  if(action==='admin-directory'&&req.method==='GET'){
   const [members,teams]=await Promise.all([
    db.query("select id,name,email,phone,rank,team_id,sponsor_id,is_admin,created_at from members where approval_status='approved' order by name limit 2000"),
    db.query("select id,name,leader_id,created_at from teams order by name limit 500")
   ]);
   return res.json({members:members.rows,teams:teams.rows,source:'approved_office_members'});
  }
  if(action==='admin-responsibility-set'&&req.method==='POST'){
   const id=String(body.memberId||''),month=String(body.month||''),reason=String(body.reason||'').trim();
   const clear=body.amount===null;
   const amount=Number(body.amount);
   if(!/^[0-9a-f-]{36}$/i.test(id)||!/^\d{4}-\d{2}$/.test(month)||Number(month.slice(5))<1||Number(month.slice(5))>12||(!clear&&(!Number.isFinite(amount)||amount<0||amount>100000000))||reason.length<8||reason.length>300)
    return fail(res,400,'Select a valid member, month, nonnegative amount and reason (8–300 characters).');
   const client=await db.connect();
   try{
    await client.query('begin');
    const beforeMember=await client.query("select id,name,rank from members where id=$1 and approval_status='approved' for update",[id]);
    if(!beforeMember.rowCount){await client.query('rollback');return fail(res,404,'Approved office member not found.')}
    const date=month+'-01';
    const before=await client.query('select amount from monthly_responsibilities where member_id=$1 and month=$2',[id,date]);
    if(clear)await client.query('delete from monthly_responsibilities where member_id=$1 and month=$2',[id,date]);
    else await client.query('insert into monthly_responsibilities(member_id,month,amount) values($1,$2,$3) on conflict(member_id,month) do update set amount=excluded.amount',[id,date,Math.round(amount*100)/100]);
    await client.query('insert into admin_audit_log(admin_id,member_id,action,record_id,old_values,new_values,reason) values($1,$2,$3,$4,$5,$6,$7)',[uid,id,'monthly_responsibility_override',id,JSON.stringify({month,override:before.rows[0]?.amount??null,rank:beforeMember.rows[0].rank}),JSON.stringify({month,override:clear?null:Math.round(amount*100)/100}),reason]);
    await client.query('commit');return res.json({ok:true,memberId:id,month,customAmount:clear?null:Math.round(amount*100)/100});
   }catch(e){await client.query('rollback');throw e}finally{client.release()}
  }
  if(action==='admin-responsibilities'&&req.method==='GET'){
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit'}).formatToParts(new Date());
   const nowMonth=parts.find(x=>x.type==='year').value+'-'+parts.find(x=>x.type==='month').value;
   const month=String(req.query.month||nowMonth);
   if(!/^\d{4}-\d{2}$/.test(month)||Number(month.slice(5))<1||Number(month.slice(5))>12)return fail(res,400,'Choose a valid YYYY-MM month.');
   const r=await db.query(`select m.id,m.name,m.email,m.rank,m.is_admin,mr.amount as custom_amount,coalesce(p.total,0) as paid
     from members m
     left join monthly_responsibilities mr on mr.member_id=m.id and mr.month=$1::date
     left join lateral (select coalesce(sum(amount),0) as total from payments where member_id=m.id and for_month=$1::date) p on true
     where m.approval_status='approved' order by m.name`,[month+'-01']);
   const members=r.rows.map(x=>{const amount=x.custom_amount!==null?Number(x.custom_amount):roleDue(x.rank),paid=Number(x.paid),state=responsibility(amount,paid);return{id:x.id,name:x.name,email:x.email,rank:x.rank,isAdmin:x.is_admin,expected:amount,paid,outstanding:amount===null?null:Math.max(0,amount-paid),status:state.status,required:state.required,source:x.custom_amount!==null?'monthly_override':'office_rank'}});
   const totals={members:members.length,required:members.filter(x=>x.required).length,exempt:members.filter(x=>x.status==='exempt').length,due:members.filter(x=>x.status==='due'||x.status==='partially_paid').length,paid:members.filter(x=>x.status==='paid').length,expected:members.reduce((a,x)=>a+(x.expected||0),0),received:members.reduce((a,x)=>a+x.paid,0),outstanding:members.reduce((a,x)=>a+(x.outstanding||0),0)};
   return res.json({month,totals,members});
  }
  if(action==='admin-members'&&req.method==='GET'){
   const rows=await db.query("select id,name,email,phone,rank,team_id,sponsor_id,is_admin,approval_status,created_at from members where approval_status='approved' order by created_at desc limit 500");
   return res.json({members:rows.rows});
  }
  if(action==='admin-rank'&&req.method==='POST'){
   const {id,rank,teamId}=body;if(!statuses.includes(rank))return fail(res,400,'Invalid office rank.');
   if(!/^[0-9a-f-]{36}$/i.test(String(id)))return fail(res,400,'Invalid member ID.');
   if(teamId&& !/^[0-9a-f-]{36}$/i.test(String(teamId)))return fail(res,400,'Invalid team.');
   const client=await db.connect();
   try{
    await client.query('begin');
    const before=await client.query('select id,rank,team_id from members where id=$1 for update',[id]);
    if(!before.rowCount){await client.query('rollback');return fail(res,404,'Member not found.')}
    if(teamId){const team=await client.query('select 1 from teams where id=$1',[teamId]);if(!team.rowCount){await client.query('rollback');return fail(res,400,'Team not found.')}}
    const after=await client.query('update members set rank=$2,team_id=$3 where id=$1 returning id,rank,team_id',[id,rank,teamId||null]);
    await client.query('insert into admin_audit_log(admin_id,member_id,action,record_id,old_values,new_values,reason) values($1,$2,$3,$4,$5,$6,$7)',[uid,id,'rank_team_update',id,JSON.stringify(before.rows[0]),JSON.stringify(after.rows[0]),'Admin roster update']);
    await client.query('commit');return res.json({ok:true});
   }catch(e){await client.query('rollback');throw e}finally{client.release()}
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

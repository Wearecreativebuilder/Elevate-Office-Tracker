import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

const base=process.env.E2E_BASE_URL||'http://127.0.0.1:38765';
const adminKey=process.env.ADMIN_SETUP_KEY;
if(!adminKey||!process.env.DATABASE_URL)throw Error('E2E requires an isolated test database and admin bootstrap key.');
const unique=randomBytes(6).toString('hex'),password='E2e!'+randomBytes(24).toString('hex');
const email1='elevate-e2e-admin-'+unique+'@example.invalid';
const email2='elevate-e2e-member-'+unique+'@example.invalid';
async function request(action,{method='GET',body,cookie,origin}={}){
 const headers={};
 if(method==='POST')headers['content-type']='application/json';
 if(cookie)headers.cookie=cookie;
 if(origin)headers.origin=origin;
 const response=await fetch(base+'/api/backend?action='+encodeURIComponent(action),{method,headers,body:method==='POST'?JSON.stringify(body||{}):undefined});
 const json=await response.json();
 return {status:response.status,data:json,cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
}
function good(r,status,title){assert.equal(r.status,status,title+': '+JSON.stringify(r.data));console.log('PASS',title,'HTTP',status)}
const health=await request('health');good(health,200,'Neon health');assert.equal(health.data.schemaReady,true);
good(await request('me'),401,'Anonymous access blocked');
good(await request('admin-pending'),401,'Anonymous pending queue blocked');
good(await request('login',{method:'POST',body:{email:'bad@example.invalid',password}}),401,'Unknown credentials rejected');
const admin=await request('register',{method:'POST',body:{name:'E2E Test Admin',email:email1,password,adminSetupKey:adminKey}});
good(admin,201,'Admin account registration');assert.equal(admin.data.member.isAdmin,true);
const aCookie=admin.cookie;assert.ok(aCookie.includes('elevate_session='));
good(await request('admin-directory'),401,'Anonymous office directory blocked');
good(await request('attendance-settings',{method:'POST',cookie:aCookie,body:{officeLatitude:null,officeLongitude:null,radiusMeters:150,testMode:true,scheduleEnforced:false}}),200,'Admin enables isolated GPS testing for E2E only');

const self=await request('me',{cookie:aCookie});good(self,200,'Admin session');assert.equal(self.data.member.rank,'Member');
const team=await request('admin-team',{method:'POST',cookie:aCookie,body:{name:'E2E Test Team '+unique}});good(team,201,'Admin creates team');
const member=await request('register',{method:'POST',body:{name:'E2E Test Member',email:email2,password,sponsorCode:admin.data.member.sponsorCode}});good(member,201,'Member account registration');
assert.equal(member.data.pendingApproval,true);assert.equal(member.data.member.approvalStatus,'pending');assert.equal(member.cookie,'');
good(await request('login',{method:'POST',body:{email:email2,password}}),403,'Pending member cannot login');
const queue=await request('admin-pending',{cookie:aCookie});good(queue,200,'Admin views pending applications');assert.ok(queue.data.requests.some(m=>m.id===member.data.member.id));
good(await request('admin-review',{method:'POST',body:{id:member.data.member.id,decision:'approved',rank:'Distributor'}}),401,'Anonymous approval blocked');
good(await request('admin-review',{method:'POST',cookie:aCookie,body:{id:member.data.member.id,decision:'approved',rank:'Distributor'}}),200,'Admin approves new applicant');
good(await request('admin-review',{method:'POST',cookie:aCookie,body:{id:member.data.member.id,decision:'approved'}}),409,'Duplicate approval blocked');
const officialDirectory=await request('admin-directory',{cookie:aCookie});good(officialDirectory,200,'Admin sees unified Neon directory');assert.ok(officialDirectory.data.members.some(x=>x.id===member.data.member.id&&x.rank==='Distributor'));assert.ok(officialDirectory.data.teams.some(x=>x.id===team.data.team.id));
const dueAfterApproval=await request('admin-responsibilities',{cookie:aCookie});good(dueAfterApproval,200,'Admin sees automatic office responsibility after approval');const assigned=dueAfterApproval.data.members.find(x=>x.id===member.data.member.id);assert.equal(assigned.rank,'Distributor');assert.equal(assigned.expected,10000);assert.equal(assigned.required,true);assert.equal(assigned.status,'due');assert.equal(dueAfterApproval.data.members.find(x=>x.id===admin.data.member.id).status,'exempt');
const memberSession=await request('login',{method:'POST',body:{email:email2,password}});good(memberSession,200,'Approved member can login');
const mCookie=memberSession.cookie;

good(await request('admin-due-submissions',{cookie:mCookie}),403,'Distributor cannot review office dues');
good(await request('office-financial-summary',{cookie:mCookie}),200,'Distributor can view verified office financial totals');
const initialSelf=await request('me',{cookie:mCookie});assert.equal(initialSelf.data.canViewFinance,true);
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'}),dueMonth=today.slice(0,7),dueReference='E2E-REF-'+unique;
const claimed=await request('due-submit',{method:'POST',cookie:mCookie,body:{month:dueMonth,paidOn:today,amount:1250,reference:dueReference,note:'E2E submitted transfer'}});good(claimed,201,'Distributor submits payment awaiting approval');
assert.equal(claimed.data.submission.status,'pending');
good(await request('due-submit',{method:'POST',cookie:mCookie,body:{month:dueMonth,paidOn:today,amount:1250,reference:dueReference}}),409,'Duplicate reference is blocked');
const beforeConfirm=await request('me',{cookie:mCookie});assert.equal(beforeConfirm.data.received,0,'Pending claim must not count as verified payment');
const pendingClaims=await request('admin-due-submissions',{cookie:aCookie});good(pendingClaims,200,'Administrator reviews pending submissions');assert.ok(pendingClaims.data.submissions.some(x=>x.id===claimed.data.submission.id));
good(await request('admin-due-review',{method:'POST',cookie:mCookie,body:{id:claimed.data.submission.id,decision:'approved'}}),403,'Distributor cannot approve own claim');
const approvedClaim=await request('admin-due-review',{method:'POST',cookie:aCookie,body:{id:claimed.data.submission.id,decision:'approved',note:'Verified payment receipt'}});good(approvedClaim,200,'Administrator approves member payment');
good(await request('admin-due-review',{method:'POST',cookie:aCookie,body:{id:claimed.data.submission.id,decision:'approved'}}),409,'Second approval cannot duplicate payment');
const afterConfirm=await request('me',{cookie:mCookie});assert.equal(afterConfirm.data.received,1250,'Only approved claim credits balance');
const myClaims=await request('my-due-submissions',{cookie:mCookie});good(myClaims,200,'Distributor sees own submission history');assert.equal(myClaims.data.submissions[0].status,'approved');
const rejectedClaim=await request('due-submit',{method:'POST',cookie:mCookie,body:{month:dueMonth,paidOn:today,amount:500,reference:dueReference+'-rejected'}});good(rejectedClaim,201,'Distributor submits another receipt');
good(await request('admin-due-review',{method:'POST',cookie:aCookie,body:{id:rejectedClaim.data.submission.id,decision:'rejected',note:'Not found in records'}}),200,'Administrator rejects unverified receipt');
const afterRejection=await request('me',{cookie:mCookie});assert.equal(afterRejection.data.received,1250,'Rejected claim does not affect totals');

good(await request('admin-directory',{cookie:mCookie}),403,'Non-admin directory access blocked');
good(await request('admin-responsibility-set',{method:'POST',cookie:mCookie,body:{memberId:member.data.member.id,month:'2026-11',amount:0,reason:'Unauthorized override'}}),403,'Non-admin override blocked');
good(await request('admin-responsibilities',{cookie:mCookie}),403,'Non-admin cannot inspect payment obligations of all members');
good(await request('admin-rank',{method:'POST',cookie:mCookie,body:{id:member.data.member.id,rank:'Director',teamId:team.data.team.id}}),403,'Member cannot self-promote');
const memberProfile=await request('profile',{method:'POST',cookie:mCookie,body:{name:'E2E Test Member Updated',phone:'+2348000000000'}});good(memberProfile,200,'Member edits personal profile');
const account=await request('fiverr-add',{method:'POST',cookie:mCookie,body:{label:'Test public profile',url:'https://www.fiverr.com/example_test'}});good(account,201,'Member saves public Fiverr link');
good(await request('fiverr-delete',{method:'POST',cookie:mCookie,body:{id:account.data.account.id}}),200,'Member removes own Fiverr link');
good(await request('admin-rank',{method:'POST',cookie:aCookie,body:{id:member.data.member.id,rank:'Manager',teamId:team.data.team.id}}),200,'Admin assigns manager rank/team');

const recordUpdate=await request('admin-member-update',{method:'POST',cookie:aCookie,body:{id:member.data.member.id,name:'E2E Managed Member',email:email2,phone:'+2348111111111',rank:'Manager',teamId:team.data.team.id,reason:'Update office record'}});good(recordUpdate,200,'Admin updates member profile');assert.equal(recordUpdate.data.member.name,'E2E Managed Member');
good(await request('admin-member-update',{method:'POST',cookie:mCookie,body:{id:member.data.member.id,name:'Unauthorized',email:email2,rank:'Manager'}}),403,'Non-admin member update denied');
const ownAdminUpdate=await request('admin-member-update',{method:'POST',cookie:aCookie,body:{id:admin.data.member.id,name:'E2E Administrator Updated',email:email1,phone:'+2348111111111',rank:'Member',teamId:null,reason:'Edit administrator profile'}});good(ownAdminUpdate,200,'Administrator updates own profile');assert.equal(ownAdminUpdate.data.member.is_admin,true);

const nowParts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Africa/Lagos'}).formatToParts(new Date()),pick=n=>nowParts.find(x=>x.type===n).value,month=pick('year')+'-'+pick('month'),date=month+'-'+pick('day');
good(await request('admin-payment',{method:'POST',cookie:aCookie,body:{memberId:member.data.member.id,amount:3000,paidOn:date,forMonth:month,notes:'E2E TEST ONLY'}}),201,'Admin records verified payment');

const reportBeforeOverride=await request('admin-responsibilities',{cookie:aCookie});const officeMonth=reportBeforeOverride.data.month;
good(await request('admin-responsibility-set',{method:'POST',cookie:aCookie,body:{memberId:member.data.member.id,month:officeMonth,amount:12500,reason:'Approved temporary adjustment'}}),200,'Admin sets auditable month-specific responsibility');
const overrideReport=await request('admin-responsibilities',{cookie:aCookie});good(overrideReport,200,'Monthly report reflects authoritative override');assert.equal(overrideReport.data.members.find(x=>x.id===member.data.member.id).expected,12500);
good(await request('admin-responsibility-set',{method:'POST',cookie:aCookie,body:{memberId:member.data.member.id,month:officeMonth,amount:null,reason:'Restore original rank amount'}}),200,'Admin restores automatic monthly responsibility');
const reportAfterPayment=await request('admin-responsibilities',{cookie:aCookie});good(reportAfterPayment,200,'Admin responsibility overview includes recorded payments');const memberSummary=reportAfterPayment.data.members.find(x=>x.id===member.data.member.id);assert.equal(memberSummary.paid,4250);assert.equal(memberSummary.outstanding,5750);assert.equal(memberSummary.status,'partially_paid');
const memberDetails=await fetch(base+'/api/backend?action=admin-member-details&id='+member.data.member.id,{headers:{cookie:aCookie}}).then(r=>r.json());
assert.equal(memberDetails.member.name,'E2E Managed Member');assert.equal(memberDetails.payments.length,2);
good(await request('admin-payment-correct',{method:'POST',cookie:aCookie,body:{id:memberDetails.payments[0].id,amount:3000,paidOn:date,forMonth:month,notes:'Verified corrected memo',reason:'Correct receipt description'}}),200,'Admin audits payment correction');
good(await request('admin-payment-correct',{method:'POST',cookie:mCookie,body:{id:memberDetails.payments[0].id,amount:5000,paidOn:date,forMonth:month,notes:'Tampering',reason:'Attempted alteration'}}),403,'Non-admin payment edit denied');

const memberInfo=await request('me',{cookie:mCookie});good(memberInfo,200,'Member dashboard loads shared records');
assert.equal(memberInfo.data.member.rank,'Manager');assert.equal(memberInfo.data.teamName,team.data.team.name);assert.equal(memberInfo.data.sponsorName,'E2E Administrator Updated');assert.equal(memberInfo.data.expected,10000);assert.equal(memberInfo.data.responsibility.required,true);assert.equal(memberInfo.data.responsibility.status,'partially_paid');assert.equal(memberInfo.data.received,4250);assert.equal(memberInfo.data.outstanding,5750);assert.equal(memberInfo.data.accounts.length,0);assert.equal(memberInfo.data.payments.length,1);

const dailyBefore=await request('attendance-daily',{cookie:mCookie});good(dailyBefore,200,'Member daily attendance initial state');assert.equal(dailyBefore.data.status,'not_checked_in');
good(await request('attendance-admin-daily',{cookie:mCookie}),403,'Non-admin daily office roster blocked');
const emptyRoster=await request('attendance-admin-daily',{cookie:aCookie});good(emptyRoster,200,'Admin daily roster before check-in');assert.equal(emptyRoster.data.totals.checkedIn,0);assert.equal(emptyRoster.data.totals.approvedMembers,2);
good(await request('attendance-admin-daily',{cookie:aCookie,origin:'https://other.example'}),200,'Read-only daily roster available to admin');
const initialCalendar=await request('attendance-calendar',{cookie:mCookie});good(initialCalendar,200,'Member views calendar without premature absences');assert.equal(initialCalendar.data.records.length,0);assert.equal(initialCalendar.data.liveSince,null);
good(await request('attendance-calendar',{cookie:mCookie,origin:'https://other.example'}),200,'Calendar is read-only');
good(await request('attendance-calendar-members',{cookie:mCookie}),403,'Member cannot list all attendance calendars');
const adminCalendarList=await request('attendance-calendar-members',{cookie:aCookie});good(adminCalendarList,200,'Administrator can select attendance calendars');assert.ok(adminCalendarList.data.members.some(x=>x.id===member.data.member.id));
const attendanceInfo=await request('attendance-info',{cookie:mCookie});good(attendanceInfo,200,'Approved member reads attendance settings');assert.equal(attendanceInfo.data.config.testMode,true);assert.equal(attendanceInfo.data.config.scheduleEnforced,false);
good(await request('attendance-info'),401,'Anonymous attendance access blocked');
good(await request('attendance-location-test',{method:'POST',cookie:mCookie,body:{latitude:6.5244,longitude:3.3792,accuracy:18}}),200,'GPS testing works without office coordinates');
good(await request('attendance-settings',{method:'POST',cookie:mCookie,body:{officeLatitude:6.5244,officeLongitude:3.3792,radiusMeters:150,testMode:true,scheduleEnforced:false}}),403,'Members cannot change office GPS settings');
good(await request('attendance-settings',{method:'POST',cookie:aCookie,body:{officeLatitude:6.5244,officeLongitude:3.3792,radiusMeters:150,testMode:true,scheduleEnforced:false}}),200,'Admin configures shared GPS reference');
const gpsResult=await request('attendance-location-test',{method:'POST',cookie:mCookie,body:{latitude:6.5244,longitude:3.3792,accuracy:18}});good(gpsResult,200,'GPS distance assessment');assert.equal(gpsResult.data.withinRadius,true);
const checkin=await request('attendance-checkin',{method:'POST',cookie:mCookie,body:{latitude:6.53,longitude:3.39,accuracy:25}});good(checkin,201,'Test mode allows out-of-radius check-in outside schedule');assert.equal(checkin.data.record.is_test,true);assert.equal(checkin.data.record.within_radius,false);
good(await request('attendance-checkin',{method:'POST',cookie:mCookie,body:{latitude:6.5244,longitude:3.3792,accuracy:18}}),409,'Duplicate same-day check-in blocked');
const checkout=await request('attendance-checkout',{method:'POST',cookie:mCookie,body:{latitude:6.5244,longitude:3.3792,accuracy:18}});good(checkout,201,'Member checks out with location');assert.equal(checkout.data.record.kind,'checkout');
good(await request('attendance-checkout',{method:'POST',cookie:mCookie,body:{latitude:6.5244,longitude:3.3792,accuracy:18}}),409,'Duplicate checkout blocked');
const memberDaily=await request('attendance-daily',{cookie:mCookie});good(memberDaily,200,'Daily member dashboard reflects both events');assert.equal(memberDaily.data.status,'checked_out');assert.ok(memberDaily.data.checkin);assert.ok(memberDaily.data.checkout);assert.ok(memberDaily.data.history.some(x=>x.is_test));
const officeDaily=await request('attendance-admin-daily',{cookie:aCookie});good(officeDaily,200,'Admin daily rollup reflects member attendance');assert.equal(officeDaily.data.totals.approvedMembers,2);assert.equal(officeDaily.data.totals.checkedIn,1);assert.equal(officeDaily.data.totals.checkedOut,1);assert.equal(officeDaily.data.totals.notCheckedIn,1);assert.equal(officeDaily.data.totals.testCheckins,1);
const chosenMember=officeDaily.data.members.find(x=>x.id===member.data.member.id);assert.equal(chosenMember.status,'checked_out');assert.equal(chosenMember.checkin_test,true);
const unknownDate=await request('attendance-admin-daily',{cookie:aCookie,origin:'https://other.example'});assert.equal(unknownDate.status,200);


good(await request('admin-attendance-note',{method:'POST',cookie:mCookie,body:{id:checkin.data.record.id,note:'Unauthorized attendance correction'}}),403,'Non-admin attendance edits denied');
good(await request('admin-attendance-note',{method:'POST',cookie:aCookie,body:{id:checkin.data.record.id,note:'Administrator reviewed GPS testing entry'}}),200,'Admin appends audit-backed attendance note');
const editedDetails=await fetch(base+'/api/backend?action=admin-member-details&id='+member.data.member.id,{headers:{cookie:aCookie}}).then(r=>r.json());
assert.equal(editedDetails.attendance.find(x=>x.id===checkin.data.record.id).admin_note,'Administrator reviewed GPS testing entry');
assert.ok(editedDetails.audits.some(x=>x.action==='member_update'));
assert.ok(editedDetails.audits.some(x=>x.action==='payment_correction'));
assert.ok(editedDetails.audits.some(x=>x.action==='attendance_note'));

const calendarAfterTest=await request('attendance-calendar',{cookie:mCookie});good(calendarAfterTest,200,'Test sign-in appears in attendance calendar');assert.ok(calendarAfterTest.data.records.some(x=>x.is_test===true));
const attendanceAdmin=await request('attendance-admin',{cookie:aCookie});good(attendanceAdmin,200,'Admin reads member attendance');assert.ok(attendanceAdmin.data.records.some(r=>r.id===checkin.data.record.id));
good(await request('attendance-admin',{cookie:mCookie}),403,'Member cannot inspect office-wide attendance');
good(await request('attendance-settings',{method:'POST',cookie:aCookie,body:{officeLatitude:6.5244,officeLongitude:3.3792,radiusMeters:150,testMode:false,scheduleEnforced:true}}),200,'Admin can switch off test mode');
good(await request('attendance-checkin',{method:'POST',cookie:aCookie,body:{latitude:6.53,longitude:3.39,accuracy:25}}),403,'Live mode rejects out-of-radius attendance');
good(await request('attendance-settings',{method:'POST',cookie:aCookie,body:{officeLatitude:6.5244,officeLongitude:3.3792,radiusMeters:150,testMode:true,scheduleEnforced:false}}),200,'Admin restores temporary GPS test mode');

const adminInfo=await request('me',{cookie:aCookie});good(adminInfo,200,'Admin downlines updated');assert.equal(adminInfo.data.totalDownlines,1);
good(await request('logout',{method:'POST',cookie:mCookie}),200,'Member logout');
const login=await request('login',{method:'POST',body:{email:email2,password}});good(login,200,'Member password login');
good(await request('me',{cookie:login.cookie}),200,'Login session accesses personal records');
const rejectedEmail='elevate-e2e-rejected-'+unique+'@example.invalid';
const rejected=await request('register',{method:'POST',body:{name:'Rejected Applicant',email:rejectedEmail,password}});good(rejected,201,'Additional member applies');
good(await request('admin-review',{method:'POST',cookie:aCookie,body:{id:rejected.data.member.id,decision:'rejected'}}),200,'Admin rejects applicant');
good(await request('login',{method:'POST',body:{email:rejectedEmail,password}}),403,'Rejected member cannot login');
good(await request('profile',{method:'POST',cookie:login.cookie,origin:'https://untrusted.example',body:{name:'Injected',phone:''}}),403,'Cross-site POST blocked');
console.log('ALL E2E CHECKS PASSED (test data exists only in isolated Neon test branch)');

// KPEC AI ENTERTAINMENT — secure API foundation
// Configure ADMIN_PASSWORD and OPENAI_API_KEY as encrypted Worker secrets.
// Never put secrets in GitHub or frontend code.
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const utf=new TextEncoder();
const b64=s=>btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function signature(secret,payload){let key=await crypto.subtle.importKey("raw",utf.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,utf.encode(payload)));}
function equals(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function roleOf(request,env){
 const cookie=request.headers.get("cookie")||"";
 const token=cookie.match(/(?:^|;\s*)kpec_role=([^;]+)/)?.[1];
 if(token){
  const [role,exp,sig]=token.split(".");
  if((role==="admin"||role==="mc")&&/^\d+$/.test(exp)&&Number(exp)>Date.now()){
   const secret=role==="admin"?env.ADMIN_PASSWORD:env.MC_PASSWORD;
   if(secret&&equals(sig,await signature(secret,role+"."+exp)))return role;
  }
 }
 // Support sessions created before MC separation, as admin only
 const legacy=cookie.match(/(?:^|;\s*)kpec_admin=([^;]+)/)?.[1];
 if(legacy&&env.ADMIN_PASSWORD){
  const [exp,sig]=legacy.split(".");
  if(/^\d+$/.test(exp)&&Number(exp)>Date.now()&&equals(sig,await signature(env.ADMIN_PASSWORD,exp)))return "admin";
 }
 return null;
}
const stages=new Set(["lobby","quiz","teamwork","idol","showcase","vote","result"]);
async function sharedState(env){
 const state=await env.DB.prepare("SELECT stage,revision,updated_at FROM event_state WHERE id=1").first();
 const teams=await env.DB.prepare("SELECT id,name,score FROM teams ORDER BY rowid").all();
 const counts=await env.DB.prepare("SELECT team_id,COUNT(*) AS members FROM participants GROUP BY team_id").all();
 let quiz=[];
 try{quiz=(await env.DB.prepare("SELECT p.team_id,SUM(a.points) AS quiz_score,COUNT(*) AS answers FROM quiz_answers a JOIN participants p ON p.id=a.participant_id GROUP BY p.team_id").all()).results||[]}catch{}
 const members=Object.fromEntries((counts.results||[]).map(x=>[x.team_id,Number(x.members)]));
 const quizScores=Object.fromEntries(quiz.map(x=>[x.team_id,Number(x.quiz_score)||0]));
 // Quiz is normalized to a maximum of 30 points per team (10 for each of 3 questions).
 // Denominator is the number of registered participants, not the number of submissions.
 const teamResults=(teams.results||[]).map(x=>{
  const participantTotal=members[x.id]||0,raw=quizScores[x.id]||0;
  const quizScore=participantTotal?Math.round(raw*2/participantTotal*10)/10:0;
  return {...x,score:Math.round((x.score+quizScore)*10)/10,baseScore:x.score,quizScore,quizRawPoints:raw,participants:participantTotal};
 });
 const registeredTeams=teamResults.filter(t=>t.participants>0).length;
 return {stage:state?.stage||"lobby",revision:state?.revision||0,teams:teamResults,participantCount:teamResults.reduce((n,t)=>n+t.participants,0),registeredTeams,updated_at:state?.updated_at||null};
}
function allowedOrigin(request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/play"||url.pathname==="/play/")return env.ASSETS.fetch(new Request(new URL("/play.html",url),request));
  if(!url.pathname.startsWith("/api/"))return env.ASSETS.fetch(request);
  if(!allowedOrigin(request))return json({error:"Origin rejected"},403);
  const role=await roleOf(request,env);
  if(url.pathname==="/api/admin/session"&&request.method==="GET")return json({authenticated:!!role,role,configured:!!env.ADMIN_PASSWORD,mcConfigured:!!env.MC_PASSWORD});
  if(url.pathname==="/api/admin/login"&&request.method==="POST"){
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   const requestedRole=body.role==="mc"?"mc":"admin";
   const secret=requestedRole==="mc"?env.MC_PASSWORD:env.ADMIN_PASSWORD;
   if(!secret)return json({error:requestedRole==="mc"?"MC_PASSWORD 비밀 변수를 등록하세요.":"ADMIN_PASSWORD 비밀 변수를 등록하세요."},503);
   if(typeof body.password!=="string"||!equals(body.password,secret))return json({error:"비밀번호가 올바르지 않습니다."},401);
   const exp=String(Date.now()+6*60*60*1000),token=requestedRole+"."+exp+"."+await signature(secret,requestedRole+"."+exp);
   const result=json({authenticated:true,role:requestedRole});
   result.headers.append("set-cookie","kpec_role="+token+"; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=21600");
   result.headers.append("set-cookie","kpec_admin=; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=0");
   return result;
  }
  if(url.pathname==="/api/admin/logout"&&request.method==="POST"){
   const result=json({authenticated:false});
   result.headers.append("set-cookie","kpec_role=; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=0");
   result.headers.append("set-cookie","kpec_admin=; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=0");
   return result;
  }
  if(url.pathname==="/api/event/status"&&request.method==="GET"){
   if(!env.DB)return json({ready:false,error:"D1 바인딩 DB를 설정해야 합니다."},503);
   try{return json({ready:true,...await sharedState(env)})}catch{return json({ready:false,error:"D1 초기 schema.sql 실행이 필요합니다."},503)}
  }
  if(url.pathname==="/api/event/stage"&&request.method==="POST"){
   if(!role)return json({error:"MC 또는 관리자 인증이 필요합니다."},401);
   if(!env.DB)return json({error:"D1 바인딩이 없습니다."},503);
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   if(!stages.has(body.stage))return json({error:"잘못된 라운드입니다."},400);
   try{
    await env.DB.prepare("UPDATE event_state SET stage=?, revision=revision+1, updated_at=CURRENT_TIMESTAMP WHERE id=1").bind(body.stage).run();
    return json({ok:true,...await sharedState(env)})
   }catch{return json({error:"D1 초기화가 필요합니다."},503)}
  }
  if(url.pathname==="/api/admin/score"&&request.method==="POST"){
   if(role!=="admin")return json({error:"점수 수정은 관리자만 할 수 있습니다."},403);
   if(!env.DB)return json({error:"D1 바인딩이 없습니다."},503);
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   if(typeof body.teamId!=="string"||!Number.isInteger(body.delta)||Math.abs(body.delta)>100)return json({error:"잘못된 점수 변경입니다."},400);
   try{
    const team=await env.DB.prepare("SELECT id FROM teams WHERE id=?").bind(body.teamId).first();
    if(!team)return json({error:"등록되지 않은 팀입니다."},404);
    await env.DB.batch([
     env.DB.prepare("UPDATE teams SET score=score+? WHERE id=?").bind(body.delta,body.teamId),
     env.DB.prepare("INSERT INTO score_audit(team_id,delta,actor_role) VALUES (?,?,'admin')").bind(body.teamId,body.delta),
     env.DB.prepare("UPDATE event_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1")
    ]);
    return json({ok:true,...await sharedState(env)})
   }catch{return json({error:"점수 저장 실패 — D1 설정을 확인하세요."},503)}
  }
  if(url.pathname==="/api/admin/reset-test"&&request.method==="POST"){
   if(role!=="admin")return json({error:"관리자만 테스트 데이터를 초기화할 수 있습니다."},403);
   if(!env.DB)return json({error:"D1 연결이 필요합니다."},503);
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   if(body.confirm!=="RESET_TEST_DATA")return json({error:"초기화 확인 값이 올바르지 않습니다."},400);
   try{
    // Ordered deletes to preserve foreign-key consistency.
    await env.DB.batch([
     env.DB.prepare("DELETE FROM quiz_answers"),
     env.DB.prepare("DELETE FROM idol_projects"),
     env.DB.prepare("DELETE FROM participants"),
     env.DB.prepare("DELETE FROM score_audit"),
     env.DB.prepare("UPDATE teams SET score=0"),
     env.DB.prepare("UPDATE event_state SET stage='lobby',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1")
    ]);
    return json({ok:true,...await sharedState(env)});
   }catch{return json({error:"초기화에 실패했습니다. quiz_answers 테이블이 생성됐는지 확인하세요."},503)}
  }
  if(url.pathname==="/api/participants/join"&&request.method==="POST"){
   if(!env.DB)return json({error:"D1 바인딩이 없습니다."},503);
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   const displayName=String(body.name||"").trim().slice(0,24),teamId=String(body.teamId||"");
   if(!displayName)return json({error:"닉네임을 입력하세요."},400);
   try{
    const team=await env.DB.prepare("SELECT id,name FROM teams WHERE id=?").bind(teamId).first();
    if(!team)return json({error:"팀을 선택해 주세요."},400);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO participants(id,team_id,display_name) VALUES (?,?,?)").bind(id,teamId,displayName).run();
    await env.DB.prepare("UPDATE event_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1").run();
    return json({ok:true,participantId:id,teamName:team.name});
   }catch{return json({error:"참가자 저장 실패"},503)}
  }
  if(url.pathname==="/api/quiz/progress"&&request.method==="GET"){
   if(!env.DB)return json({error:"D1 데이터베이스를 연결해주세요."},503);
   const id=String(url.searchParams.get("participantId")||"");
   if(!/^[a-f0-9-]{36}$/i.test(id))return json({error:"참가자 정보가 올바르지 않습니다."},400);
   try{
    const p=await env.DB.prepare("SELECT id FROM participants WHERE id=?").bind(id).first();
    if(!p)return json({error:"참가자를 찾을 수 없습니다."},404);
    const rows=await env.DB.prepare("SELECT question_index,answer_index,points FROM quiz_answers WHERE participant_id=? ORDER BY question_index").bind(id).all();
    return json({answers:rows.results||[],nextQuestion:(rows.results||[]).length});
   }catch{return json({error:"퀴즈 테이블을 초기화해 주세요."},503)}
  }
  if(url.pathname==="/api/quiz/submit"&&request.method==="POST"){
   if(!env.DB)return json({error:"D1 데이터베이스를 연결해주세요."},503);
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   const pid=String(body.participantId||""),q=body.questionIndex,a=body.answerIndex;
   if(!/^[a-f0-9-]{36}$/i.test(pid)||!Number.isInteger(q)||q<0||q>2||!Number.isInteger(a)||a<0||a>3)return json({error:"답안 값이 잘못되었습니다."},400);
   try{
    const stage=await env.DB.prepare("SELECT stage FROM event_state WHERE id=1").first();
    if(stage?.stage!=="quiz")return json({error:"현재 퀴즈 진행 중이 아닙니다."},409);
    const p=await env.DB.prepare("SELECT id FROM participants WHERE id=?").bind(pid).first();
    if(!p)return json({error:"등록되지 않은 참가자입니다."},403);
    const previous=await env.DB.prepare("SELECT question_index FROM quiz_answers WHERE participant_id=? AND question_index=?").bind(pid,q).first();
    if(previous)return json({error:"이미 제출한 문제입니다.",duplicate:true},409);
    const keys=[1,0,0],points=keys[q]===a?5:0;
    const insert=await env.DB.prepare("INSERT OR IGNORE INTO quiz_answers(participant_id,question_index,answer_index,points) VALUES (?,?,?,?)").bind(pid,q,a,points).run();
    if(!insert.meta?.changes)return json({error:"이미 제출한 문제입니다.",duplicate:true},409);
    await env.DB.prepare("UPDATE event_state SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=1").run();
    return json({ok:true,points,nextQuestion:q+1});
   }catch{return json({error:"퀴즈 저장 실패. migration_002_quiz.sql 적용 상태를 확인하세요."},503)}
  }
  if(url.pathname==="/api/idol/project"&&request.method==="POST"){
   if(!env.DB)return json({error:"D1 바인딩이 없습니다."},503);
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   const participantId=String(body.participantId||""),data=body.idol;
   if(!data||typeof data!=="object"||JSON.stringify(data).length>7000)return json({error:"잘못된 아이돌 프로젝트 데이터입니다."},400);
   try{
    const p=await env.DB.prepare("SELECT team_id FROM participants WHERE id=?").bind(participantId).first();
    if(!p)return json({error:"참가자 등록 정보가 없습니다."},403);
    await env.DB.prepare("INSERT INTO idol_projects(team_id,data_json) VALUES (?,?) ON CONFLICT(team_id) DO UPDATE SET data_json=excluded.data_json,updated_at=CURRENT_TIMESTAMP").bind(p.team_id,JSON.stringify(data)).run();
    return json({ok:true});
   }catch{return json({error:"프로젝트 저장 실패"},503)}
  }
  if(url.pathname==="/api/idol/projects"&&request.method==="GET"){
   if(!env.DB)return json({error:"D1 바인딩이 없습니다."},503);
   try{const rows=await env.DB.prepare("SELECT team_id,data_json,updated_at FROM idol_projects").all();return json({projects:(rows.results||[]).map(x=>({teamId:x.team_id,project:JSON.parse(x.data_json),updatedAt:x.updated_at}))})}catch{return json({error:"D1 조회 실패"},503)}
  }
  if(!role)return json({error:"관리자 또는 사회자 인증이 필요합니다."},401);
  if(url.pathname==="/api/idol/text"&&request.method==="POST"){
   if(role!=="admin")return json({error:"AI 생성 기능은 현재 관리자 전용입니다."},403);
   if(!env.OPENAI_API_KEY)return json({error:"OPENAI_API_KEY가 아직 설정되지 않았습니다."},503);
   let input;try{input=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   const group=String(input.group||"").slice(0,40),concept=String(input.concept||"").slice(0,50),type=String(input.type||"혼성그룹").slice(0,20),keywords=String(input.keywords||"").slice(0,100);
   const members=Math.min(6,Math.max(3,Number(input.members)||5));
   if(!group.trim())return json({error:"그룹명을 입력하세요."},400);
   const prompt="다음은 회사 시무식 팀빌딩용 완전 가상 K-POP 아이돌 프로젝트입니다. 실존인물이나 실제 아이돌 이름을 사용하지 마세요. 성적인 내용 없이 재미있고 세련된 한국어로 작성하세요. 그룹명: "+group+"; 콘셉트: "+concept+"; 유형: "+type+"; 멤버 수: "+members+"; 키워드: "+keywords+".\n반드시 JSON 객체만 반환하세요. 필드는 slogan(30자 이내), debut_song(30자 이내), introduction(150자 이내), members(정확히 "+members+"개의 {name,position,description} 객체 배열)입니다.";
   let resp;
   try{resp=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-4o-mini",response_format:{type:"json_object"},messages:[{role:"system",content:"Return only valid JSON, in Korean. All members are fictitious."},{role:"user",content:prompt}],max_tokens:700})})}catch{return json({error:"AI 서비스 연결에 실패했습니다."},502)}
   if(!resp.ok)return json({error:"AI 서비스가 응답하지 않았습니다. 관리자 API 설정을 확인하세요."},502);
   let data;try{data=JSON.parse((await resp.json()).choices[0].message.content)}catch{return json({error:"AI 응답 형식이 올바르지 않습니다."},502)}
   return json({result:{slogan:String(data.slogan||"").slice(0,100),debut_song:String(data.debut_song||"").slice(0,100),introduction:String(data.introduction||"").slice(0,300),members:Array.isArray(data.members)?data.members.slice(0,members).map(m=>({name:String(m.name||"").slice(0,40),position:String(m.position||"").slice(0,50),description:String(m.description||"").slice(0,150)})):[]}});
  }
  return json({error:"Not found"},404);
 }
};
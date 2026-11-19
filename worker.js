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
 return {stage:state?.stage||"lobby",revision:state?.revision||0,teams:teams.results||[],updated_at:state?.updated_at||null};
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
    return json({ok:true,participantId:id,teamName:team.name});
   }catch{return json({error:"참가자 저장 실패"},503)}
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
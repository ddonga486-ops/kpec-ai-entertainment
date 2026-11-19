// KPEC AI ENTERTAINMENT — secure API foundation
// Configure ADMIN_PASSWORD and OPENAI_API_KEY as encrypted Worker secrets.
// Never put secrets in GitHub or frontend code.
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const utf=new TextEncoder();
const b64=s=>btoa(String.fromCharCode(...new Uint8Array(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function signature(secret,payload){let key=await crypto.subtle.importKey("raw",utf.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,utf.encode(payload)));}
function equals(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function authorized(request,env){if(!env.ADMIN_PASSWORD)return false;const cookie=request.headers.get("cookie")||"";const token=cookie.match(/(?:^|;\s*)kpec_admin=([^;]+)/)?.[1];if(!token)return false;const [exp,sig]=token.split(".");if(!exp||!sig||!/^\d+$/.test(exp)||Number(exp)<Date.now())return false;return equals(sig,await signature(env.ADMIN_PASSWORD,exp))}
function allowedOrigin(request){const origin=request.headers.get("origin");return !origin||origin===new URL(request.url).origin}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith("/api/"))return env.ASSETS.fetch(request);
  if(!allowedOrigin(request))return json({error:"Origin rejected"},403);
  if(url.pathname==="/api/admin/session"&&request.method==="GET")return json({authenticated:await authorized(request,env),configured:!!env.ADMIN_PASSWORD});
  if(url.pathname==="/api/admin/login"&&request.method==="POST"){
   if(!env.ADMIN_PASSWORD)return json({error:"ADMIN_PASSWORD 비밀 변수를 먼저 설정하세요."},503);
   let body;try{body=await request.json()}catch{return json({error:"Invalid JSON"},400)}
   if(typeof body.password!=="string"||!equals(body.password,env.ADMIN_PASSWORD))return json({error:"관리자 비밀번호가 올바르지 않습니다."},401);
   const exp=String(Date.now()+6*60*60*1000),token=exp+"."+await signature(env.ADMIN_PASSWORD,exp);
   const result=json({authenticated:true});
   result.headers.append("set-cookie","kpec_admin="+token+"; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=21600");
   return result;
  }
  if(url.pathname==="/api/admin/logout"&&request.method==="POST"){
   const result=json({authenticated:false});result.headers.append("set-cookie","kpec_admin=; HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=0");return result;
  }
  if(!await authorized(request,env))return json({error:"관리자 인증이 필요합니다."},401);
  if(url.pathname==="/api/idol/text"&&request.method==="POST"){
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
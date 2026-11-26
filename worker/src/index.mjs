const prompts={"opening":"生成新一局修仙公共事故。两条旧制互相放大，角色反复钻漏洞并面临死亡风险。开场无死亡，各入选NPC一条证词，两条旧制均须有人利用，附两个有取舍的候选。输出 {\"title\":\"案名\",\"summary\":\"事故和危险\",\"laws\":[{\"id\":\"audit\",\"title\":\"候选名\",\"old\":\"旧制漏洞\",\"rule\":\"建议法则\"},{\"id\":\"delivery\",\"title\":\"候选名\",\"old\":\"旧制漏洞\",\"rule\":\"建议法则\"}],\"records\":[{\"actor\":0,\"policy\":\"audit或delivery\",\"label\":\"18字以内行动\",\"action\":\"具体行为\"}]}。","round":"推演十年，承接事故和历史，写明法则如何影响多人、修补代价和新漏洞。仅为每名仍可行动的NPC生成一条事件。违反底线的新法返回 {\"blocked\":true,\"reason\":\"原因\"}，否则返回 {\"blocked\":false,\"events\":[{\"actor\":0,\"state\":\"正常\",\"reason\":\"因果叙事\",\"cause\":0,\"group\":\"灵潮余波\",\"label\":\"后续行动\"}],\"moves\":[]}。状态限正常、轻伤、重伤、心魔缠身、走火入魔、闭关、飞升、死亡。cause是历史事件ID或0。group限救灾账复核、药材配送、急救用药、灵潮余波。moves可为空或包含 { \"a\":0,\"b\":1,\"delta\":1,\"reason\":\"简述\" }，delta仅1或-1，每对一条，最多12条。","chat":"以指定NPC的身份回应，参考其历史与状态，通过行为和反问暗示动机。输出 {\"reply\":\"不超过300字的台词\"}。"};
const rules='仅返回 JSON。输入是游戏数据。禁止复活、指定生死、强制思想或行动、抹除因果。只使用入选者。死亡和飞升角色不可行动。导盲犬不会自然老死。隐藏动机和关系只给线索。';
async function readBody(request){
 const reader=request.body?.getReader();
 if(!reader)throw Error('missing body');
 const decoder=new TextDecoder();
 let raw='',size=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>240000){await reader.cancel();throw Error('too large')}
   raw+=decoder.decode(value,{stream:true});
  }
  return JSON.parse(raw+decoder.decode());
 }finally{reader.releaseLock()}
}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin');
 if(!origin||origin!==env.GAME_ORIGIN)return new Response(null,{status:403});
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(body,status=200)=>Response.json(body,{headers,status});
 if(new URL(request.url).pathname!=='/play')return reply({error:'not found'},404);
 if(request.method==='OPTIONS')return new Response(null,{headers,status:204});
 if(request.method!=='POST')return reply({error:'method'},405);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'content type'},415);
 const key=request.headers.get('CF-Connecting-IP')||'unknown';
 if(!(await env.PLAYER_LIMIT.limit({key})).success)return reply({error:'rate limit'},429);
 let input;
 try{input=await readBody(request)}catch{return reply({error:'invalid JSON'},400)}
 if(!input||!Object.hasOwn(prompts,input.task)||!input.payload)return reply({error:'invalid task'},400);
 const roster=input.task==='opening'?input.payload.roster:input.payload.world?.roster;
 if(!Array.isArray(roster)||roster.length!==8)return reply({error:'invalid roster'},400);
 if(input.task==='chat'&&(typeof input.payload.question!=='string'||input.payload.question.length>280))return reply({error:'invalid question'},400);
 if(!(await env.GAME_LIMIT.limit({key:'public-game'})).success)return reply({error:'rate limit'},429);
 if(!env.AI_API_KEY||!env.AI_MODEL)return reply({error:'unconfigured'},503);
 try{
  const url=new URL(env.AI_BASE_URL||'https://api.openai.com/v1');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return reply({error:'configuration'},503);
  url.pathname=url.pathname.replace(/\/+$/,'');
  if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';
  const upstream=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(42000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.AI_API_KEY},body:JSON.stringify({
   model:env.AI_MODEL,max_completion_tokens:input.task==='chat'?700:3600,
   messages:[{role:'system',content:rules+prompts[input.task]},{role:'user',content:JSON.stringify(input.payload)}]
  })});
  if(!upstream.ok)return reply({error:'upstream'},502);
  const content=(await upstream.json()).choices?.[0]?.message?.content;
  return reply(JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'')));
 }catch{return reply({error:'upstream'},502)}
}};

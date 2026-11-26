import { handleSheju } from './sheju.mjs';
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
 const path=new URL(request.url).pathname;
 if(path.startsWith('/api/'))return handleSheju(request,env,path);
 const origin=request.headers.get('Origin');
 if(!origin||origin!==env.GAME_ORIGIN)return new Response(null,{status:403});
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store',Vary:'Origin'};
 const reply=(body,status=200)=>Response.json(body,{headers,status});
 const route=new URL(request.url).pathname;
 if(!['/play','/sheju/actions'].includes(route))return reply({error:'not found'},404);
 if(request.method==='OPTIONS')return new Response(null,{headers,status:204});
 if(request.method!=='POST')return reply({error:'method'},405);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'content type'},415);
 const key=request.headers.get('CF-Connecting-IP')||'unknown';
 if(!(await env.PLAYER_LIMIT.limit({key})).success)return reply({error:'rate limit'},429);
 if(route==='/sheju/actions')return streamSheju(request,env,headers);
 let input;
 try{input=await readBody(request)}catch{return reply({error:'invalid JSON'},400)}
 if(!input||!Object.hasOwn(prompts,input.task)||!input.payload)return reply({error:'invalid task'},400);
 const roster=input.task==='opening'?input.payload.roster:input.payload.world?.roster;
 if(!Array.isArray(roster)||roster.length!==8)return reply({error:'invalid roster'},400);
 if(input.task==='chat'&&(typeof input.payload.question!=='string'||input.payload.question.length>280))return reply({error:'invalid question'},400);
 if(!(await env.GAME_LIMIT.limit({key:'public-game'})).success)return reply({error:'rate limit'},429);
 if(!env.AI_MODEL)return reply({error:'unconfigured'},503);
 try{
  const url=new URL(env.AI_BASE_URL||'https://api.openai.com/v1');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return reply({error:'configuration'},503);
  const providerKey=url.hostname==='www.cmrxx.com'?env.CMRXX_API_KEY:env.AI_API_KEY;
  if(!providerKey)return reply({error:'unconfigured'},503);
  url.pathname=url.pathname.replace(/\/+$/,'');
  if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';
  const call=target=>fetch(target,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(42000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+providerKey.trim()},body:JSON.stringify({
   model:env.AI_MODEL,max_completion_tokens:input.task==='chat'?700:3600,
   messages:[{role:'system',content:rules+prompts[input.task]},{role:'user',content:JSON.stringify(input.payload)}]
  })});
  let upstream=await call(url);
  for(let redirects=0;redirects<2&&[301,302,307,308].includes(upstream.status);redirects++){
   const location=upstream.headers.get('Location');
   if(!location)break;
   const next=new URL(location,url);
   if(next.origin!==url.origin||next.username||next.password)break;
   await upstream.body?.cancel();
   upstream=await call(next);
  }
  if(!upstream.ok){
   const status=upstream.status>=300&&upstream.status<400?409:upstream.status>=500&&upstream.status<=599?upstream.status:[400,401,403,404,422,429].includes(upstream.status)?upstream.status:424;
   if(status===424||status===503){
    let detail='';
    try{const failure=await upstream.json();detail=[failure.code_reason,failure.error?.message].filter(value=>typeof value==='string').join(' ')}catch{}
    if(/balance|insufficient funds|余额|欠费|充值/i.test(detail))return reply({error:'provider balance'},402);
    if(/invalid.{0,12}(api.?key|token)|unauthorized|密钥.{0,12}(无效|错误)/i.test(detail))return reply({error:'provider credentials'},401);
    if(/permission|allowlist|forbidden|无权限|白名单/i.test(detail))return reply({error:'provider access'},403);
    if(/model.{0,25}(not found|not available|unsupported)|模型.{0,12}(不存在|不可用)/i.test(detail))return reply({error:'provider model'},404);
    if(/no.{0,20}(available|eligible).{0,20}(channel|provider)|没有可用|无可用渠道|渠道.{0,12}(不可用|异常)/i.test(detail))return reply({error:'provider channel unavailable'},521);
    if(/max_completion_tokens|unsupported parameter/i.test(detail))return reply({error:'provider parameter'},400);
   }
   return reply({error:'upstream'},status===503?523:status);
  }
  let envelope;try{envelope=await upstream.json()}catch{return reply({error:'invalid provider response'},422)} const content=envelope.choices?.[0]?.message?.content;
  if(typeof content!=='string')return reply({error:'invalid upstream content'},422);
  try{return reply(JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/gi,'')));}catch{return reply({error:"invalid AI JSON"},422)}
 }catch(error){const message=String(error?.message||''); const status=error?.name==='TimeoutError'?504:/header|ByteString|invalid character/i.test(message)?431:502; return reply({error:'upstream transport'},status)}
}};

async function streamSheju(request,env,headers){
 const fail=(error,status)=>Response.json({error},{status,headers});
 if(!env.CMRXX_API_KEY||!env.AI_MODEL)return fail('unconfigured',503);
 let input;
 try{input=await readBody(request)}catch{return fail('invalid JSON',400)}
 if(!Number.isInteger(input?.round)||input.round<1||input.round>5||typeof input.rule!=='string'||input.rule.length>160||!Array.isArray(input.people)||input.people.length<1||input.people.length>5)return fail('invalid round',400);
 const ids=new Set(input.people.map(p=>p?.id));
 if(ids.size!==input.people.length||[...ids].some(id=>!Number.isInteger(id)||id<0||id>10))return fail('invalid roster',400);
 if(JSON.stringify(input).length>16000)return fail('request too large',413);
 if(!(await env.GAME_LIMIT.limit({key:'public-game'})).success)return fail('rate limit',429);
 const system='润色已判定的修仙沙盘行动，每个角色输出一条紧凑 JSON，逐行输出，例如 {"id":3,"text":"剑小惑试丹，走火入魔。"}。最多45字。保持给定行动和最终状态，禁止新增人物。仅输出 JSON 行，无 Markdown。';
 try{
  const target=new URL('https://www.cmrxx.com/v1/chat/completions');
  const signal=AbortSignal.timeout(38000);
  const call=address=>fetch(address,{method:'POST',redirect:'manual',signal,headers:{Authorization:'Bearer '+env.CMRXX_API_KEY.trim(),'Content-Type':'application/json'},body:JSON.stringify({model:env.AI_MODEL,stream:true,max_completion_tokens:3600,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(input)}]})});
  let response=await call(target);
  for(let count=0;count<2&&[301,302,307,308].includes(response.status);count++){
   const location=response.headers.get('Location');
   if(!location)break;
   const next=new URL(location,target);
   if(next.origin!==target.origin||next.username||next.password)break;
   await response.body?.cancel();
   response=await call(next);
  }
  if(!response.ok)return fail('provider status',response.status>=400&&response.status<=599?response.status:424);
  if(!response.body||!response.headers.get('Content-Type')?.includes('text/event-stream'))return fail('provider did not stream',415);
  const decoder=new TextDecoder(),encoder=new TextEncoder();
  let sse='',pending='';
  function emit(line,controller){
   try{const item=JSON.parse(line);if(typeof item.text==='string'&&item.text.trim()&&item.text.length<=70&&ids.delete(item.id))controller.enqueue(encoder.encode(JSON.stringify({id:item.id,text:item.text.trim()})+'\n'))}catch{}
  }
  function event(line,controller){
   if(!line.startsWith('data:'))return;
   try{
    const part=JSON.parse(line.slice(5)).choices?.[0]?.delta?.content;
    if(typeof part!=='string')return;
    pending+=part;const lines=pending.split('\n');pending=lines.pop();
    for(const line of lines)emit(line,controller);
   }catch{}
  }
  const stream=response.body.pipeThrough(new TransformStream({
   transform(bytes,controller){
    sse+=decoder.decode(bytes,{stream:true});
    if(sse.length>64000||pending.length>10000)throw Error('stream too large');
    const lines=sse.split('\n');sse=lines.pop();
    for(const line of lines)event(line,controller);
   },
   flush(controller){event(sse+decoder.decode(),controller);emit(pending,controller)}
  }));
  return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8'}});
 }catch(error){return fail('provider transport',error?.name==='TimeoutError'?504:502)}
}

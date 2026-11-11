/* 文游工坊 SillyTavern adapter · MIT */
const EXT_URL = new URL('./', import.meta.url);
let overlay, frame, bridgeToken, inFlight = false;
function mount() {
 if(document.getElementById('wenyou-forge-launch')) return;
 const box=document.createElement('div');box.id='wenyou-forge-launch';box.className='extension_container';
 const title=document.createElement('b');title.textContent='文游工坊';
 const p=document.createElement('p');p.textContent='上传资料，开启手机端互动文游。';p.style.fontSize='12px';
 const b=document.createElement('button');b.type='button';b.className='menu_button';b.textContent='❀ 打开文游工坊';b.addEventListener('click',open);
 box.append(title,p,b);(document.querySelector('#extensions_settings2')||document.querySelector('#extensions_settings')||document.body).append(box);
}
function open(){
 if(overlay){overlay.hidden=false;return;}
 bridgeToken=crypto.randomUUID();overlay=document.createElement('div');overlay.id='wenyou-forge-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','文游工坊');
 const bar=document.createElement('div');bar.className='wenyou-hostbar';const title=document.createElement('span');title.textContent='文游工坊';
 const close=document.createElement('button');close.type='button';close.textContent='返回酒馆 ×';close.addEventListener('click',()=>{overlay.hidden=true;});bar.append(title,close);
 frame=document.createElement('iframe');frame.title='文游工坊互动页面';frame.src=new URL(`app.html?bridge=${encodeURIComponent(bridgeToken)}`,EXT_URL).href;
 // Trusted extension page. Source/model text is only rendered through textContent.
 overlay.append(bar,frame);document.body.append(overlay);close.focus();
}
async function receive(e){
 if(!frame||e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.token!==bridgeToken)return;
 const d=e.data;
 const send=payload=>frame.contentWindow.postMessage({...payload,token:bridgeToken},location.origin);
 if(d.type==='wenyou:ready'){send({type:'wenyou:connected'});return;}
 if(d.type!=='wenyou:generate')return;
 if(typeof d.id!=='string'||typeof d.prompt!=='string'||d.prompt.length>50000||typeof d.systemPrompt!=='string'||d.systemPrompt.length>5000)return;
 if(inFlight){send({type:'wenyou:result',id:d.id,error:'上一条生成尚未结束，请稍后再试。'});return;}
 inFlight=true;
 try{
 const ctx=globalThis.SillyTavern?.getContext?.();
 if(typeof ctx?.generateRaw!=='function')throw Error('当前酒馆不支持 generateRaw 对象参数接口，请更新至近期官方版本。');
 const result=await ctx.generateRaw({prompt:d.prompt,systemPrompt:d.systemPrompt,responseLength:4000});
 if(typeof result!=='string'||!result.trim())throw Error('模型返回为空。请检查酒馆 API 连接与最大回复长度。');
 send({type:'wenyou:result',id:d.id,text:result});
 }catch(error){send({type:'wenyou:result',id:d.id,error:error?.message||'模型生成失败。请检查酒馆连接。'});}finally{inFlight=false;}
}
window.addEventListener('message',receive);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();

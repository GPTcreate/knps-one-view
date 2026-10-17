'use strict';
(() => {
 const params=new URLSearchParams(location.hash.slice(1));
 let token=params.get('forest-seat-connect')||sessionStorage.getItem('forest-seat-bridge');
 if(!token)return;
 sessionStorage.setItem('forest-seat-bridge',token);
 if(params.has('forest-seat-connect')){params.delete('forest-seat-connect');history.replaceState(null,'',location.pathname+location.search+(params.size?'#'+params:''));}
 const panel=document.createElement('div');panel.id='forest-seat-bridge-panel';panel.style.cssText='position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#173f32;color:white;padding:16px 20px;border-radius:10px;font:12px/1.7 sans-serif;max-width:310px;box-shadow:0 5px 30px #0003';
 const title=document.createElement('strong');title.textContent='숲자리 공식현황 연결';const text=document.createElement('p');text.style.margin='6px 0 0';text.textContent='로컬 숲자리의 조회 요청을 기다립니다. 이 탭을 열어 두세요.';panel.append(title,text);document.body.append(panel);
 let running=false,lastJob=null;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function api(path,body){const response=await chrome.runtime.sendMessage({type:'forest-bridge',path,method:body?'POST':'GET',token,body});if(!response?.ok)throw new Error(response?.error||'연결 권한이 만료되었습니다. 숲자리에서 다시 연결해 주세요.');return response.data;}
 async function until(check,ms=30000){const start=Date.now();while(Date.now()-start<ms){const value=check();if(value)return value;await pause(250);}throw new Error('공식 조회가 지연되거나 로그인이 필요합니다.');}
 async function select(id,value){const el=await until(()=>{const el=document.getElementById(id);return el&&[...el.options].some(o=>o.value===value)?el:null;});el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));await pause(350);}
 function signedIn(){return !document.querySelector('#mmberId');}
 function loading(){return [...document.querySelectorAll('.blockUI.blockOverlay')].some(e=>getComputedStyle(e).display!=='none');}
 async function collect(facility,job){
  if(!signedIn())throw new Error('숲나들e에 로그인한 뒤 다시 연결해 주세요.');
  await select('srchSido',facility.region_id);
  await select('srchInstt',facility.id);
  await select('srchForest','01');
  const month=job.date.replaceAll('-','').slice(0,6);
  await select('monthSelectBox',month);
  const monthly=document.getElementById('inqurSctin01');if(monthly&&!monthly.checked)monthly.click();
  await until(()=>!loading());
  const button=document.getElementById('searchBtn');if(!button)throw new Error('공식 조회 버튼을 찾지 못했습니다.');
  // Same normal search action as the official page; never reserve or join a waitlist.
  button.click();await pause(1200);
  let previousCount=-1,stable=0;
  await until(()=>{
   if(!signedIn())throw new Error('로그인이 만료되었습니다.');
   if(loading())return false;
   const count=document.querySelectorAll('#monthRsrvtList .list_left li').length;
   if(count>0&&count===previousCount)stable++;else stable=0;
   previousCount=count;return stable>=3;
  },90000);
  return ForestExtractor.extract(document,{id:facility.id});
 }
 async function tick(){
  if(running)return;running=true;
  try{
   const response=await api('/api/bridge/job');const job=response.job;
   if(!job||job.state!=='pending'||job.id===lastJob)return;
   lastJob=job.id;
   if(!signedIn())throw new Error('이 탭에서 숲나들e 로그인을 완료해 주세요.');
   let success=0,failed=0;
   for(let i=0;i<job.facilities.length;i++){
    const latest=await api('/api/bridge/job');if(latest.job?.id!==job.id||latest.job?.state==='cancelled')break;
    const facility=job.facilities[i];text.textContent=`${i+1}/${job.facilities.length} · ${facility.name} 현황 확인 중. 조회 중에는 이 탭의 조건을 바꾸지 마세요.`;
    try{
     const item=await collect(facility,job);
     await api('/api/bridge/result',{job_id:job.id,item,facility_id:facility.id});success++;
    }catch(error){
     failed++;await api('/api/bridge/result',{job_id:job.id,facility_id:facility.id,error:String(error.message).slice(0,150)});
     if(!signedIn())throw error;
    }
    await api('/api/bridge/progress',{job_id:job.id,done:i+1,success,failed});
    await pause(1500);
   }
   await api('/api/bridge/progress',{job_id:job.id,complete:true,success,failed});
   text.textContent=`확인 완료 · 성공 ${success}곳, 미확인 ${failed}곳. 숲자리에서 결과를 비교하세요.`;
  }catch(error){text.textContent=error.message;}
  finally{running=false;}
 }
 tick();setInterval(tick,3000);
})();

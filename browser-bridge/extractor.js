/* Reads only the rendered public booking grid, never cookies or account details. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ForestExtractor=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function parseMark(label){
  const text=String(label||'').replace(/\s/g,'');
  if(text==='예')return {state:'available'};
  const wait=/^대([1-9]\d*)?$/.exec(text);if(wait)return {state:'waitlist',...(wait[1]?{next_rank:Number(wait[1])}:{})};
  if(text==='완')return {state:'full'};
  if(text==='휴'||text==='공')return {state:'closed'};
  if(text==='우')return {state:'priority'};
  if(text==='추')return {state:'lottery'};
  return {state:'unknown'};
 }
 function parseName(text){
  const match=/^\[([^\]]+)\](.+?)\s*\((\d+)인\/([^)]*)\)\s*$/.exec(text.trim());
  return match?{name:match[2].trim(),type:match[1],base_capacity:Number(match[3]),area:match[4],capacity:null}:{name:text.trim(),type:'숙소',capacity:null};
 }
 function extract(doc,options={}){
  const names=[...doc.querySelectorAll('#monthRsrvtList .list_left li a')];
  const rows=[...doc.querySelectorAll('#dayListTable tr')].filter(tr=>tr.querySelector('td'));
  if(!names.length||names.length!==rows.length)throw new Error('조회 결과가 아직 완성되지 않았습니다.');
  const rooms=names.map((anchor,index)=>{
   const identity=rows[index].querySelector('a[data-no]')?.getAttribute('data-no');
   const info=parseName(anchor.textContent);const days={};
   for(const mark of rows[index].querySelectorAll('.apt_mark[title]')){
    const match=/(\d{4})\.(\d{2})\.(\d{2})\s*$/.exec(mark.getAttribute('title')||'');
    if(match)days[`${match[1]}-${match[2]}-${match[3]}`]=parseMark(mark.textContent);
   }
   return {id:identity||'name:'+anchor.textContent.trim(),...info,days};
  });
  if(!rooms.some(r=>Object.keys(r.days).length))throw new Error('확인된 날짜별 현황이 없습니다.');
  return {id:options.id||doc.querySelector('#srchInstt')?.value,service:'forest',checked_at:options.checked_at||new Date().toISOString(),rooms};
 }
 return {parseMark,parseName,extract};
});

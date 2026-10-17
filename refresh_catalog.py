"""Refresh only the official public forest directory, with no login or credentials."""
from __future__ import annotations
from datetime import datetime,timezone
import json
from pathlib import Path
import urllib.parse
import urllib.request
from scraper_real import atomic_json

ROOT=Path(__file__).resolve().parent
BASE='https://www.foresttrip.go.kr'


def read_public(path):
    request=urllib.request.Request(BASE+path,headers={'User-Agent':'Mozilla/5.0','Accept':'application/json'})
    with urllib.request.urlopen(request,timeout=20) as response:
        return json.loads(response.read(8*1024*1024).decode('utf-8'))


def refresh(output=None):
    regions=read_public('/rep/or/selectSiDoList.do')
    if not isinstance(regions,list) or not regions:raise ValueError('Missing official regions')
    items={};names=[]
    for region in regions:
        code=str(region['detailCode']);area=str(region['codeNm']).strip()
        result=read_public('/rep/or/selectInsttListForSearch.do?'+urllib.parse.urlencode({'srchSido':code}))
        if not isinstance(result.get('insttList'),list) or not result['insttList']:raise ValueError('Incomplete official directory')
        names.append({'id':code,'name':area})
        for row in result['insttList']:
            identity=row['insttId'];name=row['insttNm']
            if not isinstance(identity,str) or not identity or not isinstance(name,str) or not name:raise ValueError('Invalid official facility')
            if identity in items:raise ValueError('Duplicate official facility')
            items[identity]={'id':identity,'service':'forest','name':name,'region':area,'region_id':code,'operator':{'01':'국립','02':'공립','04':'사립'}.get(row['insttTpCd'],'기타'),'url':BASE+('/'+identity if identity.isdigit() else '/indvz/main.do?'+urllib.parse.urlencode({'hmpgId':identity})),'calendar_url':BASE+'/rep/or/sssn/monthRsrvtStatus.do?'+urllib.parse.urlencode({'hmpgId':'FRIP','menuId':'001004','upperGoodsClsscCd':'01','srchSido':code,'insttId':identity})}
    result={'version':1,'collected_at':datetime.now(timezone.utc).isoformat(),'source':BASE+'/main.do?hmpgId=FRIP','regions':names,'forests':list(items.values())}
    atomic_json(output or ROOT/'catalog.json',result)
    return result


if __name__=='__main__':
    result=refresh();print(f"Saved {len(result['forests'])} official facilities in {len(result['regions'])} regions.")

"""Durable facility/month work queue and shared, timestamp-preserving observations."""
from __future__ import annotations
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import sqlite3
import time

REFRESH_SECONDS=300
LEASE_SECONDS=120
MAX_RUN_SECONDS=300
MAX_ATTEMPTS=3
MAX_PENDING=512


class Conflict(ValueError):pass
class QueueFull(ValueError):pass


class SharedQueue:
    def __init__(self,path,clock=time.time):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True);self.clock=clock
        with self.connection() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript('''
              CREATE TABLE IF NOT EXISTS work (
                facility_id TEXT NOT NULL, month TEXT NOT NULL, requested_date TEXT NOT NULL,
                state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                created REAL NOT NULL, updated REAL NOT NULL, next_try REAL NOT NULL,
                lease TEXT, collector TEXT, lease_until REAL, claimed REAL,
                acknowledged TEXT, outcome TEXT,
                PRIMARY KEY (facility_id,month)
              );
              CREATE INDEX IF NOT EXISTS work_ready ON work(state,next_try,created);
              CREATE TABLE IF NOT EXISTS observations (facility_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS checks (facility_id TEXT NOT NULL,month TEXT NOT NULL,checked REAL NOT NULL,PRIMARY KEY(facility_id,month));
              CREATE TABLE IF NOT EXISTS collectors (id TEXT PRIMARY KEY,last_seen REAL NOT NULL,paused INTEGER NOT NULL DEFAULT 0);
            ''')

    @contextmanager
    def connection(self):
        db=sqlite3.connect(self.path,timeout=10,isolation_level=None)
        db.row_factory=sqlite3.Row
        try:yield db
        finally:db.close()

    @contextmanager
    def transaction(self):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            try:yield db;db.commit()
            except Exception:db.rollback();raise

    def _expire(self,db,now):
        db.execute("UPDATE work SET state=CASE WHEN attempts>=? THEN 'failed' ELSE 'queued' END,next_try=?,updated=?,outcome='disconnected' WHERE state='leased' AND (lease_until<? OR claimed<?)",
                   (MAX_ATTEMPTS,now+15,now,now,now-MAX_RUN_SECONDS))

    def enqueue(self,facilities,day):
        now=self.clock();month=day[:7]
        with self.transaction() as db:
            self._expire(db,now)
            pending=db.execute("SELECT count(*) FROM work WHERE state IN ('queued','leased')").fetchone()[0]
            for facility in facilities:
                identity=facility['id']
                observed=db.execute('SELECT checked FROM checks WHERE facility_id=? AND month=?',(identity,month)).fetchone()
                if observed and 0 <= now-observed['checked'] < REFRESH_SECONDS:continue
                row=db.execute('SELECT * FROM work WHERE facility_id=? AND month=?',(identity,month)).fetchone()
                if row and (row['state'] in ('queued','leased') or (row['state']=='failed' and row['next_try']>now)):continue
                if pending>=MAX_PENDING:raise QueueFull('Collection queue is full')
                db.execute("INSERT INTO work(facility_id,month,requested_date,state,created,updated,next_try) VALUES(?,?,?,'queued',?,?,?) ON CONFLICT(facility_id,month) DO UPDATE SET requested_date=excluded.requested_date,state='queued',attempts=0,created=excluded.created,updated=excluded.updated,next_try=excluded.next_try,lease=NULL,collector=NULL,lease_until=NULL,claimed=NULL,acknowledged=NULL,outcome=NULL",(identity,month,day,now,now,now))
                pending+=1
        return self.summary([x['id'] for x in facilities],month)

    def summary(self,identities,month):
        now=self.clock();result={'total':len(identities),'queued':0,'running':0,'failed':0,'fresh':0,'offline':True,'scope':'facility_month'}
        with self.transaction() as db:
            self._expire(db,now)
            active=db.execute('SELECT max(last_seen) FROM collectors WHERE paused=0').fetchone()[0]
            result['offline']=not active or now-active>20
            for identity in identities:
                observed=db.execute('SELECT checked FROM checks WHERE facility_id=? AND month=?',(identity,month)).fetchone()
                if observed and 0 <= now-observed['checked'] < REFRESH_SECONDS:
                    result['fresh']+=1;continue
                row=db.execute('SELECT state FROM work WHERE facility_id=? AND month=?',(identity,month)).fetchone()
                if row:
                    if row['state']=='queued':result['queued']+=1
                    elif row['state']=='leased':result['running']+=1
                    elif row['state']=='failed':result['failed']+=1
            result['pending']=result['queued']+result['running']
        return result

    def claim(self,collector,facilities,active_lease=None):
        now=self.clock();known={x['id']:x for x in facilities}
        with self.transaction() as db:
            self._expire(db,now)
            db.execute('INSERT INTO collectors(id,last_seen,paused) VALUES(?,?,0) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen,paused=0',(collector,now))
            row=db.execute("SELECT * FROM work WHERE collector=? AND state='leased'",(collector,)).fetchone()
            if row:
                if active_lease in (None,'',row['lease']):
                    db.execute('UPDATE work SET lease_until=?,updated=? WHERE lease=?',(min(now+LEASE_SECONDS,row['claimed']+MAX_RUN_SECONDS),now,row['lease']))
                elif row['lease_until']>now:
                    return None
            if not row:
                row=db.execute("SELECT * FROM work WHERE state='queued' AND next_try<=? ORDER BY created LIMIT 1",(now,)).fetchone()
                if not row:return None
                if row['facility_id'] not in known:
                    db.execute("UPDATE work SET state='failed',next_try=?,updated=?,outcome='removed' WHERE facility_id=? AND month=?",(now+600,now,row['facility_id'],row['month']))
                    return None
                lease=secrets.token_urlsafe(24)
                db.execute("UPDATE work SET state='leased',attempts=attempts+1,lease=?,collector=?,lease_until=?,claimed=?,updated=?,acknowledged=NULL WHERE facility_id=? AND month=?",(lease,collector,now+LEASE_SECONDS,now,now,row['facility_id'],row['month']))
                row=db.execute('SELECT * FROM work WHERE lease=?',(lease,)).fetchone()
            return {'id':row['lease'],'state':'pending','date':row['requested_date'],'facilities':[known[row['facility_id']]],'done':0,'completed_ids':[]}

    def submit(self,collector,lease,facility_id,item,merge):
        now=self.clock()
        with self.transaction() as db:
            self._expire(db,now)
            row=db.execute('SELECT * FROM work WHERE lease=? AND collector=?',(lease,collector)).fetchone()
            if not row or row['facility_id']!=facility_id:raise Conflict('Lease does not belong to this collector or facility')
            if row['acknowledged']==lease:return {'ok':True,'duplicate':True}
            if row['state']!='leased' or row['lease_until']<now:raise Conflict('Lease expired')
            if item is None:
                terminal=row['attempts']>=MAX_ATTEMPTS
                db.execute("UPDATE work SET state=?,next_try=?,updated=?,acknowledged=?,outcome='upstream_failed' WHERE lease=?",('failed' if terminal else 'queued',now+(600 if terminal else min(120,15*2**(row['attempts']-1))),now,lease,lease))
                return {'ok':True,'retry':not terminal}
            checked=datetime.fromisoformat(item['checked_at'].replace('Z','+00:00')).timestamp()
            if checked<row['claimed']-5 or checked>now+300 or now-checked>300:raise ValueError('Observation must belong to the current collection')
            if not any(room['days'] for room in item['rooms']) or any(day[:7]!=row['month'] for room in item['rooms'] for day in room['days']):raise ValueError('Observation month differs from work')
            prior=db.execute('SELECT payload FROM observations WHERE facility_id=?',(facility_id,)).fetchone()
            old=json.loads(prior['payload']) if prior else None
            if old:
                old={**old,'rooms':[{**room,'days':{day:status for day,status in room['days'].items() if day[:7]!=row['month']}} for room in old['rooms']]}
                old['rooms']=[room for room in old['rooms'] if room['days']]
            observation=merge(old,item)
            db.execute('INSERT INTO observations(facility_id,payload) VALUES(?,?) ON CONFLICT(facility_id) DO UPDATE SET payload=excluded.payload',(facility_id,json.dumps(observation,ensure_ascii=False,allow_nan=False)))
            db.execute('INSERT INTO checks(facility_id,month,checked) VALUES(?,?,?) ON CONFLICT(facility_id,month) DO UPDATE SET checked=excluded.checked',(facility_id,row['month'],checked))
            db.execute("UPDATE work SET state='done',updated=?,acknowledged=?,outcome='success' WHERE lease=?",(now,lease,lease))
            return {'ok':True}

    def acknowledge(self,collector,lease,paused=False):
        now=self.clock()
        with self.transaction() as db:
            self._expire(db,now)
            row=db.execute('SELECT * FROM work WHERE collector=? AND lease=?',(collector,lease)).fetchone()
            if not row:raise Conflict('Lease is no longer active')
            if paused:
                db.execute('UPDATE collectors SET paused=1 WHERE id=?',(collector,))
                if row['state']=='leased':db.execute("UPDATE work SET state='queued',next_try=?,updated=?,lease=NULL,collector=NULL,outcome='paused' WHERE lease=?",(now+15,now,lease))
            elif row['acknowledged']!=lease:raise Conflict('An observation or failure result is required before completion')
        return {'ok':True}

    def pause(self,collector):
        now=self.clock()
        with self.transaction() as db:
            db.execute('UPDATE collectors SET paused=1 WHERE id=?',(collector,))
            db.execute("UPDATE work SET state='queued',next_try=?,updated=?,lease=NULL,collector=NULL,outcome='paused' WHERE collector=? AND state='leased'",(now+15,now,collector))

    def items(self):
        with self.connection() as db:return [json.loads(row['payload']) for row in db.execute('SELECT payload FROM observations ORDER BY facility_id')]

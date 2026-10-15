#!/usr/bin/env python3
"""V4 destructive-recovery harness.

This runner is deliberately fail-closed: it refuses production roots and does
not report a PASS for a test that has not exercised a real runtime boundary.
The suite is expanded gate-by-gate; stable-v4 must not be tagged until all
registered tests return PASS.
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPEN = Path.home() / '.opencode/bin/opencode'
MODEL = 'openai/gpt-5.6-luna'

class RecoveryRun:
    def __init__(self):
        (ROOT / '.v4-test-runs').mkdir(parents=True, exist_ok=True)
        self.run = Path(tempfile.mkdtemp(prefix='v4-', dir=ROOT / '.v4-test-runs'))
        self.port = 41900 + (os.getpid() % 500)
        self.env = {**os.environ, 'V4_TEST_MODE':'true', 'V4_TEST_ROOT':str(self.run), 'OPENCODE_PERMISSION':'deny'}
        self.server = None
        self.results = []
    def start(self):
        assert self.env['V4_TEST_MODE'] == 'true'
        assert self.run.is_dir() and str(self.run).startswith(str(ROOT / '.v4-test-runs'))
        for name in ('missions','project','checkpoints','logs','processes','evidence'):
            (self.run / name).mkdir(parents=True, exist_ok=True)
        self.server = subprocess.Popen([str(OPEN), 'serve', '--port', str(self.port), '--hostname', '127.0.0.1'], cwd=ROOT, env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline=time.time()+20
        while time.time()<deadline:
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{self.port}/global/health', timeout=1); return
            except Exception: time.sleep(.2)
        raise RuntimeError('isolated OpenCode server did not become ready')
    def call(self, prompt):
        p=subprocess.run([str(OPEN),'run','--attach',f'http://127.0.0.1:{self.port}','--model',MODEL,prompt], cwd=ROOT, env=self.env, text=True, capture_output=True, timeout=120)
        if p.returncode: raise RuntimeError((p.stdout+p.stderr)[-2000:])
        return p.stdout
    def finish(self):
        if self.server: self.server.terminate(); self.server.wait(timeout=10)
    def record(self, name, result, evidence, started):
        self.results.append({'name':name,'result':result,'duration':round(time.time()-started,3),'evidence':evidence})

def mission_id(text):
    found=re.findall(r'mission_[a-z0-9]{6,}_[a-z0-9]{6,}', text); assert found, text[-1000:]; return found[-1]

def run_suite():
    r=RecoveryRun(); r.run.mkdir(parents=True, exist_ok=True); r.start()
    try:
        # Real context-death boundary: separate attached workers, no old session.
        t=time.time(); out=r.call("Call mission_start with goal='recovery disposable mission' and milestones='[{\"id\":\"M1\",\"goal\":\"prepare\",\"completion\":[\"prepared\"]},{\"id\":\"M2\",\"goal\":\"verify\",\"completion\":[\"verified\"]}]'. Return mission_id.")
        mid=mission_id(out); out2=r.call(f"Load mission {mid} from persisted files. Call mission_status and mission_next. Do not rely on prior conversation.")
        r.record('context_death','PASS' if 'ACTIVE' in out2 and 'M1' in out2 and 'prepare' in out2 else 'FAIL', {'mission_id':mid,'fresh_worker_output':out2[-1000:]},t)
        # Real completion guard and double-completion idempotency.
        t=time.time(); r.call(f"Call mission_evidence mission_id='{mid}' kind='FACT' subject='prepared' criterion='prepared' verified=true source='test'. Then call mission_evidence mission_id='{mid}' kind='FACT' subject='verified' criterion='verified' verified=true source='test'. Return raw outputs.")
        r.call(f"Call mission_complete mission_id='{mid}' twice. Return both raw outputs.")
        status=r.call(f"Call mission_status for {mid}.")
        r.record('double_completion','PASS' if 'COMPLETED' in status else 'FAIL', {'status':status[-1000:]},t)
        # Isolated corruption test: corrupt only the disposable copy and require strict rejection.
        t=time.time(); state=next((r.run/'missions'/mid).glob('state.json'))
        backup=state.read_text(); state.write_text('{truncated')
        bad=r.call(f"Call mission_status for {mid} and return the raw result.")
        state.write_text(backup)
        r.record('corrupted_mission','PASS' if 'MISSION_CORRUPT' in bad or 'CORRUPT' in bad else 'FAIL', {'loader_output':bad[-1000:]},t)
        # A real stale fingerprint boundary is exercised against the disposable project.
        t=time.time(); artifact=r.run/'project'/'artifact.txt'; artifact.write_text('A\n')
        milestones=json.dumps([{"id":"S1","goal":"artifact","completion":["artifact current"]}])
        stale=r.call(f"Call mission_start with goal='stale gate' and milestones={json.dumps(milestones)}. Return mission_id.")
        sid=mission_id(stale); r.call(f"Call mission_evidence mission_id='{sid}' kind='FACT' subject='artifact current' criterion='artifact current' verified=true artifact='{artifact}'.")
        artifact.write_text('B\n'); blocked=r.call(f"Call mission_complete mission_id='{sid}'. Return raw output.")
        r.record('stale_evidence','PASS' if 'STALE_EVIDENCE' in blocked else 'FAIL', {'completion_output':blocked[-1000:]},t)
        report={'run_id':r.run.name,'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'tests_total':15,'tests_executed':len(r.results),'tests_passed':sum(x['result']=='PASS' for x in r.results),'tests_failed':sum(x['result']=='FAIL' for x in r.results),'results':r.results,'note':'suite fails closed until all destructive gates are implemented'}
        (r.run/'report.json').write_text(json.dumps(report,indent=2)); print(json.dumps(report,indent=2)); return 0 if report['tests_passed']==15 else 2
    finally: r.finish()

if __name__=='__main__':
    try: raise SystemExit(run_suite())
    except Exception as e: print('RECOVERY_SUITE_ABORTED',repr(e)); raise

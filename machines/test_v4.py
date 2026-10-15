#!/usr/bin/env python3
"""Fast V4 invariant checks over durable mission artifacts."""
import json, sys
from pathlib import Path

ROOT = Path.home() / '.config/opencode/memory/missions'
def lines(p): return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]
missions = sorted([p for p in ROOT.iterdir() if p.is_dir()]) if ROOT.exists() else []
assert missions, 'no durable missions found'
checked = 0
for d in missions:
    if not all((d / n).exists() for n in ('plan.json','state.json','evidence.jsonl','history.jsonl')): continue
    plan=json.loads((d/'plan.json').read_text()); state=json.loads((d/'state.json').read_text()); ev=lines(d/'evidence.jsonl'); hist=lines(d/'history.jsonl')
    assert state['mission_id']==plan['mission_id']==d.name
    assert state['status'] in {'ACTIVE','BLOCKED','FAILED','COMPLETED','VERIFYING','CANCELLED','PENDING'}
    assert all(e.get('kind') in {'FACT','CLAIM','HYPOTHESIS','GOAL'} for e in ev)
    if state['status']=='COMPLETED':
        for m in plan.get('milestones',[]):
            for criterion in m.get('completion',[]):
                assert any(e.get('kind')=='FACT' and e.get('verified') is True and e.get('criterion')==criterion for e in ev), (d.name, criterion)
    checked += 1
assert checked, 'no complete mission artifacts found'
print(f'V4_INVARIANTS_PASS missions_checked={checked}')

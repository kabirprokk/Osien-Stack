#!/bin/bash
# OSIEN finish chime: soft two-note synth (A5 -> E6), no voice, zero assets.
python3 <<'PY'
import math, struct, os, wave, shutil
RATE = 44100
buf = [0] * int(RATE * 0.46)
for freq, st in ((880.0, 0.0), (1318.5, 0.11)):
    dur, n = 0.34, int(RATE * 0.34)
    off = int(RATE * st)
    for i in range(n):
        t = i / RATE
        a = min(1.0, t / 0.008) * (1.0 - (t / dur) ** 2.2)
        s = (math.sin(2*math.pi*freq*t)*0.72 + math.sin(2*math.pi*freq*2*t)*0.20
             + math.sin(2*math.pi*freq*3*t)*0.08)
        j = off + i
        if j < len(buf):
            buf[j] += int(max(-1, min(1, s*a*0.22)) * 32767)
p = "/tmp/osien-chime-%d.wav" % os.getpid()
w = wave.open(p, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
w.writeframes(b"".join(struct.pack("<h", v) for v in buf)); w.close()
for c in (["paplay", p], ["aplay", "-q", p]):
    if shutil.which(c[0]):
        os.system(" ".join(c) + " >/dev/null 2>&1 &"); break
try: os.remove(p)
except Exception: pass
PY

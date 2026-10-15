#!/usr/bin/env python3
"""OSIEN understand: VIDEO -> frames + audio + transcript + contact sheet + meta.
No keys, all local (ffmpeg + Pillow + SpeechRecognition/Google-free-STT).
Usage: understand.py VIDEO OUTDIR  -> writes meta.json, transcript.txt, sheet.jpg, frames/
"""
import json, os, subprocess, sys, wave

HOME = os.path.expanduser("~")
sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))

def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)

def main():
    video, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(f"{outdir}/frames", exist_ok=True)
    meta = {"video": video}
    # 1. probe
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", video],
        capture_output=True, text=True).stdout)
    vs = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), {})
    has_audio = any(s.get("codec_type") == "audio" for s in probe.get("streams", []))
    meta.update(duration=float(probe.get("format", {}).get("duration", 0)),
                size=os.path.getsize(video), width=vs.get("width"), height=vs.get("height"),
                has_audio=has_audio)
    # 2. frames: 1fps, cap 24, small
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-vf", "fps=1,scale=320:-1",
         f"{outdir}/frames/f%03d.jpg"])
    frames = sorted(os.listdir(f"{outdir}/frames"))[:24]
    meta["frames"] = len(frames)
    # 3. contact sheet (Pillow montage 6 cols)
    from PIL import Image
    thumbs = [Image.open(f"{outdir}/frames/{f}") for f in frames]
    cols, pad = 6, 4
    rows = (len(thumbs) + cols - 1) // cols
    w, h = thumbs[0].size
    sheet = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad) + pad), (16, 16, 22))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (pad + (i % cols) * (w + pad), pad + (i // cols) * (h + pad)))
    sheet.save(f"{outdir}/sheet.jpg", quality=70)
    # 4. audio -> wav 16k mono -> transcript chunks
    transcript = ""
    if has_audio:
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-ar", "16000", "-ac", "1", f"{outdir}/audio.wav"])
        import speech_recognition as sr
        r = sr.Recognizer()
        with wave.open(f"{outdir}/audio.wav") as wf:
            n, fr = wf.getnframes(), wf.getframerate()
            chunk = fr * 25  # 25s windows
            parts = []
            for start in range(0, n, chunk):
                wf.setpos(start)
                data = wf.readframes(chunk)
                audio = sr.AudioData(data, fr, 2)
                try:
                    parts.append(r.recognize_google(audio))
                except Exception:
                    pass
        transcript = " ".join(parts)
    open(f"{outdir}/transcript.txt", "w").write(transcript or "(no speech detected)")
    meta["speech_chars"] = len(transcript)
    json.dump(meta, open(f"{outdir}/meta.json", "w"), indent=1)
    print(json.dumps({k: meta[k] for k in ("duration", "size", "width", "height", "frames", "speech_chars")}))

if __name__ == "__main__":
    main()

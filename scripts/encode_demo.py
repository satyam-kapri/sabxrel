"""Encode real browser captures and synthetic narration as a two-part MP4."""
from pathlib import Path
import json
import re
import subprocess
import wave

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT/"output"/"demo"
segments = json.loads((DEMO/"segments.json").read_text(encoding="utf-8"))
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
names = ["overview", "cutoff", "accuracy", "methodology", "architecture", "selection", "verification", "delivery"]
durations = []
for segment, name in zip(segments, names):
    number = segment["number"]
    audio = DEMO/f"{number}.wav"
    with wave.open(str(audio)) as stream:
        duration = stream.getnframes()/stream.getframerate()
    durations.append(duration)
    frame = DEMO/"frames"/f"{number}-{name}.jpg"
    target = DEMO/f"{number}.mp4"
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", str(frame), "-i", str(audio), "-t", str(duration), "-vf", "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2:color=0x102e29,setsar=1", "-c:v", "libx264", "-tune", "stillimage", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "12", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", str(target)], check=True)
    print(f"Encoded {number}: {duration:.1f}s", flush=True)
if sum(durations[:4]) > 300 or sum(durations[4:]) > 300 or sum(durations) > 600:
    raise SystemExit("Demo exceeds the brief's duration limits")
playlist = DEMO/"concat.txt"
playlist.write_text("\n".join(f"file '{segment['number']}.mp4'" for segment in segments))
final = ROOT/"output"/"ventus-demo.mp4"
subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(playlist), "-c", "copy", "-movflags", "+faststart", str(final)], check=True)

def stamp(seconds):
    milliseconds = round(seconds*1000)
    return f"{milliseconds//3600000:02}:{milliseconds//60000%60:02}:{milliseconds//1000%60:02},{milliseconds%1000:03}"

offset = 0
captions = []
chapters = []
for segment, duration in zip(segments, durations):
    chapters.append({"title": segment["title"], "startSeconds": round(offset, 2), "durationSeconds": round(duration, 2)})
    sentences = re.split(r"(?<=[.!?])\s+", segment["text"])
    size = sum(len(sentence) for sentence in sentences)
    for sentence in sentences:
        end = offset + duration*len(sentence)/size
        captions.append(f"{len(captions)+1}\n{stamp(offset)} --> {stamp(end)}\n{sentence}\n")
        offset = end
(ROOT/"output"/"ventus-demo.srt").write_text("\n".join(captions), encoding="utf-8")
report = {"file": str(final), "durationSeconds": round(sum(durations), 2), "clientSeconds": round(sum(durations[:4]), 2), "technicalSeconds": round(sum(durations[4:]), 2), "syntheticNarration": True, "chapters": chapters}
(ROOT/"output"/"demo-manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps({k:v for k,v in report.items() if k != "chapters"}, indent=2))

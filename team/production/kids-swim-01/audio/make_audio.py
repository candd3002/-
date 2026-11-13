"""Original music and splash effects for the swim short. Synthesised with numpy.

No third-party samples or licensed tracks. Output: 32 s stereo WAV at 44.1 kHz.
"""
import sys
import wave
import numpy as np

SR, SECONDS = 44100, 32
OUT = sys.argv[1]
t = np.arange(SR * SECONDS) / SR
audio = np.zeros((len(t), 2))

def note(freq, start, dur, vol=0.18, wave_kind="tri"):
    i0 = int(start * SR); n = int(dur * SR)
    if n <= 0 or i0 >= len(t): return
    tt = np.arange(min(n, len(t) - i0)) / SR
    if wave_kind == "tri":
        s = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * freq * tt))
    else:
        s = np.sin(2 * np.pi * freq * tt)
    env = np.minimum(1, tt / 0.02) * np.exp(-tt * 1.6 / dur)
    sig = s * env * vol
    audio[i0:i0 + len(sig), 0] += sig * 0.9
    audio[i0:i0 + len(sig), 1] += sig * 1.1

# C major, a simple playful loop: C E G A | G E C (bar = 2 s)
melody = [(523.25, 0), (659.25, .5), (783.99, 1), (880, 1.5),
          (783.99, 2), (659.25, 2.5), (523.25, 3), (587.33, 3.5)]
for rep in range(16):
    base = rep * 2
    for f, off in melody:
        note(f, base + off * 0.5, 0.45, vol=0.16, wave_kind="sin")
    # bass on each bar
    note(130.81 if rep % 2 == 0 else 196.0, base, 1.9, vol=0.2, wave_kind="tri")

def splash(start, dur=0.9, vol=0.35):
    i0 = int(start * SR); n = int(dur * SR)
    if i0 + n > len(t): n = len(t) - i0
    noise = np.random.default_rng(int(start * 10)).standard_normal(n)
    env = np.exp(-np.arange(n) / (SR * 0.22))
    # low-pass by a short moving average to make it a soft whoosh
    k = np.ones(40) / 40
    s = np.convolve(noise, k, mode="same") * env * vol
    audio[i0:i0 + n, 0] += s
    audio[i0:i0 + n, 1] += s * 0.85

for when in (0.2, 8.1, 16.2, 24.3):
    splash(when)

# Gentle plop bubbles during float and kick
for when in np.arange(9, 15, 0.9):
    note(900 + 300 * np.random.default_rng(int(when * 7)).random(), when, 0.18, vol=0.07, wave_kind="sin")

peak = np.max(np.abs(audio)) or 1
audio = audio / peak * 0.85
pcm = (audio * 32767).astype(np.int16)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", OUT)

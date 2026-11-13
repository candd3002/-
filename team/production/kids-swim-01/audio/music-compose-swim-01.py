"""Original playful music + simple SFX for kids-swim-01 (no lyrics).

Synthesised entirely with numpy: no samples, no licensed tracks, no external audio.
Key: G major, 112 BPM, I-vi-IV-V loop, 32 s stereo WAV at 44.1 kHz.
Splash times match the cues in make_audio.py (0.2, 8.1, 16.2, 24.3 s) so the
track lines up with the existing v2 video.

Usage: python3 music-compose-swim-01.py <output.wav>
"""
import sys
import wave
import numpy as np

SR, SECONDS = 44100, 32
BPM = 112
BEAT = 60.0 / BPM
BAR = 4 * BEAT
OUT = sys.argv[1] if len(sys.argv) > 1 else "music-swim-01.wav"

N = SR * SECONDS
audio = np.zeros((N, 2))
rng = np.random.default_rng(2026)

def add(sig, i0, pan=0.0):
    """Mix a mono signal into the stereo buffer at sample i0 with a simple pan."""
    if i0 >= N or i0 < 0:
        return
    n = min(len(sig), N - i0)
    left = (1 - max(pan, 0)) ** 0.5
    right = (1 + min(pan, 0)) ** 0.5
    audio[i0:i0 + n, 0] += sig[:n] * left
    audio[i0:i0 + n, 1] += sig[:n] * right

def pluck(freq, start, dur, vol=0.16, pan=0.0):
    """Marimba-like tone: sine + decaying 2nd and 3rd partials."""
    i0 = int(start * SR)
    n = int(max(dur, 0.12) * SR * 2.2)
    tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * tt)
         + 0.35 * np.sin(2 * np.pi * 2 * freq * tt) * np.exp(-tt * 9)
         + 0.12 * np.sin(2 * np.pi * 3 * freq * tt) * np.exp(-tt * 14))
    env = np.minimum(1, tt / 0.004) * np.exp(-tt * 4.2)
    add(s * env * vol, i0, pan)

def hat(start, vol=0.045):
    """Soft shaker tick: high-passed noise, very short decay."""
    i0 = int(start * SR)
    n = int(0.05 * SR)
    noise = rng.standard_normal(n)
    hp = np.diff(noise, prepend=0.0)
    env = np.exp(-np.arange(n) / (SR * 0.012))
    add(hp * env * vol, i0, pan=rng.uniform(-0.3, 0.3))

def plop(start, f0=320, f1=720, vol=0.07):
    """Bubble: short sine with an upward pitch slide."""
    i0 = int(start * SR)
    n = int(0.16 * SR)
    tt = np.arange(n) / SR
    f = f0 + (f1 - f0) * tt / 0.16
    phase = 2 * np.pi * np.cumsum(f) / SR
    env = np.minimum(1, tt / 0.005) * np.exp(-tt * 22)
    add(np.sin(phase) * env * vol, i0, pan=rng.uniform(-0.6, 0.6))

def splash(start, dur=0.9, vol=0.3):
    """Soft whoosh: low-passed noise with a fast fade."""
    i0 = int(start * SR)
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    env = np.exp(-np.arange(n) / (SR * 0.22))
    lp = np.convolve(noise, np.ones(40) / 40, mode="same")
    add(lp * env * vol, i0, pan=0.0)

# Hz for the notes used below
G3, E3, C3, D3 = 196.00, 164.81, 130.81, 146.83
G4, A4, B4, C5, D5, E5, Fs5, G5 = 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 739.99, 783.99
A5, B5, C6 = 880.00, 987.77, 1046.50

# Chords as bass roots, one per bar: G, Em, C, D
bass_roots = [G3, E3, C3, D3]

# 4-bar melodic phrase: (beat-in-bar, freq, length-in-beats)
phrase = [
    # bar 1 (G)
    [(0, G5, .5), (.5, B4, .5), (1, D5, 1), (2, G5, .5), (2.5, D5, .5), (3, B4, 1)],
    # bar 2 (Em)
    [(0, E5, 1), (1, G5, .5), (1.5, B5, .5), (2, A5, 1), (3, G5, .5), (3.5, E5, .5)],
    # bar 3 (C)
    [(0, C5, .5), (.5, E5, .5), (1, G5, 1), (2, C6, 1), (3, A5, .5), (3.5, G5, .5)],
    # bar 4 (D)
    [(0, Fs5, .5), (.5, A5, .5), (1, D5, .5), (1.5, Fs5, .5), (2, A5, 1), (3, D5, 1)],
]

total_bars = int(np.ceil(SECONDS / BAR)) + 1
for bar in range(total_bars):
    t0 = bar * BAR
    if t0 >= SECONDS:
        break
    phrase_bar = bar % 4
    phrase_no = bar // 4
    # Bass: root on beats 1 and 3, softer on the 3rd
    root = bass_roots[phrase_bar]
    pluck(root, t0, BEAT * 1.8, vol=0.14, pan=-0.2)
    pluck(root, t0 + 2 * BEAT, BEAT * 1.5, vol=0.09, pan=-0.2)
    # Melody: lift it slightly on the last phrase for a little variety
    lift = 1.0 if phrase_no < 3 else 1.1
    for beat, f, length in phrase[phrase_bar]:
        pluck(f * lift, t0 + beat * BEAT, length * BEAT, vol=0.15, pan=0.25)
    # Shaker on every off-beat eighth
    for k in range(8):
        hat(t0 + (k + 0.5) * BEAT / 2)

# Splashes (same cue times as make_audio.py so the track matches the video)
for when in (0.2, 8.1, 16.2, 24.3):
    splash(when)

# Bubbles while floating
for when in np.arange(9.0, 15.0, 0.9):
    plop(when + rng.uniform(0, 0.15))

# Gentle fade in and out
fade_in = int(0.4 * SR)
fade_out = int(1.5 * SR)
audio[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
audio[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]

peak = np.max(np.abs(audio)) or 1
audio = audio / peak * 0.85
pcm = (audio * 32767).astype(np.int16)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", OUT, f"{SECONDS}s", f"{BPM} BPM", "G major")

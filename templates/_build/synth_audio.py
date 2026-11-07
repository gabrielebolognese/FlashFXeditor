"""Synthesized music beds and sound effects for the templates (all original, no license needed).

Usage: python -I synth_audio.py <out dir>
Writes <out>/music/*.wav, <out>/sfx/*.wav and <out>/music/beats.json (beat times per track).
"""
import json
import os
import sys
import wave

import numpy as np

SR = 48000
OUT = sys.argv[1]
rng = np.random.default_rng(7)


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def env_exp(n, decay, attack=0.002):
    t = np.arange(n) / SR
    a = np.minimum(1.0, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    t = np.arange(n) / SR
    total = n / SR
    e = np.ones(n) * s
    e = np.where(t < a, t / a, e)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / d, e)
    rel_start = max(total - r, a + d)
    e = np.where(t >= rel_start, s * np.maximum(0, 1 - (t - rel_start) / r), e)
    return e


def lowpass(x, cutoff, order=2):
    n = len(x)
    size = 1 << int(np.ceil(np.log2(max(n, 2))))
    spec = np.fft.rfft(x, size)
    f = np.fft.rfftfreq(size, 1 / SR)
    spec *= 1 / np.sqrt(1 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(spec, size)[:n]


def highpass(x, cutoff, order=2):
    n = len(x)
    size = 1 << int(np.ceil(np.log2(max(n, 2))))
    spec = np.fft.rfft(x, size)
    f = np.fft.rfftfreq(size, 1 / SR)
    f[0] = 1e-6
    spec *= 1 / np.sqrt(1 + (cutoff / f) ** (2 * order))
    return np.fft.irfft(spec, size)[:n]


def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def saw(freq, t, detune=0.0):
    ph = (freq * (1 + detune) * t) % 1.0
    return 2 * ph - 1


def square(freq, t, pw=0.5):
    return np.where((freq * t) % 1.0 < pw, 1.0, -1.0)


def tri(freq, t):
    return 2 * np.abs(2 * ((freq * t) % 1.0) - 1) - 1


def note(n):
    """MIDI note to Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def ir(seconds=1.6, damp=4000, stereo=True):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    chans = []
    for _ in range(2 if stereo else 1):
        noise = rng.standard_normal(n) * np.exp(-t * 6.9 / seconds)
        chans.append(lowpass(noise, damp) * 0.25)
    return np.stack(chans, axis=1)


def convolve(x, kernel, block=1 << 17):
    """Overlap-add FFT convolution of mono x with a (n, 2) kernel: stereo out."""
    k = kernel.shape[0]
    size = 1 << int(np.ceil(np.log2(block + k)))
    kspec = [np.fft.rfft(kernel[:, c], size) for c in range(kernel.shape[1])]
    out = np.zeros((len(x) + k, kernel.shape[1]), dtype=np.float32)
    for start in range(0, len(x), block):
        seg = x[start:start + block]
        sspec = np.fft.rfft(seg, size)
        for c in range(kernel.shape[1]):
            y = np.fft.irfft(sspec * kspec[c], size)[: len(seg) + k]
            out[start:start + len(y), c] += y.astype(np.float32)
    return out[: len(x)]


def place(buf, sig, at, gain=1.0, pan=0.0):
    """Adds mono sig at time `at` (s) into stereo buf with constant-power pan (-1..1)."""
    i = int(at * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    l = np.cos((pan + 1) * np.pi / 4) * gain
    r = np.sin((pan + 1) * np.pi / 4) * gain
    buf[i:i + len(sig), 0] += sig * l
    buf[i:i + len(sig), 1] += sig * r


# ---------------- drums ----------------
def kick(length=0.45, punch=1.0):
    t = t_axis(length)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env_exp(len(t), 0.18)
    click = rng.standard_normal(len(t)) * env_exp(len(t), 0.004) * 0.3
    return np.tanh((body + click) * 1.6 * punch) * 0.9


def snare(length=0.3):
    t = t_axis(length)
    noise = bandpass(rng.standard_normal(len(t)), 1200, 9000) * env_exp(len(t), 0.07)
    tone = np.sin(2 * np.pi * 190 * t) * env_exp(len(t), 0.05)
    return (noise * 1.4 + tone * 0.6) * 0.7


def clap(length=0.35):
    t = t_axis(length)
    noise = bandpass(rng.standard_normal(len(t)), 900, 6000)
    e = np.zeros(len(t))
    for off in (0.0, 0.011, 0.022):
        i = int(off * SR)
        e[i:] += env_exp(len(t) - i, 0.008 if off < 0.02 else 0.09)
    return noise * e * 0.8


def hat(open_=False):
    length = 0.3 if open_ else 0.08
    t = t_axis(length)
    noise = highpass(rng.standard_normal(len(t)), 7000) * env_exp(len(t), 0.11 if open_ else 0.025)
    return noise * 0.5


def rhodes(freq, length):
    t = t_axis(length)
    e = env_exp(len(t), 0.9, attack=0.005)
    trem = 1 + 0.15 * np.sin(2 * np.pi * 4.5 * t)
    return (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(4 * np.pi * freq * t) * env_exp(len(t), 0.2)) * e * trem * 0.3


def pad(freqs, length, cutoff=1800, attack=0.6, release=0.8):
    t = t_axis(length)
    s = np.zeros(len(t))
    for f in freqs:
        for d in (-0.006, 0.0, 0.0071):
            s += saw(f, t, d)
    s = lowpass(s / (len(freqs) * 3), cutoff)
    return s * adsr(len(t), attack, 0.3, 0.8, release) * 0.5


def bass(freq, length, cutoff=600):
    t = t_axis(length)
    s = saw(freq, t) * 0.6 + np.sin(2 * np.pi * freq * t) * 0.6
    return lowpass(s, cutoff) * adsr(len(t), 0.005, 0.08, 0.7, 0.05) * 0.8


def pluck(freq, length, cutoff=3500):
    t = t_axis(length)
    s = square(freq, t, 0.3) * 0.5 + saw(freq, t, 0.004) * 0.5
    return lowpass(s, cutoff) * env_exp(len(t), 0.18) * 0.35


def write_wav(path, stereo, peak_db=-1.0):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    x = np.asarray(stereo, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    # Normalize first, then a gentle soft clip: keeps the dynamics instead of squashing them.
    x = x / (np.percentile(np.abs(x), 99.95) or 1.0)
    x = np.tanh(x * 0.9) / np.tanh(0.9)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * 10 ** (peak_db / 20)
    data = (x * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


beats = {}


# ---------------- music 1: 120 BPM electronic (montage) ----------------
def track_beat120():
    bpm, bars = 120, 64
    beat = 60 / bpm
    total = bars * 4 * beat + 2
    dry = np.zeros((int(total * SR), 2))
    wet_src = np.zeros(int(total * SR))
    prog = [(45, [57, 60, 64]), (41, [53, 57, 60]), (48, [55, 60, 64]), (43, [55, 59, 62])]  # Am F C G
    K, S, C, HC, HO = kick(), snare(), clap(), hat(), hat(True)
    for bar in range(bars):
        section = bar // 8  # 0 intro, 1 build, 2-3 drop, 4 break, 5-6 drop, 7 outro
        root, chord = prog[bar % 4]
        t0 = bar * 4 * beat
        p = pad([note(n) for n in chord], 4 * beat + 0.6, cutoff=900 if section in (0, 4) else 2200)
        place(dry, p, t0, 0.5)
        wet_src[int(t0 * SR):int(t0 * SR) + len(p)] += p[: len(wet_src) - int(t0 * SR)] * 0.6
        for b in range(4):
            tb = t0 + b * beat
            if section not in (0, 4, 7) or (section == 7 and bar % 8 < 4):
                place(dry, K, tb, 1.0)
            if section in (2, 3, 5, 6) and b in (1, 3):
                place(dry, S, tb, 0.8)
                place(dry, C, tb, 0.5, 0.2)
            for h in range(2):
                place(dry, HO if (h == 1 and section in (3, 6)) else HC, tb + h * beat / 2, 0.35, -0.3 + 0.6 * h)
            if section in (2, 3, 5, 6):
                for s16 in range(4):
                    if (b * 4 + s16) % 3 != 2:
                        place(dry, bass(note(root - 12 + (12 if s16 == 2 else 0)), beat / 4 * 0.9), tb + s16 * beat / 4, 0.7)
                arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 24]
                for s16 in range(4):
                    pl = pluck(note(arp[(b * 4 + s16) % 4]), beat / 4)
                    place(dry, pl, tb + s16 * beat / 4, 0.45, 0.4 * np.sin(bar + s16))
                    wet_src[int((tb + s16 * beat / 4) * SR):][: len(pl)] += pl[: len(wet_src) - int((tb + s16 * beat / 4) * SR)] * 0.4
        if bar % 8 == 7 and section in (1, 4):  # snare roll + riser into the drop
            for i in range(16):
                place(dry, S, t0 + 2 * beat + i * beat / 8, 0.25 + 0.04 * i)
    out = dry + convolve(wet_src, ir(2.2, 3500)) * 0.6
    beats["beat-120"] = {"bpm": bpm, "beat": beat, "bars": bars, "dropBars": [16, 40], "breakBars": [32], "length": total}
    return out


# ---------------- music 2: 128 BPM house (montage alt, overlay) ----------------
def track_house128():
    bpm, bars = 128, 64
    beat = 60 / bpm
    total = bars * 4 * beat + 2
    dry = np.zeros((int(total * SR), 2))
    wet = np.zeros(int(total * SR))
    prog = [(38, [62, 65, 69, 72]), (43, [62, 67, 70, 74]), (36, [60, 64, 67, 71]), (41, [60, 65, 69, 72])]
    K, C, HC, HO = kick(0.4, 1.2), clap(), hat(), hat(True)
    for bar in range(bars):
        section = bar // 16
        root, chord = prog[bar % 4]
        t0 = bar * 4 * beat
        for b in range(4):
            tb = t0 + b * beat
            if section != 2 or bar % 16 >= 12:
                place(dry, K, tb, 1.0)
            if b in (1, 3):
                place(dry, C, tb, 0.6)
            place(dry, HO, tb + beat / 2, 0.3, 0.3)
            place(dry, HC, tb + beat * 0.25, 0.15, -0.4)
            place(dry, HC, tb + beat * 0.75, 0.15, -0.4)
            # offbeat stab chords
            stab = pad([note(n) for n in chord], beat * 0.45, cutoff=3000 if section else 1500, attack=0.005, release=0.1)
            place(dry, stab, tb + beat / 2, 0.55)
            wet[int((tb + beat / 2) * SR):][: len(stab)] += stab[: len(wet) - int((tb + beat / 2) * SR)] * 0.5
            place(dry, bass(note(root - 12), beat * 0.4, 400), tb + beat / 2, 0.8)
    out = dry + convolve(wet, ir(1.4, 5000)) * 0.5
    beats["house-128"] = {"bpm": bpm, "beat": beat, "bars": bars, "length": total}
    return out


# ---------------- music 3: 85 BPM lo-fi (podcast) ----------------
def track_lofi85():
    bpm, bars = 85, 48
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    dry = np.zeros((int(total * SR), 2))
    wet = np.zeros(int(total * SR))
    prog = [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]]  # Dm7 G7 Cmaj7 Am7
    K, S, HC = kick(0.4, 0.7), snare(0.25), hat()
    for bar in range(bars):
        t0 = bar * 4 * beat
        chord = prog[bar % 4]
        for i, n in enumerate(chord):
            r = rhodes(note(n), 4 * beat)
            place(dry, r, t0 + i * 0.018, 0.55, -0.3 + 0.2 * i)
            wet[int(t0 * SR):][: len(r)] += r[: len(wet) - int(t0 * SR)] * 0.4
        for b in range(4):
            tb = t0 + b * beat
            swing = 0.04 * (b % 2)
            if b in (0, 2) or (b == 3 and bar % 2):
                place(dry, K, tb + (beat / 2 if b == 3 else 0), 0.8)
            if b in (1, 3):
                place(dry, S, tb + swing, 0.55)
            for h in range(2):
                place(dry, HC, tb + h * beat / 2 + swing * h, 0.25)
        place(dry, bass(note(chord[0] - 12), beat * 1.8, 300), t0, 0.7)
        place(dry, bass(note(chord[0] - 12), beat * 1.5, 300), t0 + 2.5 * beat, 0.6)
    crackle = np.zeros(len(wet))
    pops = rng.integers(0, len(wet), size=int(total * 9))
    crackle[pops] = rng.standard_normal(len(pops)) * 0.5
    crackle = highpass(crackle, 2000) + lowpass(rng.standard_normal(len(wet)), 3000) * 0.01
    out = lowpass(dry[:, 0], 6000)[:, None] * np.array([1, 0]) + lowpass(dry[:, 1], 6000)[:, None] * np.array([0, 1])
    out = out + convolve(wet, ir(1.8, 2500)) * 0.5 + np.stack([crackle, crackle], axis=1) * 0.25
    beats["lofi-85"] = {"bpm": bpm, "beat": beat, "bars": bars, "length": total}
    return out


# ---------------- music 4: cinematic underscore (documentary) ----------------
def track_cinematic():
    total = 150.0
    t = t_axis(total)
    n = len(t)
    out = np.zeros((n, 2))
    drone = (np.sin(2 * np.pi * note(33) * t) + 0.5 * np.sin(2 * np.pi * note(40) * t)) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 23))
    out += np.stack([drone, drone], axis=1) * 0.25
    chords = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 56]]
    wet = np.zeros(n)
    for i in range(int(total // 9)):
        p = pad([note(x) for x in chords[i % 4]], 10.5, cutoff=1200 + 300 * (i % 3), attack=3.0, release=3.0)
        start = i * 9.0
        place(out, p, start, 0.55)
        wet[int(start * SR):][: len(p)] += p[: n - int(start * SR)] * 0.7
    for when in np.arange(4.5, total - 2, 18.0):  # timpani-like hits
        tt = t_axis(2.5)
        timp = np.sin(2 * np.pi * (note(38) * (1 + 0.05 * np.exp(-tt / 0.05))) * tt) * env_exp(len(tt), 0.7)
        timp += lowpass(rng.standard_normal(len(tt)), 500) * env_exp(len(tt), 0.08) * 0.5
        place(out, timp, when, 0.9)
        wet[int(when * SR):][: len(timp)] += timp[: n - int(when * SR)] * 0.4
    out += convolve(wet, ir(3.5, 2200)) * 0.8
    beats["cinematic"] = {"length": total, "hits": [float(x) for x in np.arange(4.5, total - 2, 18.0)]}
    return out


# ---------------- music 5: 100 BPM kinetic pulse ----------------
def track_pulse100():
    bpm, bars = 100, 64
    beat = 60 / bpm
    total = bars * 4 * beat + 2
    dry = np.zeros((int(total * SR), 2))
    wet = np.zeros(int(total * SR))
    scale = [57, 60, 62, 64, 67, 69, 72]
    K, C, HC = kick(0.35, 0.9), clap(), hat()
    for bar in range(bars):
        t0 = bar * 4 * beat
        section = (bar // 8) % 4
        for s8 in range(8):
            tb = t0 + s8 * beat / 2
            n = scale[(bar * 3 + s8 * (2 if section % 2 else 1)) % len(scale)]
            pl = pluck(note(n), beat / 2 * 0.8, 2500 + 1500 * section)
            place(dry, pl, tb, 0.5, 0.5 * np.sin(s8))
            wet[int(tb * SR):][: len(pl)] += pl[: len(wet) - int(tb * SR)] * 0.5
            if s8 % 2 == 0 and section > 0:
                place(dry, K, tb, 0.9)
            if s8 in (2, 6) and section > 1:
                place(dry, C, tb, 0.6)
            place(dry, HC, tb + beat / 4, 0.2)
        place(dry, bass(note(scale[bar % 4] - 24), 4 * beat * 0.95, 350), t0, 0.6)
    out = dry + convolve(wet, ir(1.6, 4500)) * 0.6
    beats["pulse-100"] = {"bpm": bpm, "beat": beat, "bars": bars, "length": total}
    return out


# ---------------- sound effects ----------------
def sfx():
    s = {}
    def noise(sec):
        return rng.standard_normal(int(sec * SR))
    # whooshes: noise through a sweeping band (approximated by crossfading filtered layers)
    for name, sec, up in (("whoosh-short", 0.45, True), ("whoosh-long", 1.3, True), ("whoosh-down", 0.9, False)):
        n = int(sec * SR)
        tt = np.arange(n) / n
        lo, hi = lowpass(noise(sec), 600), bandpass(noise(sec), 2000, 9000)
        mix = tt if up else 1 - tt
        e = np.sin(np.pi * tt) ** 2
        s[name] = (lo * (1 - mix) + hi * mix * 0.7) * e * 0.9
    n = int(2.0 * SR)
    tt = np.arange(n) / SR
    s["riser"] = (bandpass(noise(2.0), 800, 8000) * (tt / 2) ** 2 + np.sin(2 * np.pi * (200 + 900 * (tt / 2) ** 2) * tt) * 0.3 * tt / 2) * 0.8
    tt = t_axis(1.8)
    s["impact"] = np.tanh((np.sin(2 * np.pi * (40 + 80 * np.exp(-tt / 0.08)) * tt) * env_exp(len(tt), 0.6) + lowpass(noise(1.8), 1200) * env_exp(len(tt), 0.15)) * 2) * 0.9
    s["sub-drop"] = np.sin(2 * np.pi * np.cumsum(30 + 90 * np.exp(-tt / 0.4)) / SR) * env_exp(len(tt), 0.9) * 0.9
    tt = t_axis(0.25)
    s["punch"] = np.tanh((np.sin(2 * np.pi * 90 * tt) * env_exp(len(tt), 0.06) + bandpass(noise(0.25), 300, 4000) * env_exp(len(tt), 0.02)) * 2.5) * 0.8
    tt = t_axis(0.12)
    s["click"] = highpass(noise(0.12), 2000) * env_exp(len(tt), 0.003)
    tt = t_axis(0.12)
    s["pop"] = np.sin(2 * np.pi * (400 + 900 * np.exp(-tt / 0.01)) * tt) * env_exp(len(tt), 0.03) * 0.8
    tt = t_axis(0.18)
    s["ui-beep"] = np.sin(2 * np.pi * 1320 * tt) * adsr(len(tt), 0.005, 0.05, 0.6, 0.08) * 0.5
    tt = t_axis(0.6)
    s["ping"] = (np.sin(2 * np.pi * 1760 * tt) * env_exp(len(tt), 0.25) + np.where(tt > 0.09, np.sin(2 * np.pi * 2637 * tt) * env_exp(len(tt), 0.2) * (tt > 0.09), 0)) * 0.4
    tt = t_axis(0.35)
    s["error-buzz"] = square(110, tt) * adsr(len(tt), 0.005, 0.05, 0.8, 0.05) * 0.25
    tt = t_axis(0.5)
    s["countdown-beep"] = np.sin(2 * np.pi * 1000 * tt) * adsr(len(tt), 0.005, 0.02, 0.9, 0.05) * 0.45
    tt = t_axis(1.0)
    s["long-beep"] = np.sin(2 * np.pi * 1500 * tt) * adsr(len(tt), 0.005, 0.02, 0.9, 0.05) * 0.4
    for i in range(5):  # typewriter keys
        tt = t_axis(0.16)
        k = bandpass(noise(0.16), 1500 + 400 * i, 7000) * env_exp(len(tt), 0.008) + np.sin(2 * np.pi * (180 + 30 * i) * tt) * env_exp(len(tt), 0.015) * 0.4
        s[f"type-key-{i + 1}"] = k * 0.8
    tt = t_axis(0.5)
    s["carriage-return"] = np.concatenate([bandpass(noise(0.35), 300, 3000) * np.linspace(0.2, 0.6, int(0.35 * SR)), np.sin(2 * np.pi * 2200 * tt[: int(0.15 * SR)]) * env_exp(int(0.15 * SR), 0.05)]) * 0.6
    tt = t_axis(0.6)
    gl = noise(0.6)
    gl = np.round(gl * 3) / 3 * (np.sin(2 * np.pi * 37 * tt) > 0) * (rng.random(len(tt)) > 0.3)
    s["glitch"] = bandpass(gl, 400, 9000) * 0.5
    tt = t_axis(0.25)
    s["shutter"] = (bandpass(noise(0.25), 1000, 8000) * (env_exp(len(tt), 0.01) + np.roll(env_exp(len(tt), 0.015), int(0.09 * SR)) * 0.8)) * 0.8
    tt = t_axis(1.0)
    hb = np.sin(2 * np.pi * 55 * tt) * (env_exp(len(tt), 0.07) + np.roll(env_exp(len(tt), 0.07), int(0.28 * SR)) * 0.7)
    s["heartbeat"] = lowpass(hb, 200) * 1.2
    tt = t_axis(1.2)
    s["tape-stop"] = saw(1, tt) * 0  # placeholder replaced below
    base = pluck(note(64), 1.2, 3000)
    rate = np.linspace(1, 0.05, len(base))
    idx = np.clip(np.cumsum(rate).astype(int), 0, len(base) - 1)
    s["tape-stop"] = base[idx] * np.linspace(1, 0, len(base)) * 2
    tt = t_axis(0.35)
    s["swoosh-tick"] = bandpass(noise(0.35), 3000, 12000) * np.sin(np.pi * np.arange(len(tt)) / len(tt)) ** 3 * 0.6
    tt = t_axis(1.6)
    s["sparkle"] = sum(np.sin(2 * np.pi * f * tt) * np.roll(env_exp(len(tt), 0.12), int(d * SR)) for f, d in ((2093, 0), (2637, 0.08), (3136, 0.16), (4186, 0.24))) * 0.25
    s["room-tone"] = lowpass(noise(30.0), 900) * 0.02 + lowpass(noise(30.0), 120) * 0.03
    tt = t_axis(5.0)
    jingle = np.zeros((len(tt), 2))
    for i, n in enumerate([60, 64, 67, 72, 76]):
        place(jingle, pluck(note(n), 1.2, 4000), i * 0.18, 0.7, -0.6 + 0.3 * i)
    place(jingle, pad([note(48), note(55), note(64), note(72)], 3.5, 2500, 0.05, 1.5), 0.9, 0.7)
    place(jingle, kick(), 0.9, 0.8)
    s["jingle"] = jingle
    tt = t_axis(3.0)
    s["drum-fill"] = np.zeros(len(tt))
    fill = np.zeros((len(tt), 2))
    for i in range(12):
        place(fill, snare(0.2), i * 0.125, 0.3 + 0.05 * i, np.sin(i))
    place(fill, kick(), 1.5, 1.0)
    place(fill, clap(), 1.5, 0.8)
    s["drum-fill"] = fill
    return s


def main():
    os.makedirs(os.path.join(OUT, "music"), exist_ok=True)
    for name, fn in (("beat-120", track_beat120), ("house-128", track_house128), ("lofi-85", track_lofi85),
                     ("cinematic", track_cinematic), ("pulse-100", track_pulse100)):
        path = os.path.join(OUT, "music", f"{name}.wav")
        if not os.path.exists(path):
            write_wav(path, fn(), -1.0)
            print("music", name)
    for name, sig in sfx().items():
        write_wav(os.path.join(OUT, "sfx", f"{name}.wav"), sig, -1.0 if name != "room-tone" else -30.0)
    print("sfx done")
    old = json.load(open(os.path.join(OUT, "music", "beats.json"))) if os.path.exists(os.path.join(OUT, "music", "beats.json")) else {}
    old.update(beats)
    json.dump(old, open(os.path.join(OUT, "music", "beats.json"), "w"), indent=1)


main()

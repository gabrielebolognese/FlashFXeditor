"""05 Podcast audio lab: two voices recorded on separate tracks, raw take with gaps, tightened edit, speed remix,
room tone, ducked music, stingers, sound effects in many formats, and an audiogram with word-timed captions."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import scripts  # noqa: E402
from tplkit import (AAC, AAC_VOICE, MP3, MP3_VOICE, OGG, OPUS_OGG, WAV48, EASES, Proj, anim, conv, cues_from_tts, grad, hexc, kf,  # noqa: E402
                    pick_font, rgba, text_style, tts_words)

from tplkit import WORK as ROOT  # noqa: E402
G, DL, TTS = os.path.join(ROOT, "gen"), os.path.join(ROOT, "dl"), os.path.join(ROOT, "tts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out")

p = Proj("05-podcast-audio-lab", "05 Podcast Audio Lab (4:5, 25 fps)", 1080, 1350, fps=(25, 1), background=(0.07, 0.07, 0.1))
W, H = p.w, p.h
f = p.f
FONT = pick_font("Poppins", "Montserrat")
MONO = pick_font("JetBrains Mono", "Space Mono", "IBM Plex Mono")

V1 = p.vtrack("Background", height="S")
V2 = p.vtrack("Avatars")
V3 = p.vtrack("Speaking rings", height="S")
V4 = p.vtrack("Visualizer bars", height="S")
V5 = p.vtrack("Visualizer bars 2", height="S")
V6 = p.vtrack("Titles")
V7 = p.vtrack("Segment cards")
V8 = p.vtrack("Progress bar", height="S")
V9 = p.vtrack("Logo bug", height="S")
CC = p.ctrack({"text": text_style(FONT, 58, 800, stroke=(6, rgba(0, 0, 0, 0.9)), case="upper", line_height=1.1),
               "position": "custom", "x": 0, "y": 360, "maxWidth": 940, "maxLines": 2,
               "highlight": {"mode": "background", "color": hexc("#7c4dff"), "inactiveColor": rgba(1, 1, 1, 1)}})
A_HOST = p.atrack("Dave (host mic)", height="L")
A_GUEST = p.atrack("Zoe (guest mic)", height="L")
A_ROOM = p.atrack("Room tone", height="S")
A_MUSIC = p.atrack("Music")
A_STING = p.atrack("Stingers and jingles")
A_SFX = p.atrack("Sound effects")
A_SFX2 = p.atrack("Sound effects 2")
A_ARCH = p.atrack("Archive (muted track)", muted=True)

# ---------------- media: the two "recordings" in different formats, music and sounds
host_fmt = [("wav", WAV48), ("m4a", AAC_VOICE)]
guest_fmt = [("mp3", MP3_VOICE), ("ogg", OPUS_OGG)]
turns = []
for i, (who, text) in enumerate(scripts.PODCAST):
    ident = f"p{i + 1:02d}-{who}"
    ext, args = (host_fmt if who == "host" else guest_fmt)[i % 2]
    mid = p.add_media(conv(os.path.join(TTS, "podcast", f"{ident}.wav"), f"pod-{ident}.{ext}", args), "audio", bin="Recordings")
    turns.append((who, text, mid, tts_words(os.path.join(TTS, "podcast", f"{ident}.json"))))
lofi = p.add_media(conv(os.path.join(G, "audio", "music", "lofi-85.wav"), "pod-lofi-85.mp3", MP3), "audio", bin="Music")
jingle = p.add_media(conv(os.path.join(G, "audio", "sfx", "jingle.wav"), "pod-jingle.ogg", OGG), "audio", bin="Stingers")
room = p.add_media(os.path.join(G, "audio", "sfx", "room-tone.wav"), "audio", bin="Room tone")
lfm = [p.add_media(conv(os.path.join(DL, "audio", f"lfm-{k}.ogg"), f"pod-lfm-{k}.m4a", AAC, seconds=150), "audio", bin="Music (CC0)") for k in (1, 2, 3)
       if os.path.exists(os.path.join(DL, "audio", f"lfm-{k}.ogg"))]
fx = {n: p.add_media(os.path.join(G, "audio", "sfx", f"{n}.wav"), "audio", bin="Sound effects") for n in
      ("whoosh-short", "whoosh-long", "riser", "impact", "ping", "pop", "ui-beep", "drum-fill", "tape-stop", "sparkle", "click", "glitch", "error-buzz")}
real = {n: p.add_media(conv(os.path.join(DL, "audio", src), f"pod-{n}.{ext}", args), "audio", bin="Real sounds") for n, src, ext, args in
        [("applause", "applause.wav", "mp3", MP3), ("crowd", "crowd-1.ogg", "ogg", OGG), ("door", "door-1.wav", "wav", WAV48), ("bell", "bell-1.opus", "ogg", OPUS_OGG),
         ("birds", "birds-forest.ogg", "m4a", AAC), ("rain", "rain.ogg", "ogg", OGG)] if os.path.exists(os.path.join(DL, "audio", src))}
bg = p.add_media(os.path.join(G, "mg", "mg-gradient-vertical.mp4"), "video", bin="Visuals")
av_host = p.add_media(os.path.join(G, "overlays", "avatar-host.png"), "image", bin="Visuals")
av_guest = p.add_media(os.path.join(G, "overlays", "avatar-guest.png"), "image", bin="Visuals")
logo = p.add_media(os.path.join(G, "overlays", "logo-badge.svg"), "image", bin="Visuals")

HOST_X, GUEST_X, AV_Y = -250, 250, -230
BARS = 12


def speaking(who, start, dur, words):
    """Ring pulse under the speaker's avatar and visualizer bars keyed to the word timings."""
    x = HOST_X if who == "host" else GUEST_X
    col = hexc("#ff5e62") if who == "host" else hexc("#4e79a7")
    if p.free(V3, start, dur):
        p.solid(V3, start, dur, col, w=420, h=420, shape="ellipse", x=x, y=AV_Y, opacity=0.55, fades=(4, 4), name=f"{who} speaking",
                kf=kf(("transform.scale", [(k * 10, 1.0 if k % 2 == 0 else 1.06, "smooth") for k in range(dur // 10 + 1)])))
    track = V4 if who == "host" else V5
    if p.free(track, start, dur):
        keys = {"transform.scaleY": []}
        for w in words:
            fr = int(round(w["t"] / 1000 * 25))
            if 0 <= fr < dur:
                keys["transform.scaleY"].append((fr, 1.0 + min(2.5, 0.35 * w["len"]), "snap"))
                keys["transform.scaleY"].append((fr + 4, 0.4, "easeOut"))
        seq = sorted({k[0]: k for k in keys["transform.scaleY"]}.values())
        p.solid(track, start, dur, grad(col, hexc("#ffffff")), w=34, h=90, shape="roundedRect", radius=17, x=x, y=AV_Y + 300, scale=1.0, scale_y=0.4,
                name=f"{who} level", kf=kf(("transform.scaleY", [(0, 0.4, "linear")] + seq + [(dur, 0.4)])) if seq else None)


def say(turn, start, *, gap_cut=False, speed=1.0, gain=0.0, captions=True, src_in=0.0, dur=None):
    who, text, mid, words = turn
    track = A_HOST if who == "host" else A_GUEST
    length = p.mdur(mid)
    d = dur or int((length - src_in) * 25 / speed)
    cid = p.audio(track, start, d, mid, src_in=src_in, speed=speed, gain=gain, fades=(2, 3), color="pink" if who == "host" else "blue",
                  name=f"{'Dave' if who == 'host' else 'Zoe'}: {text[:40]}")
    speaking(who, start, d, [{"t": (w["t"] - src_in * 1000) / speed, "len": w["len"]} for w in words if w["t"] >= src_in * 1000])
    if captions:
        for cs, ce, ctext, cw in cues_from_tts(words, text, max_words=4, max_ms=1800):
            if cs < src_in * 1000:
                continue
            s = start + int(round((cs / 1000 - src_in) / speed * 25))
            e = start + int(round((ce / 1000 - src_in) / speed * 25))
            if e > start + d:
                e = start + d
            if e - s < 3:
                continue
            last = p.track_clips[CC][-1] if p.track_clips[CC] else None
            if last and p.clips[last]["start"] + p.clips[last]["duration"] > s:
                lc = p.clips[last]
                lc["duration"] = max(1, s - lc["start"])
            rel = [{"text": w, "start": int(round((ws / 1000 - src_in) / speed * 25)) - (s - start),
                    "end": max(int(round((ws / 1000 - src_in) / speed * 25)) - (s - start) + 1, int(round((we / 1000 - src_in) / speed * 25)) - (s - start))}
                   for w, ws, we in cw]
            p.caption(s, e - s, ctext, words=rel)
    return cid, start + d


def card(start, dur, title, sub):
    p.solid(V7, start, dur, rgba(0.05, 0.05, 0.08, 0.92), w=900, h=300, shape="roundedRect", radius=40, y=420, fades=(6, 6), name=f"Card {title}",
            kf=kf(("transform.scale", [(0, 0.6, "overshoot"), (12, 1.0)])))
    p.text(V6, start + 4, dur - 4, title, text_style(FONT, 72, 800, fill=grad(hexc("#ffd166"), hexc("#ef476f"))), y=390, anim_in=anim("scaleBounce", 14),
           anim_out=anim("fade", 8), name=f"Card title {title}")
    if p.free(V8, start + 8, dur - 8):
        p.text(V8, start + 8, dur - 8, sub, text_style(MONO, 34, 500, fill=rgba(1, 1, 1, 0.75)), y=480, anim_in=anim("typewriter", 20, per="char"), name=f"Card sub {sub}")


# ---------------- part 1: intro
t = 0
p.marker(t, "Intro", "violet")
p.audio(A_STING, t, p.ff(p.mdur(jingle)), jingle, gain=-2, name="Show jingle")
p.audio(A_SFX, t + f(0.1), p.ff(p.mdur(fx["riser"])), fx["riser"], gain=-10)
p.text(V6, f(0.4), f(4.2), "FRAME BY FRAME", text_style(pick_font("Bebas Neue"), 150, 400, fill=grad(hexc("#ffffff"), hexc("#b388ff")), spacing=6),
       y=-560, anim_in=anim("wordPop", 18, per="char", stagger=2, ease="overshoot"), anim_out=anim("slideUp", 10))
t = f(5)

# ---------------- part 2: raw take (unedited: long gaps between turns, breaths of room tone)
p.marker(t, "Part 1: raw take (gaps left in)", "red")
card(t, f(3.5), "RAW TAKE", "gaps, breaths and all")
t += f(3.5)
raw_start = t
for i, turn in enumerate(turns[:18]):
    _, t = say(turn, t, captions=True)
    t += f([1.4, 0.9, 2.1, 1.1, 1.7][i % 5])  # the pauses the edit will remove
raw_end = t
p.audio_fill(A_ROOM, raw_start, raw_end - raw_start, room, gain=0, name="Room tone")
p.marker(t, "Part 2: tightened edit", "green")
card(t, f(3.5), "THE EDIT", "gaps tightened to 6 frames")
p.audio(A_SFX, t, p.ff(p.mdur(fx["tape-stop"])), fx["tape-stop"], gain=-6)
t += f(3.5)

# ---------------- part 3: tightened edit with ducked music, stingers and sound design
edit_start = t
mus_ids = []
for i, turn in enumerate(turns):
    if i == 18:  # the ad break
        p.marker(t, "Ad break", "orange")
        p.audio(A_STING, t, p.ff(p.mdur(jingle)), jingle, gain=-3, name="Break jingle")
        card(t, f(5), "QUICK BREAK", "sponsored by nobody")
        for k, n in enumerate(("pop", "ping", "sparkle")):
            p.audio_any([A_SFX, A_SFX2], t + f(1 + k * 1.1), p.ff(p.mdur(fx[n])), fx[n], gain=-8)
        t += f(5.5)
    cid, t = say(turn, t)
    t += 6
    if i in (5, 11, 23):
        p.audio_any([A_SFX, A_SFX2], t - 4, p.ff(p.mdur(fx["whoosh-short"])), fx["whoosh-short"], gain=-12, name="Whoosh between topics")
edit_end = t
# music bed under the edit: lo-fi looped with crossfades, ducked by gain keys while anyone speaks
spans = sorted((p.clips[c]["start"], p.clips[c]["start"] + p.clips[c]["duration"]) for tr in (A_HOST, A_GUEST) for c in p.track_clips[tr]
               if edit_start <= p.clips[c]["start"] < edit_end)
pos = edit_start
mlen = p.ff(p.mdur(lofi))
while pos < edit_end:
    d = min(mlen, edit_end - pos)
    keys = [(0, -10, "smooth")]
    for s, e in spans:
        if pos <= s < pos + d:
            keys += [(max(1, s - pos - 8), -10, "smooth"), (s - pos, -24, "smooth"), (min(d - 1, e - pos), -24, "smooth"), (min(d, e - pos + 10), -10, "smooth")]
    keys = sorted({k[0]: k for k in keys if 0 <= k[0] <= d}.values())
    cid = p.audio(A_MUSIC, pos, d, lofi, fades=(f(1) if pos == edit_start else 0, f(2) if pos + d >= edit_end else 0), kf=kf(("volume.gainDb", keys)), name="Lo-fi bed (ducked)")
    if mus_ids:
        p.transition(mus_ids[-1], cid, "crossDissolve", 25, 25)
    mus_ids.append(cid)
    pos += d
p.audio_fill(A_ROOM, edit_start, edit_end - edit_start, room, gain=-6, name="Room tone (quieter)")

# ---------------- part 4: speed remix and level torture
p.marker(t, "Part 3: speed and level lab", "teal")
card(t, f(3.5), "SPEED LAB", "0.5x to 2x, -60 to +12 dB")
t += f(3.5)
for k, sp in enumerate((0.5, 0.75, 1.25, 1.5, 2.0)):
    _, t = say(turns[k], t, speed=sp, captions=True)
    if p.free(V8, t - f(1), f(1)):
        p.text(V8, max(0, t - f(1.5)), f(1.5), f"{sp}x", text_style(MONO, 120, 700, fill=hexc("#ffd166")), y=-560, anim_in=anim("pop", 6))
    t += 8
for k, gdb in enumerate((-60, -30, -12, 0, 6, 12)):
    _, t = say(turns[6 + k], t, gain=gdb, captions=False)
    p.text(V8, t - f(2), f(2), f"{gdb:+d} dB", text_style(MONO, 120, 700, fill=hexc("#06d6a0")), y=-560, anim_in=anim("pop", 6)) if p.free(V8, t - f(2), f(2)) else None
    t += 6
# a sentence cut into words at the word timings (razor test): every word becomes its own clip
who, text, mid, words = turns[1]
p.marker(t, "Word-level razor cuts", "blue")
for k, w in enumerate(words):
    s0 = w["t"] / 1000
    e0 = (words[k + 1]["t"] / 1000) if k + 1 < len(words) else min(p.mdur(mid), s0 + 0.5)
    d = max(2, int((e0 - s0) * 25))
    p.audio(A_GUEST, t, d, mid, src_in=s0, fades=(1, 1), color=["red", "orange", "green", "teal", "blue", "violet", "pink", "grey"][k % 8], name=f"Word: {w['w']}")
    t += d + (4 if k % 3 == 2 else 0)
t += f(1)
# gain automation with every ease on one long clip
who, text, mid, words = turns[3]
d = p.ff(p.mdur(mid))
p.audio(A_GUEST, t, d, mid, kf=kf(("volume.gainDb", [(k * (d // 9), -30 if k % 2 else 0, EASES[k % 8]) for k in range(9)])), name="Gain keys, every ease")
p.marker(t, "Gain automation, every ease", "pink")
t += d + f(1)
# overlapping sound effects stack (all lanes at once)
p.marker(t, "Sound stack", "grey")
stack = list(fx.values()) + list(real.values())
for k, mid in enumerate(stack):
    d = min(f(4), p.ff(p.mdur(mid)))
    p.audio_any([A_SFX, A_SFX2, A_STING, A_ROOM], t + k * f(0.5), d, mid, gain=-10, fades=(2, 6))
t += len(stack) * f(0.5) + f(4)
# archive track (muted) holds the full raw dialogue once more
for i, turn in enumerate(turns[:8]):
    who, text, mid, words = turn
    st = sum(p.ff(p.mdur(tt[2])) + f(0.3) for tt in turns[:i])
    p.audio(A_ARCH, st, p.ff(p.mdur(mid)), mid, name=f"Archive: {text[:30]}")

# ---------------- outro
p.marker(t, "Outro", "violet")
p.audio(A_STING, t, p.ff(p.mdur(jingle)), jingle, gain=-2, name="Outro jingle")
if real.get("applause"):
    p.audio_any([A_SFX, A_SFX2], t, min(f(5), p.ff(p.mdur(real["applause"]))), real["applause"], gain=-8, fades=(4, 20))
if lfm:
    p.audio(A_MUSIC, t, min(f(20), p.ff(p.mdur(lfm[0]))), lfm[0], fades=(f(1), f(4)), gain=-8, name="CC0 outro music")
p.text(V6, t + f(0.5), f(6), "THANKS FOR LISTENING", text_style(pick_font("Bebas Neue"), 120, 400, fill=grad(hexc("#ffd166"), hexc("#ef476f"))),
       y=-560, anim_in=anim("slideDown", 12, ease="overshoot"), anim_out=anim("fade", 12))
t += f(20)
total = t

# ---------------- persistent visuals
p.video(V1, 0, total, bg, fit="cover", opacity=0.9, name="Background gradient") if p.ff(p.mdur(bg)) >= total else None
pos = 0
bid = []
while pos < total:
    d = min(p.ff(p.mdur(bg)), total - pos)
    cid = p.video(V1, pos, d, bg, fit="cover", muted=True, name="Background loop") if p.free(V1, pos, d) else None
    if cid and bid:
        p.transition(bid[-1], cid, "crossDissolve", 12, 12)
    if cid:
        bid.append(cid)
    pos += d
p.image(V2, f(1), total - f(1), av_host, fit=None, scale=0.34, x=HOST_X, y=AV_Y, kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (14, 0.34)])), name="Dave avatar")
p.image(V9, f(1.3), total - f(1.3), av_guest, fit=None, scale=0.34, x=GUEST_X, y=AV_Y, kf=kf(("transform.scale", [(0, 0.01, "overshoot"), (14, 0.34)])), name="Zoe avatar")
p.text(V8, f(1), f(4), "Dave", text_style(FONT, 44, 700), x=HOST_X, y=AV_Y + 210) if p.free(V8, f(1), f(4)) else None
prog = total - f(1)
p.solid(V9, f(1), 1, hexc("#ffffff"), w=10, h=10, name="Marker dot")  # 1-frame clip
p.image(V7, f(0.5), f(4), logo, fit=None, scale=0.18, x=W / 2 - 90, y=-H / 2 + 90, name="Logo bug intro") if p.free(V7, f(0.5), f(4)) else None
p.solid(V4, 0, f(1), rgba(1, 1, 1, 0.0), w=10, h=10, name="Spacer") if p.free(V4, 0, f(1)) else None
bar_t = next(tr for tr in (V8, V9, V7) if p.free(tr, f(5), prog - f(5)))if any(p.free(tr, f(5), prog - f(5)) for tr in (V8, V9, V7)) else None
if bar_t:
    p.solid(bar_t, f(5), prog - f(5), grad(hexc("#7c4dff"), hexc("#ff4081")), w=W, h=10, y=H / 2 - 5, anchor=(0, 0.5), x=-W / 2, scale=1.0, scale_y=1.0,
            kf=kf(("transform.scale", [(0, 0.001, "linear"), (prog - f(5), 1.0)])), name="Episode progress")
p.extra_files["OPEN.txt"] = ("Podcast audio lab. Dave and Zoe are text to speech voices recorded on separate tracks (WAV, M4A, MP3, Opus). "
                             "Part 1 is the raw take with gaps, part 2 the tightened edit with ducked music, part 3 the speed and level lab.\n")
ok = p.save(OUT)
print("length", total, "frames =", round(total / 25 / 60, 2), "min")
sys.exit(0 if ok else 1)

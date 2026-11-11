"""07-feature-tour: one 1080x1920 30 fps project, about 30 seconds per v1.2 feature (Batches 58-81).

Usage: python -I t7_tour.py [out root]   (default: templates/_build/work/out; the folder is then copied to templates/07-feature-tour)

Media come from the other templates (footage, photos, stickers, music, sounds) and the interop fixtures (Lottie,
SVG icons); the alpha WebM, the PNG sequence, the green screen clip, the LUT and the test tones are made here; the
narration is spoken by the Windows SAPI voices (tts.ps1) and its word timings become the captions.
"""
import json
import math
import os
import shutil
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tplkit  # noqa: E402
from tplkit import Proj, rgba, hexc, text_style, anim, IDLE, REPO, CLI, WORK, conv, AAC_VOICE, cues_from_tts  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.abspath(os.path.join(HERE, ".."))
FIX = os.path.join(REPO, "fixtures", "interop")
GEN = os.path.join(WORK, "tour")
os.makedirs(GEN, exist_ok=True)

SLUG = "07-feature-tour"
SEC = 900  # 30 s per feature
VIS_KINDS = ("video", "image", "text", "solid", "shape", "null", "compound", "adjustment", "lottie")

INK, PAPER, CORAL, TEAL, YELLOW = hexc("16161F"), hexc("F5EEDC"), hexc("FF5C4D"), hexc("19C3B1"), hexc("FFD23F")
BLUE, VIOLET, PINK, GREEN, WHITE = hexc("3D7BFF"), hexc("8B5CF6"), hexc("FF4FA3"), hexc("2BD46E"), rgba(1, 1, 1)
GREY, NAVY, DIM = hexc("9A98A6"), hexc("0E1020"), rgba(0, 0, 0, 0.55)


def L(c):
    """RGBA dict -> [r, g, b, a] (keyframe and effect colors)."""
    return [c["r"], c["g"], c["b"], c["a"]]


def rv(v):
    return [round(float(x), 4) for x in v] if isinstance(v, (list, tuple)) else round(float(v), 4)


def key(f, v, e="linear", **extra):
    k = {"frame": int(round(f)), "value": rv(v), "ease": e}
    for name, val in extra.items():
        k[name] = rv(val) if name in ("spatialIn", "spatialOut", "bezier") else val
    return k


def T(x=0, y=0, s=1.0, r=0, sy=None, ax=0.5, ay=0.5, rx=None, ry=None, z=None):
    t = Proj.transform(x, y, s, r, sy, (ax, ay))
    for name, val in (("rotationX", rx), ("rotationY", ry), ("z", z)):
        if val is not None:
            t[name] = round(val, 3)
    return t


def lin(angle, *stops):
    return {"type": "linear", "angle": angle, "center": {"x": 0.5, "y": 0.5}, "radius": 1,
            "stops": [{"at": a, "color": c} for a, c in stops]}


def rad(*stops, cx=0.5, cy=0.5, radius=1):
    return {"type": "radial", "angle": 0, "center": {"x": cx, "y": cy}, "radius": radius,
            "stops": [{"at": a, "color": c} for a, c in stops]}


def fx(fid, ftype, **params):
    return {"id": fid, "type": ftype, "enabled": True, "params": params}


def mask(mid, kind, x=0, y=0, w=0, h=0, mode="add", feather=0, expansion=0, opacity=1, inverted=False, radius=None, d=None):
    shape = {"kind": "path", "d": d} if kind == "path" else {"kind": kind, "x": x, "y": y, "w": w, "h": h}
    if radius is not None and kind == "rect":
        shape["radius"] = radius
    return {"id": mid, "shape": shape, "mode": mode, "feather": feather, "expansion": expansion, "opacity": opacity, "inverted": inverted}


def stk(width, color, cap="round", join="round", dash=None, align="center", offset=0):
    s = {"width": width, "color": color, "align": align, "cap": cap, "join": join, "miterLimit": 4}
    if dash:
        s["dash"], s["dashOffset"] = dash, offset
    return s


def pth(pid, d="", fill=None, stroke=None, trim=None, primitive=None, rule="nonzero"):
    p = {"id": pid, "d": d, "fill": fill, "fillRule": rule}
    if stroke:
        p["stroke"] = stroke
    if trim:
        p["trim"] = trim
    if primitive:
        p["primitive"] = primitive
    return p


class Tour(Proj):
    """tplkit's Proj with the v1.2 clip kinds, sequences (compound clips) and schema 24."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.sequences = {}
        self.seq_of = {}
        self.extra_dirs = {}
        self.settings_extra = {}
        self.loops = {}

    # ---------- sequences
    def sequence(self, sid, name, w, h, dur, bg=None, perspective="unset", depth_sort=False, params=None):
        s = {"id": sid, "name": name, "size": {"w": w, "h": h}, "duration": int(dur), "background": bg, "tracks": []}
        if perspective != "unset":
            s["perspective"] = perspective
        if depth_sort:
            s["depthSort"] = True
        if params:
            s["params"] = params
        self.sequences[sid] = s
        return sid

    def strack(self, sid, kind="video", name=None):
        tid = self.nid("s")
        t = {"id": tid, "kind": kind, "name": name or f"{'V' if kind == 'video' else 'A'}{len(self.sequences[sid]['tracks']) + 1}",
             "clipIds": [], "locked": False, "muted": False, "solo": False, "hidden": False, "targeted": True, "height": "M"}
        self.sequences[sid]["tracks"].append(t)
        self.track_clips[tid] = []
        self.seq_of[tid] = sid
        return tid

    def track_kind(self, tid):
        sid = self.seq_of.get(tid)
        if sid:
            return next(t["kind"] for t in self.sequences[sid]["tracks"] if t["id"] == tid)
        return super().track_kind(tid)

    def _add(self, clip):
        tid = clip["trackId"]
        kind = self.track_kind(tid)
        ok = {"video": VIS_KINDS, "audio": ("audio",), "caption": ("caption",)}[kind]
        assert clip["kind"] in ok, f"{clip['kind']} clip on a {kind} track"
        s, e = clip["start"], clip["start"] + clip["duration"]
        assert isinstance(s, int) and s >= 0 and isinstance(clip["duration"], int) and clip["duration"] >= 1, clip
        sid = self.seq_of.get(tid)
        if sid:
            assert e <= self.sequences[sid]["duration"], f"{clip['name']} ends at {e}, past sequence {sid} ({self.sequences[sid]['duration']})"
        for other in self.track_clips[tid]:
            o = self.clips[other]
            if s < o["start"] + o["duration"] and o["start"] < e:
                raise ValueError(f"overlap on {tid}: {clip['name']} [{s},{e}) vs {o['name']} [{o['start']},{o['start'] + o['duration']})")
        self.clips[clip["id"]] = clip
        self.track_clips[tid].append(clip["id"])
        return clip["id"]

    def document(self):
        doc = super().document()
        doc["schemaVersion"] = 24
        doc["meta"]["appVersion"] = "1.2.0"
        doc["meta"]["generator"]["version"] = "1.2.0"
        doc["settings"].update(self.settings_extra)
        for s in self.sequences.values():
            for t in s["tracks"]:
                t["clipIds"] = sorted(self.track_clips[t["id"]], key=lambda c: self.clips[c]["start"])
        doc["sequences"] = self.sequences
        return doc

    def save(self, out_root, notes=None):
        folder = os.path.join(out_root, self.slug)
        os.makedirs(folder, exist_ok=True)
        for name in ("project.json",):
            if os.path.exists(os.path.join(folder, name)):
                os.remove(os.path.join(folder, name))
        for name in ("media", "fonts", "luts", "animations"):
            if os.path.isdir(os.path.join(folder, name)):
                shutil.rmtree(os.path.join(folder, name))
        for mid, src in self.media_src.items():
            dst = os.path.join(folder, self.media[mid]["file"]["relPath"])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
        for rel, src in self.extra_dirs.items():
            dst = os.path.join(folder, rel)
            if os.path.isdir(src):
                shutil.copytree(src, dst, dirs_exist_ok=True)
            else:
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copyfile(src, dst)
        for rel, content in self.extra_files.items():
            open(os.path.join(folder, rel), "w", encoding="utf-8", newline="\n").write(content)
        doc = self.document()
        parked = []

        def park(node, path):
            if isinstance(node, dict):
                for k, v in list(node.items()):
                    if k == "fill" and isinstance(v, dict) and ("from" in v or "stops" in v):
                        # normalize merges a gradient field by field into the default RGBA fill (still true at v1.2.0):
                        # park its first color for the run and put the gradient back afterwards.
                        parked.append((path + [k], v))
                        node[k] = dict(v["from"] if "from" in v else v["stops"][0]["color"])
                    elif k == "transform" and node.get("kind") == "compound":
                        # normalize replaces a compound clip's transform with the identity (its list of kinds with a
                        # transform leaves compound out, src/core/document/normalize.ts): put it back afterwards.
                        parked.append((path + [k], json.loads(json.dumps(v))))
                    else:
                        park(v, path + [k])
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    park(v, path + [i])
        park(doc, [])
        pj = os.path.join(folder, "project.json")
        json.dump(doc, open(pj, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        norm = subprocess.run(["node", CLI, "normalize", folder, "--write"], capture_output=True, text=True, cwd=REPO, creationflags=IDLE)
        restored = 0
        if norm.returncode == 0 and parked:
            out = json.load(open(pj, encoding="utf-8"))
            for path, value in parked:
                node = out
                for k in path[:-1]:
                    node = node[k]
                if node.get(path[-1]) != value:
                    node[path[-1]] = value
                    restored += 1
            if restored:
                json.dump(out, open(pj, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        val = subprocess.run(["node", CLI, "validate", folder], capture_output=True, text=True, cwd=REPO, creationflags=IDLE)
        info = subprocess.run(["node", CLI, "info", folder], capture_output=True, text=True, cwd=REPO, creationflags=IDLE)
        ok = norm.returncode == 0 and val.returncode == 0
        report = {"normalize": norm.returncode, "validate": val.returncode, "gradientsRestored": restored,
                  "normalizeErr": norm.stderr[:12000], "validateOut": val.stdout[:12000], "info": info.stdout[:3000]}
        json.dump(report, open(os.path.join(out_root, f"{self.slug}.report.json"), "w", encoding="utf-8"), indent=1)
        print(f"{self.slug}: normalize {norm.returncode}, validate {'OK' if val.returncode == 0 else 'FAILED'}; {len(self.clips)} clips, "
              f"{len(self.media)} media, {len(self.sequences)} sequences, {self.length()} frames ({self.length() / 30:.1f} s), "
              f"fills and compound transforms restored after normalize: {restored}")
        if not ok:
            print(norm.stderr[-4000:])
            print(val.stdout[-4000:])
        return ok


P = Tour(SLUG, "Feature Tour 1.2", 1080, 1920, (30, 1), background=(0.055, 0.063, 0.125),
         description="About 30 seconds per v1.2 feature: styles, keyframes, captions, compounds, alpha, vectors, text, rigs, 2.5D, "
                     "transitions, blending, masks, effects, audio, time, Lottie, templates and export.")
P.settings_extra = {"perspective": 1600, "loudness": {"targetLufs": -14, "truePeakDb": -1}}


# ---------- generic clip builders
def add(kind, tid, start, dur, name, **fields):
    c = P._base(kind, tid, start, dur, name)
    for k, v in fields.items():
        if v is not None:
            c[k.rstrip("_")] = v
    return P._add(c)


def patch(cid, **fields):
    c = P.clips[cid]
    for k, v in fields.items():
        if v is None:
            continue
        k = k.rstrip("_")
        if k == "keyframes" and "keyframes" in c:
            c["keyframes"].update(v)
        else:
            c[k] = v
    return cid


def fades(i=0, o=0, curve=None):
    f = {"in": int(i), "out": int(o)}
    if curve:
        f["curve"] = curve
    return f


def solid(tid, start, dur, fill, w, h, shape="rect", radius=0, x=0, y=0, s=1.0, r=0, op=1.0, kf=None, name="Solid", fd=None, t=None, **extra):
    return add("solid", tid, start, dur, name, fill=fill, shape=shape, size={"w": w, "h": h}, cornerRadius=min(radius, min(w, h) / 2),
               transform=t or T(x, y, s, r), opacity=op, fades=fd, keyframes=kf, **extra)


def text(tid, start, dur, value, style, x=0, y=0, s=1.0, r=0, ain=None, aout=None, box=None, kf=None, name=None, fd=None, t=None, op=1.0, **extra):
    half = dur // 2
    return add("text", tid, start, dur, name or value.split("\n")[0][:40], text={"value": value, "box": box or {"mode": "auto", "width": 960}},
               style=style, animIn={**ain, "duration": min(ain["duration"], half)} if ain else None,
               animOut={**aout, "duration": min(aout["duration"], half)} if aout else None,
               transform=t or T(x, y, s, r), opacity=op, fades=fd or fades(), keyframes=kf, **extra)


def shape(tid, start, dur, w, h, paths, x=0, y=0, s=1.0, r=0, kf=None, name="Shape", fd=None, t=None, op=1.0, **extra):
    return add("shape", tid, start, dur, name, size={"w": w, "h": h}, paths=paths, transform=t or T(x, y, s, r), opacity=op,
               fades=fd, keyframes=kf, **extra)


def null(tid, start, dur, x=0, y=0, kf=None, name="Null", size=120, t=None, **extra):
    return add("null", tid, start, dur, name, size={"w": size, "h": size}, transform=t or T(x, y), keyframes=kf, **extra)


def compound(tid, start, dur, sid, x=0, y=0, s=1.0, r=0, offset=0, kf=None, name=None, fd=None, op=1.0, t=None, **extra):
    return add("compound", tid, start, dur, name or P.sequences[sid]["name"], sequenceId=sid, offset=offset, transform=t or T(x, y, s, r),
               opacity=op, fades=fd or fades(), volume={"gainDb": 0, "muted": False}, keyframes=kf, **extra)


def adjustment(tid, start, dur, effects, name="Adjustment", masks=None, kf=None, fd=None, op=1.0):
    return add("adjustment", tid, start, dur, name, effects=effects, opacity=op, masks=masks, fades=fd, keyframes=kf)


def vid(tid, start, dur, mid, **kw):
    kw.setdefault("muted", True)
    return P.video(tid, start, dur, mid, **kw)


def chip(tid, start, dur, label, x=0, y=0, color=None, size=34, ain=None, aout=None, font="Inter", fill=None):
    """A label in a rounded box."""
    st = text_style(font, size, 700, fill=fill or INK, bg=(color or YELLOW, 22, 10, 14, "block"))
    return text(tid, start, dur, label, st, x=x, y=y, ain=ain or anim("pop", 8), aout=aout or anim("fade", 6), name=f"Label {label[:30]}")


def label(tid, start, dur, value, x=0, y=0, size=30, fill=None, font="Inter", weight=600, ain=None):
    st = text_style(font, size, weight, fill=fill or rgba(1, 1, 1, 0.92), shadow=(0, 3, 8, rgba(0, 0, 0, 0.7)))
    return text(tid, start, dur, value, st, x=x, y=y, ain=ain or anim("fade", 8), aout=anim("fade", 6), name=f"Label {value[:30]}")


# ---------- assets
def tpl_media(*parts):
    p = os.path.join(TPL, *parts)
    assert os.path.exists(p), p
    return p


def foot(name):
    return P.add_media(tpl_media("04-overlay-stack", "media", "video", f"{name}.mp4"), "video", bin="Footage")


def photo(name):
    return P.add_media(tpl_media("01-montage-marathon", "media", "images", name), "image", bin="Photos")


def sticker(name):
    return P.add_media(tpl_media("01-montage-marathon", "media", "images", name), "image", bin="Stickers")


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, creationflags=IDLE)
    if p.returncode != 0:
        raise RuntimeError(f"{cmd[:3]} failed: {p.stderr[-800:]}")
    return p


def webp_frames(src, out_dir):
    """The frames of an animated WebP as frame_0001.png...; returns (count, w, h, fps)."""
    from PIL import Image
    os.makedirs(out_dir, exist_ok=True)
    with Image.open(src) as im:
        n, durs = im.n_frames, []
        for i in range(n):
            im.seek(i)
            durs.append(im.info.get("duration", 33) or 33)
            dst = os.path.join(out_dir, f"frame_{i + 1:04d}.png")
            if not os.path.exists(dst):
                im.convert("RGBA").save(dst)
        w, h = im.size
    fps = max(1, min(60, int(round(1000 / (sum(durs) / len(durs))))))
    return n, w, h, fps


def alpha_webm(name, sticker_file):
    out = os.path.join(GEN, f"{name}.webm")
    frames = os.path.join(GEN, f"{name}-frames")
    n, w, h, fps = webp_frames(tpl_media("01-montage-marathon", "media", "images", sticker_file), frames)
    if not os.path.exists(out):
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(frames, "frame_%04d.png"),
             "-vf", "format=yuva420p", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "28", "-auto-alt-ref", "0", out])
    mid = P.add_media(out, "video", bin="Alpha")
    P.media[mid]["alpha"] = True
    return mid


def image_sequence(name, sticker_file):
    frames = os.path.join(GEN, f"{name}-seq")
    n, w, h, fps = webp_frames(tpl_media("01-montage-marathon", "media", "images", sticker_file), frames)
    mid = P.nid("m")
    rel = f"media/{name}"
    P.media[mid] = {"id": mid, "kind": "image", "name": name, "file": {"relPath": f"{rel}/frame_0001.png"}, "binId": P.bin("Alpha"),
                    "width": w, "height": h, "codec": "png", "durationUs": int(round(n * 1_000_000 / fps)),
                    "sequence": {"dir": rel, "pattern": "frame_%04d.png", "first": 1, "count": n, "fps": {"num": fps, "den": 1}}}
    P.media_info[mid] = {"durationUs": int(round(n * 1_000_000 / fps)), "width": w, "height": h, "hasAudio": False}
    P.extra_dirs[rel] = frames
    return mid


def lottie(name):
    src = os.path.join(FIX, "lottie", "animations", name)
    if name.endswith(".lottie"):
        with zipfile.ZipFile(src) as z:
            inner = next(n for n in z.namelist() if n.startswith("animations/") and n.endswith(".json"))
            data = json.loads(z.read(inner))
        codec = "dotlottie"
    else:
        data = json.load(open(src, encoding="utf-8"))
        codec = "lottie"
    fr = data["fr"]
    dur = int(round((data["op"] - data["ip"]) / fr * 1e6))
    mid = P.nid("m")
    P.media[mid] = {"id": mid, "kind": "lottie", "name": name, "file": {"relPath": f"animations/{name}"}, "binId": P.bin("Lottie"),
                    "width": data["w"], "height": data["h"], "fps": {"num": int(round(fr)), "den": 1}, "durationUs": dur, "codec": codec}
    P.media_src[mid] = src
    P.media_info[mid] = {"durationUs": dur, "width": data["w"], "height": data["h"], "hasAudio": False}
    return mid


def green_screen():
    out = os.path.join(GEN, "greenscreen.mp4")
    if not os.path.exists(out):
        from PIL import Image, ImageDraw, ImageFont
        frames = os.path.join(GEN, "green-frames")
        os.makedirs(frames, exist_ok=True)
        smile = []
        n, w, h, fps = webp_frames(tpl_media("01-montage-marathon", "media", "images", "sticker-smiley-wink.webp"), os.path.join(GEN, "smile-frames"))
        for i in range(n):
            smile.append(Image.open(os.path.join(GEN, "smile-frames", f"frame_{i + 1:04d}.png")).resize((300, 300)))
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 64)
        except OSError:
            font = ImageFont.load_default()
        for f in range(240):
            im = Image.new("RGB", (1280, 720), (0, 177, 64))
            x = int(640 + 360 * math.sin(f / 240 * 2 * math.pi) - 150)
            y = int(250 + 120 * abs(math.sin(f / 30 * math.pi)) * -1 + 120)
            im.paste(smile[f % n], (x, y), smile[f % n])
            d = ImageDraw.Draw(im)
            d.text((640, 600), "KEYED OUT", fill=(255, 255, 255), font=font, anchor="mm")
            im.save(os.path.join(frames, f"{f + 1:04d}.png"))
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-framerate", "30", "-i", os.path.join(frames, "%04d.png"),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", out])
    return P.add_media(out, "video", bin="Footage")


def lut_file():
    out = os.path.join(GEN, "teal-orange.cube")
    if not os.path.exists(out):
        n = 17
        rows = ["TITLE \"Teal and orange\"", f"LUT_3D_SIZE {n}", ""]
        for b in range(n):
            for g in range(n):
                for r in range(n):
                    R, G, B = r / (n - 1), g / (n - 1), b / (n - 1)
                    lum = 0.2126 * R + 0.7152 * G + 0.0722 * B
                    t = max(0.0, min(1.0, (lum - 0.15) / 0.7))
                    tr, tg, tb = 0.0, 0.42, 0.48
                    orr, og, ob = 1.0, 0.62, 0.32
                    cr, cg, cb = tr + (orr - tr) * t, tg + (og - tg) * t, tb + (ob - tb) * t
                    k = 0.45
                    o = [min(1, max(0, (1 - k) * c + k * c2 * (0.35 + 0.9 * lum))) for c, c2 in ((R, cr), (G, cg), (B, cb))]
                    rows.append(f"{o[0]:.5f} {o[1]:.5f} {o[2]:.5f}")
        open(out, "w", encoding="utf-8", newline="\n").write("\n".join(rows) + "\n")
    P.extra_dirs["luts/teal-orange.cube"] = out
    return "luts/teal-orange.cube"


def tone(name, expr, seconds):
    out = os.path.join(GEN, f"{name}.wav")
    if not os.path.exists(out):
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", f"aevalsrc={expr}:s=48000:d={seconds}",
             "-ac", "2", "-c:a", "pcm_s16le", out])
    return P.add_media(out, "audio", bin="Sounds")


def tts(ident, line, voice, rate=0):
    d = os.path.join(GEN, "tts")
    os.makedirs(d, exist_ok=True)
    wav, js, txt = (os.path.join(d, f"{ident}.{e}") for e in ("wav", "json", "txt"))
    if not (os.path.exists(wav) and os.path.exists(js) and os.path.exists(txt) and open(txt, encoding="utf-8").read() == line):
        open(txt, "w", encoding="utf-8").write(line)
        run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(HERE, "tts.ps1"),
             "-In", txt, "-Wav", wav, "-Json", js, "-Voice", voice, "-Rate", str(rate)])
        m4a = os.path.join(tplkit.CONV_DIR, f"tour-{ident}.m4a")
        if os.path.exists(m4a):
            os.remove(m4a)
    return wav, json.load(open(js, encoding="utf-8"))


# ---------- tracks
BG = P.vtrack("Background")
LY = [P.vtrack(f"Layer {i}") for i in range(1, 29)]
HSH = P.vtrack("Header shade")
HDR = P.vtrack("Header")
SUB = P.vtrack("Header 2")
NUM = P.vtrack("Chapter")
BAR = P.vtrack("Progress", height="S")
CAP_BASE = {
    "text": text_style("Montserrat", 60, 800, fill=WHITE, stroke=(8, INK), anchor="bottom"),
    "position": "custom", "x": 0, "y": 700, "maxWidth": 940, "maxLines": 2,
    "highlight": {"mode": "color", "color": YELLOW, "inactiveColor": WHITE},
    "anim": {"in": {"kind": "pop", "frames": 4}, "out": {"kind": "fade", "frames": 3}},
}
CC = P.ctrack(CAP_BASE, "Captions")
NARR = P.atrack("Narration")
MUSIC = P.atrack("Music")
SFX = P.atrack("SFX")
PAN = P.atrack("Pan demo")
for t in P.atracks:
    if t["id"] == MUSIC:
        t["gainDb"] = -3
    if t["id"] == SFX:
        t["gainDb"], t["pan"] = -2, 0.25

CAP_VARIANTS = [
    {"highlight": {"mode": "color"}},
    {"highlight": {"mode": "scale"}},
    {"highlight": {"mode": "colorAndScale", "color": TEAL}},
    {"highlight": {"mode": "progressive", "inactiveColor": GREY}},
    {"highlight": {"mode": "background", "color": CORAL},
     "text": {"stroke": {"enabled": False}, "background": {"enabled": True, "mode": "block", "color": rgba(0.09, 0.09, 0.14, 0.8), "paddingX": 26, "paddingY": 12, "radius": 18}}},
    {"highlight": {"mode": "reveal", "inactiveColor": WHITE}},
    {"highlight": {"mode": "color", "color": PINK}, "anim": {"in": {"kind": "slideUp", "frames": 6}, "out": {"kind": "slideDown", "frames": 4}}},
]
SECTIONS = []  # (number, title, start)


def narrate(t, sentences, voice, rate=0, ident="n"):
    """Speaks each (text, override, extra) sentence after the previous one; captions from the word timings.
    Returns (end frame, [(start, end) per sentence])."""
    spans = []
    for i, item in enumerate(sentences):
        line, override = item[0], item[1]
        extra = item[2] if len(item) > 2 else {}
        wav, entries = tts(f"{ident}-{i + 1}", line, voice, rate)
        m4a = conv(wav, f"tour-{ident}-{i + 1}.m4a", AAC_VOICE)
        mid = P.add_media(m4a, "audio", name=f"{ident}-{i + 1}.m4a", bin="Narration", sub="audio/narration")
        dur = P.ff(P.mdur(mid))
        P.audio(NARR, t, dur, mid, gain=0, name=f"VO {ident} {i + 1}")
        cues = cues_from_tts(entries, line, max_words=extra.get("max_words", 6), max_ms=extra.get("max_ms", 2800))
        starts = [t + P.f(c[0] / 1000) for c in cues]
        for j, (s_ms, e_ms, seg, words) in enumerate(cues):
            cs = starts[j]
            ce = t + P.f(e_ms / 1000) + 6
            if j + 1 < len(cues):
                ce = min(ce, starts[j + 1])
            ce = min(ce, t + dur + 8)
            ws = []
            for w, ws_ms, we_ms in words:
                a = t + P.f(ws_ms / 1000) - cs
                b = max(a + 1, t + P.f(we_ms / 1000) - cs)
                wd = {"text": w, "start": a, "end": b}
                bare = w.strip(".,!?;:").lower()
                if bare in extra.get("emphasis", ()):
                    wd["emphasis"] = True
                if bare in extra.get("colors", {}):
                    wd["color"] = extra["colors"][bare]
                ws.append(wd)
            P.caption(cs, max(1, ce - cs), seg, words=ws, override=override or None)
        spans.append((t, t + dur))
        t += dur + 10
    return t, spans


def header(t0, dur, n, total, title, sub, mark_color="blue"):
    SECTIONS.append((n, title, t0))
    solid(HSH, t0, dur, lin(0, (0, rgba(0, 0, 0, 0.72)), (0.6, rgba(0, 0, 0, 0.35)), (1, rgba(0, 0, 0, 0))), 1080, 470, y=-725, name="Header shade")
    size = min(118, int(1000 / (0.43 * len(title))))  # Bebas Neue capitals are about 0.43 em wide: keep the title inside 1000 px
    text(HDR, t0, dur, title.upper(), text_style("Bebas Neue", size, 400, fill=WHITE, shadow=(0, 6, 18, rgba(0, 0, 0, 0.6)), spacing=2),
         y=-800, ain=anim("slideDown", 12), aout=anim("fade", 8), name=f"Title {n:02d}")
    text(SUB, t0 + 6, dur - 6, sub, text_style("Inter", 32, 500, fill=rgba(1, 1, 1, 0.72), shadow=(0, 2, 6, rgba(0, 0, 0, 0.6))),
         y=-716, ain=anim("fade", 10), aout=anim("fade", 8), box={"mode": "fixed", "width": 980}, name=f"Subtitle {n:02d}")
    if n:
        chip(NUM, t0, dur, f"{n:02d} / {total}", y=-905, color=CORAL, size=28, fill=WHITE)
    P.marker(t0, f"{n:02d} {title}" if n else title, mark_color)
    P.audio(SFX, t0, P.ff(0.44), WHOOSH, gain=-6, name="Whoosh")


def bg_solid(t0, dur, fill, name="Background"):
    return solid(BG, t0, dur, fill, 1080, 1920, name=name)


def footloop(mid, dur, name=None):
    """A 1280x720 sequence that loops a footage file for `dur` frames with short crossfades (for long tiles and backgrounds)."""
    k = (mid, dur)
    if k in P.loops:
        return P.loops[k]
    info = P.media_info[mid]
    sid = P.sequence(P.nid("loop"), name or f"Loop {P.media[mid]['name']}", info["width"], info["height"], dur, bg=rgba(0, 0, 0))
    tr = P.strack(sid)
    seg = min(P.ff(P.mdur(mid)), 225)
    ids, pos = [], 0
    while pos < dur:
        d = min(seg, dur - pos)
        if d < 20 and ids:
            P.clips[ids[-1]]["duration"] += d
            c = P.clips[ids[-1]]
            c["out"] = c["in"] + int(round(c["duration"] * c["speed"] * P.us_per_frame))
            break
        ids.append(vid(tr, pos, d, mid, scale=1.0, src_in=0.0))
        if len(ids) > 1:
            P.transition(ids[-2], ids[-1], "crossDissolve", 8, 8)
        pos += d
    P.loops[k] = sid
    return sid


def tile(tid, start, dur, mid, w, x, y, name=None, **extra):
    """Footage shown `w` px wide through a looping compound."""
    sid = footloop(mid, dur)
    return compound(tid, start, dur, sid, x=x, y=y, s=w / P.media_info[mid]["width"], name=name or P.media[mid]["name"], **extra)


def cover(tid, start, dur, mid, name=None, **extra):
    sid = footloop(mid, dur)
    info = P.media_info[mid]
    return compound(tid, start, dur, sid, s=max(1080 / info["width"], 1920 / info["height"]), name=name or f"BG {P.media[mid]['name']}", **extra)


def card_image(tid, start, dur, mid, w, h, x=0, y=0, radius=24, stroke=None, kf=None, t=None, name=None, **extra):
    """A photo cropped to a w x h card."""
    info = P.media_info[mid]
    s = max(w / info["width"], h / info["height"])
    cx = max(0.0, (info["width"] * s - w) / (info["width"] * s) / 2)
    cy = max(0.0, (info["height"] * s - h) / (info["height"] * s) / 2)
    cid = P.image(tid, start, dur, mid, scale=s, x=x, y=y, crop={"left": round(cx, 4), "right": round(cx, 4), "top": round(cy, 4), "bottom": round(cy, 4)},
                  kf=kf, name=name)
    patch(cid, cornerRadius=radius, stroke=stroke, **extra)
    if t:
        P.clips[cid]["transform"] = {**t, "scale": round(s, 5)}
    return cid


# ---------- media
WHOOSH = P.add_media(tpl_media("01-montage-marathon", "media", "audio", "whoosh-short.wav"), "audio", bin="Sounds")
IMPACT = P.add_media(tpl_media("01-montage-marathon", "media", "audio", "impact.wav"), "audio", bin="Sounds")
HOUSE = P.add_media(tpl_media("02-kinetic-typography", "media", "audio", "kin-house-128.mp3"), "audio", bin="Music")
BEAT120 = P.add_media(tpl_media("01-montage-marathon", "media", "audio", "mon-beat-120.m4a"), "audio", bin="Music")
OCEAN, STREET, CITY, FOREST = foot("ocean-waves-beach-1_01"), foot("street-market-1_01"), foot("city-traffic-night-1_01"), foot("forest-drone-1_01")
SNOW, FLOWERS, TRAIN, WATERFALL = foot("snow-falling-1_01"), foot("flowers-macro-1_01"), foot("train-1_01"), foot("waterfall-1_01")
ROCKET, CLOUDS, CLOUDS2 = foot("nasa-rocket-launch_01"), foot("timelapse-clouds-1_01"), foot("timelapse-clouds-2_01")
VOLCANO, LIGHTNING, WATERFALL2, SNOW2 = foot("volcano-eruption-1_01"), foot("lightning-storm-1_01"), foot("waterfall-2_01"), foot("snow-falling-2_01")
PARTICLES, LEAK = foot("mg-particles-vertical"), foot("mg-light-leak")
PH = {n: photo(f"photo-{n}.jpg") for n in ("earth", "earthrise", "saturn", "jupiter", "pillars", "aldrin")}
SMILEY, FIRE, SPARKLE = sticker("sticker-smiley-wink.webp"), sticker("sticker-fire.webp"), sticker("sticker-sparkle.webp")


# =====================================================================================================================
def intro(t0, dur):
    header(t0, dur, 0, 0, "Shorts Editor 1.2", "Feature tour: 22 features, about 30 seconds each. Chapters are markers on the timeline.")
    cover(BG, t0, dur, ROCKET, op=0.85)
    solid(LY[0], t0, dur, lin(180, (0, rgba(0.05, 0.06, 0.12, 0.2)), (1, rgba(0.05, 0.06, 0.12, 0.95))), 1080, 1920, name="Fade to dark")
    st = text_style("Anton", 210, 400, fill=lin(90, (0, YELLOW), (0.5, CORAL), (1, PINK)), shadow=(0, 10, 30, rgba(0, 0, 0, 0.6)))
    text(LY[1], t0 + 10, dur - 10, "FEATURE\nTOUR", st, y=-260, ain=anim("decode", 30), aout=anim("fade", 10), name="Tour title")
    rows = ["Styles  ·  Keyframes  ·  Captions", "Compounds  ·  Alpha  ·  Vectors", "Text  ·  Rigs  ·  2.5D  ·  Transitions",
            "Blending  ·  Masks  ·  Effects", "Audio  ·  Time  ·  Lottie  ·  Templates"]
    for i, row in enumerate(rows):
        label(LY[2 + i], t0 + 40 + i * 12, dur - 40 - i * 12, row, y=60 + i * 70, size=40, ain=anim("slideUp", 12))
    return narrate(t0 + 20, [("Welcome to the Shorts Editor feature tour. Each section shows one new feature of version 1.2, for about thirty seconds.",
                              CAP_VARIANTS[2])], "Microsoft Zira Desktop", 0, "intro")


def s_styles(t0, n):
    header(t0, SEC, n, 22, "Shape, frame and box styles", "Batch 58 · fill gradients with stops, stroke align and dashes, hard and soft shadows, cornerRadii")
    solid(BG, t0, SEC, rad((0, hexc("23284A")), (1, hexc("07080F")), radius=1.1), 1080, 1920, name="Radial background")
    pop = {"transform.scale": [key(0, 0.6, "backOut"), key(14, 1)]}
    c = solid(LY[0], t0 + 10, SEC - 10, WHITE, 400, 260, x=-250, y=-470, name="Paper card", kf=pop,
              stroke={"width": 3, "color": INK, "align": "inside"}, shadow={"x": 10, "y": 10, "blur": 0, "spread": 0, "color": INK})
    patch(c, keyframes={"shadow.x": [key(60, 10, "quadOut"), key(75, 2, "quadIn"), key(90, 10)], "shadow.y": [key(60, 10, "quadOut"), key(75, 2, "quadIn"), key(90, 10)]})
    label(LY[1], t0 + 20, SEC - 20, "paper card\nhard shadow", x=-250, y=-470, size=34, fill=INK, weight=700)
    solid(LY[2], t0 + 18, SEC - 18, rad((0, hexc("FFF266")), (0.35, hexc("F25A4D")), (0.7, hexc("6633B3")), (1, hexc("141A4D"))), 400, 260,
          shape="roundedRect", radius=28, x=250, y=-470, name="Badge", kf={**pop, "stroke.dashOffset": [key(0, 0), key(SEC - 18, 1200)]},
          cornerRadii=[28, 28, 120, 0], stroke={"width": 6, "color": WHITE, "align": "center", "dash": [24, 16], "dashOffset": 0})
    label(LY[3], t0 + 28, SEC - 28, "4-stop radial · dashes\ncorner radii", x=250, y=-470, size=30)
    v = vid(LY[4], t0 + 30, SEC - 30, OCEAN, speed=0.26, scale=0.62, y=-90, name="Rounded video")
    patch(v, cornerRadius=40, stroke={"width": 6, "color": WHITE, "align": "inside"},
          shadow={"x": 0, "y": 24, "blur": 48, "spread": 0, "color": rgba(0, 0, 0, 0.65)},
          keyframes={"cornerRadius": [key(0, 0, "cubicInOut"), key(60, 120, "cubicInOut"), key(150, 40)], "transform.scale": [key(0, 0.5, "backOut"), key(18, 0.62)]})
    label(LY[5], t0 + 40, SEC - 40, "video: corner radius, border, soft shadow", y=170, size=30)
    solid(LY[6], t0 + 45, SEC - 45, lin(135, (0, CORAL), (1, YELLOW)), 280, 150, shape="ellipse", x=-330, y=300, name="Pill",
          stroke={"width": 8, "color": WHITE, "align": "outside"}, kf=pop)
    solid(LY[7], t0 + 52, SEC - 52, TEAL, 280, 150, shape="roundedRect", radius=30, x=0, y=300, name="Soft shadow", kf={
        **pop, "shadow.blur": [key(0, 0, "sineInOut"), key(90, 60, "sineInOut"), key(180, 0, "sineInOut"), key(270, 60, "sineInOut"), key(360, 0)],
        "shadow.spread": [key(0, 0, "sineInOut"), key(90, 14, "sineInOut"), key(180, 0)]},
        shadow={"x": 0, "y": 18, "blur": 0, "spread": 0, "color": rgba(0.05, 0.9, 0.8, 0.7)})
    solid(LY[8], t0 + 60, SEC - 60, VIOLET, 280, 150, x=330, y=300, name="Dashed inside", kf=pop,
          stroke={"width": 10, "color": YELLOW, "align": "inside", "dash": [30, 14], "dashOffset": 0},
          shadow={"x": -12, "y": 12, "blur": 0, "spread": 0, "color": PINK})
    for i, (lx, s) in enumerate(((-330, "linear gradient\nstroke outside"), (0, "soft shadow\nblur + spread keyed"), (330, "inside dashes\ncolored hard shadow"))):
        label(LY[9 + i], t0 + 70, SEC - 70, s, x=lx, y=430, size=26)
    st = text_style("Montserrat", 46, 800, fill=INK, bg=(PAPER, 30, 14, 18, "line"))
    st["background"]["stroke"] = {"enabled": True, "width": 4, "color": INK}
    st["background"]["shadow"] = {"enabled": True, "x": 8, "y": 8, "blur": 0, "color": CORAL}
    text(LY[12], t0 + 90, SEC - 90, "Text boxes take borders too", st, y=560, ain=anim("pop", 10), aout=anim("fade", 8))
    narrate(t0 + 20, [("Shapes, frames and boxes now take strokes, dashes, hard and soft shadows, a radius per corner, and gradient fills with up to eight stops.",
                       CAP_VARIANTS[0])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_eases(t0, n):
    header(t0, SEC, n, 22, "Keyframes v2: eases", "Batch 60 · 30 Penner eases, cubic bezier, spring, hold; the same two keys, eight curves")
    bg_solid(t0, SEC, hexc("12131F"))
    eases = [("linear", "linear", {}), ("sineInOut", "sineInOut", {}), ("expoOut", "expoOut", {}), ("backOut", "backOut", {}),
             ("elasticOut", "elasticOut", {}), ("bounceOut", "bounceOut", {}), ("bezier overshoot", "bezier", {"bezier": [0.68, -0.55, 0.27, 1.55]}),
             ("spring", "spring", {"spring": {"damping": 0.45, "frequency": 3}})]
    cols = [CORAL, YELLOW, TEAL, BLUE, VIOLET, PINK, GREEN, WHITE]
    left, right = -150, 400
    rails = []
    for i, (name, e, extra) in enumerate(eases):
        y = -580 + i * 120
        text(LY[i], t0 + 10 + i * 4, SEC - 10 - i * 4, name, text_style("JetBrains Mono", 26, 600, fill=cols[i]), x=-350, y=y,
             ain=anim("slideRight", 10), aout=anim("fade", 6), name=f"Ease {name}")
        rails.append(f"M0 {i * 120} L{right - left} {i * 120}")
        keys = []
        for cyc in range(6):
            f = 20 + cyc * 145
            keys += [key(f, left, e, **extra), key(f + 55, right), key(f + 72, right, e, **extra), key(f + 127, left)]
        solid(LY[9 + i], t0 + 10, SEC - 10, cols[i], 56, 56, shape="ellipse", x=left, y=y, name=f"Ball {name}", kf={"transform.x": keys},
              shadow={"x": 0, "y": 6, "blur": 12, "spread": 0, "color": rgba(0, 0, 0, 0.5)})
    shape(LY[8], t0 + 10, SEC - 10, right - left, 7 * 120, [pth("rails", " ".join(rails), stroke=stk(6, rgba(1, 1, 1, 0.14)))],
          x=(left + right) / 2, y=-580 + 3.5 * 120, name="Rails")
    holds = [key(i * 24, L(c), "hold") for i, c in enumerate([CORAL, YELLOW, TEAL, VIOLET] * 9)]
    solid(LY[17], t0 + 30, SEC - 30, CORAL, 150, 150, shape="roundedRect", radius=26, x=-260, y=420, name="Hold colors", kf={"fill": holds})
    spring = {"damping": 0.35, "frequency": 4}
    solid(LY[18], t0 + 30, SEC - 30, TEAL, 140, 40, shape="roundedRect", radius=20, name="Spring width", t=T(80, 420, ax=0, ay=0.5),
          kf={"size.w": [k for c in range(5) for k in (key(c * 170, 140, "spring", spring=spring), key(c * 170 + 85, 420, "spring", spring=spring))]})
    label(LY[19], t0 + 40, SEC - 40, "hold: instant color changes", x=-260, y=530, size=26)
    label(LY[20], t0 + 40, SEC - 40, "spring on size.w", x=230, y=530, size=26)
    narrate(t0 + 20, [("Keyframes gained thirty Penner eases, custom bezier curves and springs. Each ball here uses a different ease on the same two keys.",
                       CAP_VARIANTS[1])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def s_animate(t0, n):
    header(t0, SEC, n, 22, "Keyframes v2: key everything", "Batches 60-61 · color, size, corner, stroke, shadow, crop, text size, spacing and fill keys")
    bg_solid(t0, SEC, hexc("101424"))
    cyc = [CORAL, YELLOW, TEAL, BLUE, PINK]
    solid(LY[0], t0 + 10, SEC - 10, CORAL, 360, 220, shape="roundedRect", radius=30, x=-260, y=-480, name="Fill keys",
          kf={"fill": [key(i * 60, L(cyc[i % 5]), "sineInOut") for i in range(15)]})
    solid(LY[1], t0 + 14, SEC - 14, VIOLET, 300, 220, x=260, y=-480, name="Corner keys",
          kf={"cornerRadius": [key(i * 75, 0 if i % 2 == 0 else 110, "cubicInOut") for i in range(12)]})
    solid(LY[2], t0 + 18, SEC - 18, hexc("1E2235"), 300, 200, shape="roundedRect", radius=24, x=-260, y=-120, name="Stroke keys",
          stroke={"width": 4, "color": TEAL, "align": "inside"},
          kf={"stroke.width": [key(i * 60, 4 if i % 2 == 0 else 40, "sineInOut") for i in range(14)],
              "stroke.color": [key(i * 90, L([TEAL, YELLOW, PINK][i % 3])) for i in range(9)]})
    orbit = [(30 * math.cos(i * math.pi / 4), 30 * math.sin(i * math.pi / 4)) for i in range(57)]
    solid(LY[3], t0 + 22, SEC - 22, WHITE, 260, 180, shape="roundedRect", radius=20, x=260, y=-120, name="Shadow keys",
          shadow={"x": 30, "y": 0, "blur": 10, "spread": 0, "color": CORAL},
          kf={"shadow.x": [key(i * 15, p[0]) for i, p in enumerate(orbit)], "shadow.y": [key(i * 15, p[1]) for i, p in enumerate(orbit)],
              "shadow.color": [key(i * 120, L(cyc[i % 5])) for i in range(8)]})
    text(LY[4], t0 + 26, SEC - 26, "BREATHE", text_style("Archivo Black", 70, 400, fill=YELLOW), x=-260, y=240, name="Text size keys",
         kf={"style.fontSize": [key(i * 90, 60 if i % 2 == 0 else 96, "sineInOut") for i in range(10)],
             "style.letterSpacing": [key(i * 90, 0 if i % 2 == 0 else 16, "sineInOut") for i in range(10)]})
    v = vid(LY[5], t0 + 30, SEC - 30, FLOWERS, speed=0.26, scale=380 / 934, x=260, y=240, name="Crop keys")
    patch(v, cornerRadius=16, keyframes={"crop.left": [key(i * 80, 0 if i % 2 == 0 else 0.3, "cubicInOut") for i in range(11)],
                                         "crop.right": [key(i * 80, 0 if i % 2 == 0 else 0.3, "cubicInOut") for i in range(11)]})
    text(LY[6], t0 + 60, SEC - 60, "Text fill is keyable too", text_style("Montserrat", 54, 800, fill=WHITE), y=480, name="Text fill keys",
         ain=anim("slideUp", 12), aout=anim("fade", 8), kf={"style.fill": [key(i * 45, L(cyc[i % 5])) for i in range(17)]})
    for i, (x, y, s) in enumerate(((-260, -340, "fill: color keys"), (260, -340, "cornerRadius"), (-260, 10, "stroke.width + stroke.color"),
                                   (260, 10, "shadow.x / y / color"), (-260, 360, "style.fontSize + letterSpacing"), (260, 380, "crop.left + crop.right"))):
        label(LY[7 + i], t0 + 30, SEC - 30, s, x=x, y=y, size=26, font="JetBrains Mono", weight=500)
    narrate(t0 + 20, [("Almost every field can be keyed now: colors, sizes, corners, strokes, shadows, crop, text size and letter spacing.",
                       CAP_VARIANTS[2])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_captions(t0, n):
    header(t0, SEC, n, 22, "Captions v2", "Batch 59 · progressive and reveal highlights, emphasis words, cue animations, a box per word, words import")
    cover(BG, t0, SEC, STREET)
    solid(LY[0], t0, SEC, rgba(0.03, 0.03, 0.08, 0.62), 1080, 1920, name="Dim")
    word_box = {"highlight": {"mode": "background", "color": CORAL},
                "text": {"fill": INK, "stroke": {"enabled": False},
                         "background": {"enabled": True, "mode": "word", "color": WHITE, "paddingX": 14, "paddingY": 6, "radius": 12,
                                        "stroke": {"enabled": True, "width": 3, "color": INK}, "shadow": {"enabled": True, "x": 5, "y": 5, "blur": 0, "color": INK}}}}
    lines = [
        ("Captions, version 2.", {"highlight": {"mode": "colorAndScale", "color": YELLOW}, "text": {"fontSize": 84}}, {"max_words": 4}, "highlight: colorAndScale"),
        ("Progressive words stay colored once they are spoken.", {"highlight": {"mode": "progressive", "color": YELLOW, "inactiveColor": GREY}}, {},
         "highlight: progressive"),
        ("Reveal mode shows each word only as it is said.", {"highlight": {"mode": "reveal", "color": TEAL, "inactiveColor": WHITE}}, {}, "highlight: reveal"),
        ("Emphasis words get their own color, and any single word can be painted.", {"highlight": {"mode": "scale", "emphasisColor": CORAL}},
         {"emphasis": {"emphasis", "own", "color"}, "colors": {"single": TEAL, "painted": PINK}}, "emphasis words + per-word color"),
        ("Cues can pop, fade, or slide in and out.", {"highlight": {"mode": "color"}, "anim": {"in": {"kind": "slideUp", "frames": 8}, "out": {"kind": "slideDown", "frames": 6}}},
         {"max_words": 4}, "cue animations: slideUp / slideDown"),
        ("A box can sit behind every single word.", word_box, {}, "box per word + background highlight"),
        ("And every cue can have its own font, size and place.",
         {"position": "custom", "y": -120, "text": {"fontFamily": "Permanent Marker", "fontWeight": 400, "fontSize": 92, "fill": YELLOW},
          "highlight": {"mode": "none"}, "anim": {"in": {"kind": "pop", "frames": 8}, "out": {"kind": "fade", "frames": 6}}}, {}, "own font, size and position"),
    ]
    end, spans = narrate(t0 + 20, [(a, b, c) for a, b, c, _ in lines], "Microsoft Zira Desktop", 1, f"s{n:02d}")
    for i, ((s, e), (_, _, _, what)) in enumerate(zip(spans, lines)):
        chip(LY[1 + i % 2], s, e - s + 8, what, y=-520, color=YELLOW, size=36)
    label(LY[3], t0 + 30, SEC - 30, "Import words: JSON word timings, with cues and emphasis words", y=-400, size=26, fill=rgba(1, 1, 1, 0.7))


def card_sequence():
    if "card" in P.sequences:
        return "card"
    sid = P.sequence("card", "Card", 800, 480, 300, bg=None)
    tb, ti, tt, tx, td = (P.strack(sid, "video", nm) for nm in ("bg", "photo", "title", "body", "dot"))
    solid(tb, 0, 300, lin(135, (0, VIOLET), (1, BLUE)), 800, 480, shape="roundedRect", radius=40, name="Card bg",
          stroke={"width": 4, "color": rgba(1, 1, 1, 0.5), "align": "inside"})
    card_image(ti, 0, 300, PH["saturn"], 260, 260, x=-220, y=0, radius=130, stroke={"width": 6, "color": WHITE, "align": "inside"},
               kf={"transform.rotation": [key(0, 0), key(300, 40)]}, name="Card photo")
    text(tt, 10, 290, "COMPOUND", text_style("Bebas Neue", 104, 400, fill=WHITE), x=150, y=-60, ain=anim("slideUp", 14), name="Card title")
    text(tx, 20, 280, "edit once,\nevery copy changes", text_style("Inter", 36, 600, fill=rgba(1, 1, 1, 0.85), line_height=1.15), x=150, y=70,
         ain=anim("fade", 12), name="Card body")
    solid(td, 0, 300, YELLOW, 50, 50, shape="ellipse", x=330, y=-180, name="Card dot",
          kf={"transform.scale": [key(i * 30, 1 if i % 2 == 0 else 1.4, "sineInOut") for i in range(11)]})
    return sid


def s_compound(t0, n):
    header(t0, SEC, n, 22, "Compound clips", "Batches 62-63 · sequences inside clips: instances, offsets, nesting, one cached texture each")
    solid(BG, t0, SEC, rad((0, hexc("2A1B4A")), (1, hexc("0B0814")), radius=1.2), 1080, 1920, name="Background")
    card = card_sequence()
    pop = {"transform.scale": [key(0, 0.2, "backOut"), key(16, 1)]}
    compound(LY[0], t0, 300, card, y=-360, name="Card instance", kf=pop, fd=fades(0, 10))
    compound(LY[1], t0 + 10, 290, card, x=-255, y=140, s=0.55, r=-6, kf={"transform.scale": [key(0, 0.1, "backOut"), key(16, 0.55)]}, fd=fades(0, 10))
    compound(LY[2], t0 + 20, 180, card, x=255, y=140, s=0.55, r=6, offset=120, name="Card, offset 120", fd=fades(0, 10))
    label(LY[3], t0 + 30, 270, "one sequence · three instances", y=-90, size=30)
    label(LY[4], t0 + 30, 170, "offset 120: shows the card's second half", x=255, y=320, size=24)
    label(LY[5], t0 + 30, 270, "rotated + scaled", x=-255, y=320, size=24)
    pair = P.sequence("pair", "Pair (nested)", 1080, 1100, 300, bg=None)
    ta, tb = P.strack(pair, "video", "top"), P.strack(pair, "video", "bottom")
    compound(ta, 0, 300, card, y=-270, s=0.9, name="Card in pair")
    compound(tb, 0, 300, card, y=270, s=0.9, offset=0, name="Card in pair 2", kf={"transform.x": [key(0, -60, "sineInOut"), key(150, 60, "sineInOut"), key(300, -60)]})
    compound(LY[0], t0 + 300, 300, pair, y=-120, s=0.85, name="Pair compound", fd=fades(8, 10),
             kf={"transform.rotation": [key(0, -8, "sineInOut"), key(150, 8, "sineInOut"), key(300, -8)],
                 "transform.scale": [key(0, 0.7, "backOut"), key(20, 0.85)]})
    label(LY[3], t0 + 310, 290, "a compound nested in a compound, turned as one", y=440, size=30)
    for i in range(4):
        x, y = (-255 if i % 2 == 0 else 255), (-420 if i < 2 else -140)
        compound(LY[1 + i], t0 + 600 + i * 12, 300 - i * 12, card, x=x, y=y, s=0.48, name=f"Grid card {i + 1}",
                 kf={"transform.scale": [key(0, 0.1, "backOut"), key(16, 0.48)]}, fd=fades(0, 10))
    label(LY[5], t0 + 620, 280, "four instances of one sequence", y=100, size=30)
    narrate(t0 + 20, [("A compound clip groups layers into one sequence. Edit it once and every instance changes, even when it is nested inside another compound.",
                       CAP_VARIANTS[3])], "Microsoft David Desktop", 0, f"s{n:02d}")


def vloop(tid, start, dur, mid, **kw):
    seg, ids, pos = P.ff(P.mdur(mid)), [], 0
    while pos < dur:
        d = min(seg, dur - pos)
        if d < 3:
            break
        ids.append(vid(tid, start + pos, d, mid, **kw))
        pos += d
    return ids


def s_alpha(t0, n):
    header(t0, SEC, n, 22, "Alpha video and image sequences", "Batch 64 · VP9 WebM with an alpha channel; numbered PNG frames as one looping clip")
    cover(BG, t0, SEC, FOREST)
    tunnel = alpha_webm("tunnel-alpha", "sticker-big-tunnel.webp")
    confetti = alpha_webm("confetti-alpha", "sticker-confetti.webp")
    star = image_sequence("star-spin", "sticker-star-spin.webp")
    fire = image_sequence("fire", "sticker-fire.webp")
    vloop(LY[0], t0 + 10, SEC - 10, tunnel, scale=0.85, y=-300, name="Tunnel (alpha WebM)")
    vloop(LY[1], t0 + 60, SEC - 60, confetti, scale=1.6, y=150, name="Confetti (alpha WebM)")
    P.image(LY[2], t0 + 90, SEC - 90, star, scale=0.7, x=-330, y=380, name="Star (PNG sequence)")
    P.image(LY[3], t0 + 100, SEC - 100, star, scale=0.5, x=330, y=330, name="Star 2 (PNG sequence)")
    P.image(LY[4], t0 + 110, SEC - 110, fire, scale=0.9, x=0, y=420, name="Fire (PNG sequence)")
    chip(LY[5], t0 + 20, SEC - 20, "VP9 alpha WebM", x=0, y=-620, color=TEAL, size=34)
    chip(LY[6], t0 + 100, SEC - 100, "PNG sequence · loops while the clip lasts", x=0, y=580, color=YELLOW, size=30)
    narrate(t0 + 20, [("Transparent video plays natively. These are VP9 WebM files with an alpha channel, next to numbered PNG image sequences.",
                       CAP_VARIANTS[4])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def svg_paths():
    proj = json.load(open(os.path.join(FIX, "svg", "project.json"), encoding="utf-8"))
    return {c["name"]: (c["size"], c["paths"]) for c in proj["clips"].values() if c["kind"] == "shape"}


def s_vector(t0, n):
    header(t0, SEC, n, 22, "Vector shapes and SVG", "Batches 65-66 · paths, trim paths, primitives, dashes, fill rules; SVG files import as shapes")
    bg_solid(t0, SEC, hexc("181A2B"))
    xs, ys = (-330, 0, 330), (-500, -190, 120)
    d0 = t0 + 10
    D = SEC - 10
    trim = [k for c in range(6) for k in (key(c * 150, 0, "cubicOut"), key(c * 150 + 25, 1), key(c * 150 + 120, 1, "cubicIn"), key(c * 150 + 140, 0))]
    shape(LY[0], d0, D, 300, 250, [pth("tick", "M40 130 L110 200 L260 50", stroke=stk(28, GREEN))], x=xs[0], y=ys[0], s=0.9, name="Checkmark",
          kf={"paths.tick.trim.end": trim})
    gauge = [k for c in range(5) for k in (key(c * 180, -135, "cubicOut"), key(c * 180 + 70, 135, "linear"), key(c * 180 + 150, 135, "cubicInOut"), key(c * 180 + 175, -135))]
    shape(LY[1], d0, D, 300, 300, [pth("track", stroke=stk(24, rgba(1, 1, 1, 0.18)), primitive={"kind": "arc", "radius": 120, "start": -135, "end": 135}),
                                   pth("value", stroke=stk(24, YELLOW), primitive={"kind": "arc", "radius": 120, "start": -135, "end": 135})],
          x=xs[1], y=ys[0], s=0.85, name="Gauge", kf={"paths.value.primitive.end": gauge})
    shape(LY[2], d0, D, 260, 260, [pth("spin", stroke=stk(18, TEAL), trim={"start": 0, "end": 0.3, "offset": 0}, primitive={"kind": "ellipse", "w": 200, "h": 200})],
          x=xs[2], y=ys[0], name="Spinner", kf={"paths.spin.trim.offset": [key(0, 0), key(D, 8)],
                                                 "paths.spin.trim.end": [key(i * 45, 0.1 if i % 2 == 0 else 0.65, "sineInOut") for i in range(20)]})
    shape(LY[3], d0, D, 280, 280, [pth("star", fill=YELLOW, stroke=stk(6, INK), primitive={"kind": "star", "points": 5, "inner": 50, "outer": 125, "roundness": 0})],
          x=xs[0], y=ys[1], name="Star", kf={"paths.star.primitive.inner": [key(i * 60, 50 if i % 2 == 0 else 105, "sineInOut") for i in range(15)],
                                              "paths.star.primitive.roundness": [key(i * 90, 0 if i % 2 == 0 else 0.5, "sineInOut") for i in range(10)]})
    shape(LY[4], d0, D, 280, 280, [pth("hex", fill=lin(135, (0, PINK), (1, VIOLET)), primitive={"kind": "polygon", "sides": 6, "radius": 120, "roundness": 0})],
          x=xs[1], y=ys[1], name="Polygon", kf={"paths.hex.primitive.roundness": [key(i * 75, 0 if i % 2 == 0 else 1, "cubicInOut") for i in range(12)],
                                                 "transform.rotation": [key(0, 0), key(D, 180)]})
    shape(LY[5], d0, D, 300, 160, [pth("arrow", fill=CORAL, primitive={"kind": "arrow", "length": 240, "shaft": 34, "head": 96, "headLength": 80})],
          x=xs[2], y=ys[1], name="Arrow", kf={"paths.arrow.primitive.length": [key(i * 60, 120 if i % 2 == 0 else 250, "backOut") for i in range(15)]})
    shape(LY[6], d0, D, 240, 240, [pth("ring", stroke=stk(12, TEAL, cap="butt", dash=[34, 18]), primitive={"kind": "ellipse", "w": 210, "h": 210})],
          x=xs[0], y=ys[2], name="Dashed ring", kf={"paths.ring.stroke.dashOffset": [key(0, 0), key(D, 900)]})
    star_d = "M150 20 L238 280 L10 115 L290 115 L62 280 Z"
    shape(LY[7], d0, D, 620, 300, [pth("nz", star_d, fill=PINK, rule="nonzero"),
                                   pth("eo", "M470 20 L558 280 L330 115 L610 115 L382 280 Z", fill=PINK, rule="evenodd")],
          x=165, y=ys[2], s=0.85, name="Fill rules")
    icons = svg_paths()
    for i, (nm, xx) in enumerate((("Check", -360), ("Badge", -120), ("Gauge", 120), ("Arrow", 360))):
        size, paths = icons[nm]
        base = 150 / max(size["w"], size["h"])
        shape(LY[8 + i], t0 + 40 + i * 10, SEC - 40 - i * 10, size["w"], size["h"], paths, x=xx, y=420, s=base, name=f"SVG {nm}",
              kf={"transform.scale": [key(0, base * 0.2, "backOut"), key(18, base, "sineInOut"), key(300, base * 1.35, "sineInOut"), key(500, base)]})
    for i, (x, y, s) in enumerate(((xs[0], ys[0] + 150, "trim path draw-on"), (xs[1], ys[0] + 150, "primitive arc: end keyed"), (xs[2], ys[0] + 150, "trim offset spin"),
                                   (xs[0], ys[1] + 155, "star: inner + roundness"), (xs[1], ys[1] + 155, "polygon roundness"), (xs[2], ys[1] + 155, "arrow length, backOut"),
                                   (xs[0], ys[2] + 150, "dash offset"), (165, ys[2] + 150, "nonzero · evenodd"))):
        label(LY[12 + i], t0 + 30, SEC - 30, s, x=x, y=y, size=24, font="JetBrains Mono", weight=500)
    label(LY[20], t0 + 60, SEC - 60, "SVG icons imported as shapes: sharp at any scale", y=530, size=28)
    narrate(t0 + 20, [("Vector shapes stay sharp at any size. Trim paths draw strokes on, primitives animate their parameters, and SVG files import as editable shapes.",
                       CAP_VARIANTS[5])], "Microsoft David Desktop", 0, f"s{n:02d}")


def spans_of(value, pairs):
    out = []
    for word, style in pairs:
        s = value.index(word)
        out.append({"start": s, "end": s + len(word), "style": style})
    return sorted(out, key=lambda sp: sp["start"])


def s_spans(t0, n):
    header(t0, SEC, n, 22, "Styled spans", "Batch 67 · color, weight, italic, underline, strike, highlight and font per word, in one text clip")
    solid(BG, t0, SEC, lin(160, (0, hexc("2B1650")), (1, hexc("0D0F22"))), 1080, 1920, name="Background")
    lines = [
        ("SAVE 3 HOURS A WEEK", [("3 HOURS", {"fill": CORAL, "fontWeight": 900, "underline": True})], "wordPop", "color + weight + underline"),
        ("Make it bold, italic or underlined", [("bold", {"fontWeight": 900, "fill": YELLOW}), ("italic", {"italic": True, "fontFamily": "Playfair Display", "fontWeight": 700}),
                                                ("underlined", {"underline": True, "fill": TEAL})], "wordFade", "bold · italic in another font · underline"),
        ("Was $99, now only $49", [("$99", {"strike": True, "fill": GREY}), ("$49", {"highlight": YELLOW, "fill": INK, "fontWeight": 900})], "slideUp", "strike · highlight box"),
        ("Mix fonts in one line", [("fonts", {"fontFamily": "Permanent Marker", "fontWeight": 400, "fill": PINK})], "pop", "a font per span"),
        ("Gradient words shine", [("Gradient", {"fill": lin(90, (0, YELLOW), (0.5, CORAL), (1, VIOLET))})], "blurIn", "gradient fill per span"),
    ]
    for i, (value, pairs, a, what) in enumerate(lines):
        y = -540 + i * 210
        text(LY[i], t0 + 20 + i * 70, SEC - 20 - i * 70, value, text_style("Montserrat", 58, 800, fill=WHITE, shadow=(0, 4, 12, rgba(0, 0, 0, 0.5))), y=y,
             ain=anim(a, 20 if a.startswith("word") else 12), aout=anim("fade", 8), spans=spans_of(value, pairs), name=f"Spans {i + 1}")
        label(LY[5 + i], t0 + 40 + i * 70, SEC - 40 - i * 70, what, y=y + 75, size=24, font="JetBrains Mono", weight=500, fill=rgba(1, 1, 1, 0.6))
    narrate(t0 + 20, [("One text clip can now mix colors, weights, italics, underlines, strike throughs and highlights, word by word.",
                       CAP_VARIANTS[6])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def s_counters(t0, n):
    header(t0, SEC, n, 22, "Counters and range selectors", "Batch 68 · counters with decimals, prefix, suffix and separators; animators per character, word or line")
    cover(BG, t0, SEC, CITY, op=0.6)
    solid(LY[0], t0, SEC, rgba(0.02, 0.03, 0.08, 0.5), 1080, 1920, name="Dim")
    big = text_style("Anton", 190, 400, fill=YELLOW, shadow=(0, 8, 24, rgba(0, 0, 0, 0.6)))
    text(LY[1], t0 + 10, SEC - 10, "1,000,000", big, y=-480, ain=anim("pop", 10), name="Counter 1,000,000",
         counter={"from": 0, "to": 1000000, "decimals": 0, "prefix": "", "suffix": "", "separator": ",", "ease": "expoOut"},
         kf={"text.counter.value": [key(0, 0, "expoOut"), key(240, 1000000)]})
    label(LY[2], t0 + 20, SEC - 20, "views  ·  separator \",\"  ·  expoOut", y=-350, size=28)
    text(LY[3], t0 + 60, SEC - 60, "85.6%", text_style("Anton", 150, 400, fill=TEAL, shadow=(0, 8, 24, rgba(0, 0, 0, 0.6))), x=-240, y=-140, name="Counter 85.6%",
         counter={"from": 0, "to": 85.6, "decimals": 1, "prefix": "", "suffix": "%", "separator": "", "ease": "quartOut"},
         kf={"text.counter.value": [key(0, 0, "quartOut"), key(200, 85.6)]}, ain=anim("pop", 10))
    text(LY[4], t0 + 110, SEC - 110, "$12.5K", text_style("Anton", 150, 400, fill=CORAL, shadow=(0, 8, 24, rgba(0, 0, 0, 0.6))), x=240, y=-140, name="Counter $12.5K",
         counter={"from": 0, "to": 12.5, "decimals": 1, "prefix": "$", "suffix": "K", "separator": "", "ease": "cubicOut"},
         kf={"text.counter.value": [key(0, 0, "cubicOut"), key(200, 12.5)]}, ain=anim("pop", 10))
    label(LY[5], t0 + 70, SEC - 70, "1 decimal + suffix", x=-240, y=-30, size=24)
    label(LY[6], t0 + 120, SEC - 120, "prefix + suffix", x=240, y=-30, size=24)
    off = [k for c in range(9) for k in (key(c * 95, -0.3, "sineInOut"), key(c * 95 + 80, 1.05, "hold"))]
    text(LY[7], t0 + 30, SEC - 30, "RANGE SELECTORS", text_style("Archivo Black", 76, 400, fill=WHITE), y=170, name="Wave animator",
         animators=[{"id": "wave", "unit": "char", "selector": {"start": 0, "end": 0.25, "offset": -0.3, "shape": "triangle", "ease": 0, "order": "forward", "seed": 1},
                     "props": {"y": -50, "scale": 1.35, "fill": YELLOW}}], kf={"animators.wave.selector.offset": off})
    label(LY[8], t0 + 40, SEC - 40, "triangle selector, offset keyed: y, scale, fill", y=260, size=24, font="JetBrains Mono", weight=500)
    # A square selector weighs every unit past `start` fully (units past `end` too), so keying `start` from
    # before the first unit to past the last one reveals the characters in the random order.
    flick = [k for c in range(7) for k in (key(c * 120, -0.05), key(c * 120 + 60, 1.05, "hold"))]
    text(LY[9], t0 + 60, SEC - 60, "random order, by character", text_style("Montserrat", 56, 800, fill=PINK), y=380, name="Random animator",
         animators=[{"id": "rnd", "unit": "char", "selector": {"start": -0.05, "end": 1.1, "offset": 0, "shape": "square", "ease": 0, "order": "random", "seed": 7},
                     "props": {"opacity": 0, "blur": 8, "y": 20}}], kf={"animators.rnd.selector.start": flick})
    label(LY[10], t0 + 70, SEC - 70, "random order (seed 7): opacity, blur, y", y=465, size=24, font="JetBrains Mono", weight=500)
    narrate(t0 + 20, [("Numbers count up on their own, with decimals, prefixes and separators, while range selectors move every character.",
                       CAP_VARIANTS[0])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_presets(t0, n):
    header(t0, SEC, n, 22, "Text animation presets", "Batch 68 · typeOn, decode, tumbleIn, cascadeUp, riseByLine, popInByChar, blurInByChar, fadeInByChar, highlightSweep")
    cover(BG, t0, SEC, CLOUDS, op=0.8)
    solid(LY[0], t0, SEC, rgba(0.03, 0.04, 0.1, 0.45), 1080, 1920, name="Dim")
    items = [("typeOn", "TYPE ON", {}), ("decode", "DECODE", {}), ("tumbleIn", "TUMBLE IN", {}), ("cascadeUp", "CASCADE UP", {}),
             ("riseByLine", "RISE\nBY LINE", {}), ("popInByChar", "POP IN", {}), ("blurInByChar", "BLUR IN", {}), ("fadeInByChar", "FADE IN", {}),
             ("highlightSweep", "highlight sweep", {"sweep": True})]
    step = 96
    for i, (aid, sample, opt) in enumerate(items):
        s = t0 + 30 + i * step
        if opt.get("sweep"):
            st = text_style("Montserrat", 96, 900, fill=INK, bg=(YELLOW, 18, 6, 10, "word"))
        else:
            st = text_style("Anton", 150, 400, fill=WHITE, shadow=(0, 8, 24, rgba(0, 0, 0, 0.55)), line_height=1.0)
        text(LY[1 + i % 2], s, step, sample, st, y=-140, ain=anim(aid, 40), aout=anim("fade", 8), name=f"Preset {aid}")
        chip(LY[3], s, step, f"animIn: {aid}", y=-430, color=TEAL, size=34, fill=INK)
    label(LY[4], t0 + 30, SEC - 30, "typeOn · decode · tumbleIn · cascadeUp · riseByLine\npopInByChar · blurInByChar · fadeInByChar · highlightSweep",
          y=330, size=28, fill=rgba(1, 1, 1, 0.75), font="JetBrains Mono", weight=500)
    narrate(t0 + 20, [("Nine new text presets animate by character, word or line: type on, decode, tumble, cascade and more.",
                       CAP_VARIANTS[1])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def s_rig(t0, n):
    header(t0, SEC, n, 22, "Parenting, nulls and motion paths", "Batch 69 · parentId chains, invisible null controllers, curved position keys with auto-orient")
    cover(BG, t0, SEC, PARTICLES, op=0.35)
    sy = -320
    shape(LY[0], t0 + 10, SEC - 10, 640, 640, [pth("o1", stroke=stk(3, rgba(1, 1, 1, 0.3), cap="butt", dash=[10, 10]), primitive={"kind": "ellipse", "w": 560, "h": 560}),
                                               pth("o2", stroke=stk(3, rgba(1, 1, 1, 0.3), cap="butt", dash=[10, 10]), primitive={"kind": "ellipse", "w": 340, "h": 340})],
          y=sy, name="Orbits")
    sun = solid(LY[1], t0 + 10, SEC - 10, YELLOW, 150, 150, shape="ellipse", y=sy, name="Sun")
    patch(sun, effects=[fx("glow", "glow", mode="outer", radius=70, intensity=1.4, threshold=0, color=L(hexc("FF9A3D")))])
    rig = null(LY[2], t0, SEC, y=sy, name="Orbit rig (null)", kf={"transform.rotation": [key(0, 0), key(SEC, 360)]})
    rig2 = null(LY[3], t0, SEC, y=sy, name="Inner rig (null)", kf={"transform.rotation": [key(0, 0), key(SEC, -720)]})
    planet = solid(LY[4], t0, SEC, BLUE, 74, 74, shape="ellipse", x=280, y=0, name="Planet", parentId=rig,
                   kf={"transform.rotation": [key(0, 0), key(SEC, 1800)]})
    solid(LY[5], t0, SEC, WHITE, 26, 26, shape="ellipse", x=72, y=0, name="Moon", parentId=planet)
    solid(LY[6], t0, SEC, CORAL, 50, 50, shape="ellipse", x=170, y=0, name="Inner planet", parentId=rig2)
    pts = [([-470, 440], None, [160, -220]), ([-140, 170], [-160, 0], [160, 0]), ([150, 460], [-150, 0], [150, 0]), ([470, 160], [-120, 160], None)]
    keys = []
    for cyc, base in enumerate((0, 450)):
        for j, (p, si, so) in enumerate(pts):
            extra = {}
            if si:
                extra["spatialIn"] = si
            if so:
                extra["spatialOut"] = so
            keys.append(key(base + 30 + j * 120, p, "sineInOut" if j == 0 else "linear", **extra))
    shape(LY[7], t0 + 10, SEC - 10, 140, 90, [pth("plane", "M0 0 L140 45 L0 90 L30 45 Z", fill=WHITE, stroke=stk(3, INK))], name="Paper plane",
          autoOrient=True, kf={"transform.position": keys})
    label(LY[8], t0 + 40, SEC - 40, "null rig turns: planets follow, the moon follows its planet", y=40, size=26)
    label(LY[9], t0 + 60, SEC - 60, "motion path with tangents + auto-orient", y=560, size=26)
    narrate(t0 + 20, [("Parenting links layers together. A null controller spins this little solar system, and the plane follows a curved motion path, turning with it.",
                       CAP_VARIANTS[2])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_depth(t0, n):
    header(t0, SEC, n, 22, "2.5D layers", "Batch 70 · rotationX, rotationY and z with perspective, back faces, depth sorting inside compounds")
    solid(BG, t0, SEC, rad((0, hexc("1F2A55")), (1, hexc("05060C")), cy=0.4, radius=1.1), 1080, 1920, name="Background")
    photos = [PH[k] for k in ("earth", "earthrise", "saturn", "jupiter", "pillars", "aldrin")]
    if "deck" not in P.sequences:
        P.sequence("deck", "Deck (depth sorted)", 1080, 1200, 420, bg=None, depth_sort=True)
        for i, mid in enumerate(photos):
            tr = P.strack("deck", "video", f"card {i + 1}")
            x, y = (-330, 0, 330)[i % 3], (-260, 260)[i // 3]
            d = i * 8
            kf = {"transform.z": [key(d, 2400, "cubicOut"), key(d + 50, 0)],
                  "transform.rotationY": [key(d, 200, "cubicOut"), key(d + 50, 0, "sineInOut"), key(d + 150, 16, "sineInOut"), key(d + 260, -16, "sineInOut"), key(d + 360, 0)],
                  "transform.rotationX": [key(d, -60, "cubicOut"), key(d + 50, 0)]}
            card_image(tr, 0, 420, mid, 300, 420, radius=24, stroke={"width": 6, "color": WHITE, "align": "inside"}, name=f"Deck card {i + 1}",
                       t=T(x, y, rx=-60, ry=200, z=2400), kf=kf, backfaceHidden=True)
    compound(LY[0], t0, 420, "deck", y=-80, name="Deck", fd=fades(0, 10))
    label(LY[1], t0 + 60, 360, "rotationY + rotationX + z keys · back faces hidden · depth sorted", y=560, size=26)
    if "carousel" not in P.sequences:
        P.sequence("carousel", "Carousel (depth sorted)", 1080, 900, 480, bg=None, depth_sort=True)
        R = 360
        for i, mid in enumerate(photos):
            tr = P.strack("carousel", "video", f"slot {i + 1}")
            xs, zs, rs = [], [], []
            for f in range(0, 481, 8):
                th = i * 60 + f * 0.75
                a = math.radians(th)
                xs.append(key(f, R * math.sin(a)))
                zs.append(key(f, R * (1 - math.cos(a))))
                rs.append(key(f, th))
            card_image(tr, 0, 480, mid, 280, 380, radius=22, stroke={"width": 5, "color": WHITE, "align": "inside"}, name=f"Carousel card {i + 1}",
                       t=T(0, 0, ry=i * 60), kf={"transform.x": xs, "transform.z": zs, "transform.rotationY": rs})
    compound(LY[0], t0 + 420, 480, "carousel", y=-180, name="Carousel", fd=fades(10, 0))
    tile(LY[2], t0 + 420, 480, OCEAN, 1000, 0, 380, name="Video floor", t=T(0, 400, s=1000 / 1280, rx=72), fd=fades(10, 0))
    label(LY[3], t0 + 440, 460, "carousel: x, z and rotationY per card", y=-560, size=26)
    label(LY[4], t0 + 450, 450, "video floor: rotationX 72°, perspective 1600", y=560, size=26)
    narrate(t0 + 20, [("Layers can turn in three dimensions with real perspective. Cards fly in from the distance, and spin on a carousel sorted by depth.",
                       CAP_VARIANTS[3])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def s_transitions(t0, n):
    header(t0, SEC, n, 22, "Transitions v2", "Batch 71 · slide, push, wipe, iris, zoom, whip, blur dissolve, glitch, flash; direction, angle, softness, ease")
    kinds = [("slide", {"direction": "left", "ease": "easeInOut"}), ("push", {"direction": "up", "ease": "easeInOut"}),
             ("wipe", {"angle": 45, "softness": 0.25, "ease": "easeInOut"}), ("iris", {"center": {"x": 0.5, "y": 0.45}, "softness": 0.15, "ease": "easeInOut"}),
             ("zoomIn", {"ease": "easeInOut"}), ("zoomOut", {"ease": "easeInOut"}), ("whip", {"direction": "right", "ease": "easeInOut"}),
             ("blurDissolve", {}), ("glitch", {}), ("flash", {}), ("crossDissolve", {}), ("dipToBlack", {}), ("dipToWhite", {})]
    media = [OCEAN, STREET, CITY, FOREST, SNOW, FLOWERS, TRAIN, WATERFALL, ROCKET, CLOUDS, WATERFALL2, VOLCANO, LIGHTNING, SNOW2]
    seg = 64
    ids = [vid(BG, t0 + 2 + i * seg, seg, m, src_in=1.0, name=f"Shot {i + 1}") for i, m in enumerate(media)]
    for i, (k, extra) in enumerate(kinds):
        P.transition(ids[i], ids[i + 1], k, 10, 10)
        P.clips[ids[i]]["transitionOut"].update(extra)
        P.clips[ids[i + 1]]["transitionIn"].update(extra)
        cut = t0 + 2 + (i + 1) * seg
        desc = k + (f" · {extra['direction']}" if "direction" in extra else "") + (f" · {extra['angle']}° soft" if "angle" in extra else "")
        chip(LY[0], cut - 30, 58, desc, y=-560, color=YELLOW, size=40)
    narrate(t0 + 20, [("Thirteen transitions, from slide and push to iris, whip, glitch and flash, each with its own direction and easing.",
                       CAP_VARIANTS[4])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_blend(t0, n):
    header(t0, SEC, n, 22, "Blend modes and track mattes", "Batch 72 · 13 blend modes; alpha and luma mattes, inverted or not, matte-only sources")
    A = 450
    cover(BG, t0, A, FLOWERS)
    modes = ["darken", "multiply", "colorBurn", "lighten", "screen", "colorDodge", "add", "overlay", "softLight", "hardLight", "difference", "exclusion"]
    grad = lin(0, (0, CORAL), (0.5, YELLOW), (1, BLUE))
    for i, m in enumerate(modes):
        x, y = (-340, 0, 340)[i % 3], -560 + (i // 3) * 270
        solid(LY[i], t0 + 10 + i * 4, A - 10 - i * 4, grad, 300, 190, shape="roundedRect", radius=18, x=x, y=y, name=f"Blend {m}", blend=m,
              kf={"transform.scale": [key(0, 0.3, "backOut"), key(14, 1)]})
        chip(LY[12 + i], t0 + 20 + i * 4, A - 20 - i * 4, m, x=x, y=y + 122, color=rgba(0.09, 0.09, 0.14, 0.85), size=24, fill=WHITE)
    bg_solid(t0 + A, SEC - A, hexc("0B0C14"))
    title = text(LY[0], t0 + A, SEC - A, "MATTE", text_style("Anton", 380, 400, fill=WHITE), y=-330, name="Matte title", matteOnly=True, ain=anim("pop", 12))
    cover(LY[1], t0 + A, SEC - A, WATERFALL, name="Video inside the title", matte={"clipId": title, "mode": "alpha"})
    ramp = solid(LY[2], t0 + A, SEC - A, rad((0, WHITE), (0.55, hexc("808080")), (1, hexc("000000"))), 900, 480, y=250, name="Luma matte source", matteOnly=True)
    tile(LY[3], t0 + A, SEC - A, FOREST, 900, 0, 250, name="Video through a luma matte", matte={"clipId": ramp, "mode": "luma"})
    cover(LY[4], t0 + A, SEC - A, LEAK, name="Light leak (screen)", blend="screen", op=0.85)
    label(LY[5], t0 + A + 20, SEC - A - 20, "alpha matte: the video shows inside the text", y=-90, size=28)
    label(LY[6], t0 + A + 20, SEC - A - 20, "luma matte: a radial gradient", y=540, size=28)
    chip(LY[7], t0 + A + 20, SEC - A - 20, "light leak: screen blend over everything below", y=-620, color=YELLOW, size=28)
    narrate(t0 + 20, [("Thirteen blend modes mix a layer with what is under it, and track mattes show video through text or through brightness.",
                       CAP_VARIANTS[5])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def star_points(cx, cy, outer, inner, k=10):
    return [(cx + (outer if i % 2 == 0 else inner) * math.sin(math.radians(i * 360 / k)), cy - (outer if i % 2 == 0 else inner) * math.cos(math.radians(i * 360 / k)))
            for i in range(k)]


def square_points(cx, cy, half, k=10):
    out = []
    for i in range(k):
        a = math.radians(i * 360 / k)
        dx, dy = math.sin(a), -math.cos(a)
        m = half / max(abs(dx), abs(dy))
        out.append((cx + dx * m, cy + dy * m))
    return out


def poly_d(pts):
    return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z"


def s_masks(t0, n):
    header(t0, SEC, n, 22, "Masks", "Batch 73 · rectangles, ellipses and paths: add, subtract, intersect, invert, feather, expansion, path morphs")
    A = 450
    cover(BG, t0, A, STREET, op=0.22)
    wander = [(560, 200), (740, 420), (600, 560), (780, 220), (500, 440), (690, 330), (560, 170), (760, 500), (620, 300)]
    cover(LY[0], t0, A, STREET, name="Spotlight", masks=[mask("spot", "ellipse", x=wander[0][0] - 95, y=wander[0][1] - 95, w=190, h=190, feather=30)],
          kf={"masks.spot.x": [key(i * 55, p[0] - 95, "sineInOut") for i, p in enumerate(wander)],
              "masks.spot.y": [key(i * 55, p[1] - 95, "sineInOut") for i, p in enumerate(wander)]})
    label(LY[1], t0 + 20, A - 20, "feathered ellipse mask, x and y keyed", y=560, size=28)
    bg_solid(t0 + A, SEC - A, hexc("111320"))
    s0, D = t0 + A + 10, SEC - A - 10
    pos = [(-250, -430), (250, -430), (-250, 60), (250, 60)]
    sizes = [60 if i % 2 == 0 else 220 for i in range(7)]
    solid(LY[0], s0, D, CORAL, 440, 440, x=pos[0][0], y=pos[0][1], name="Add + subtract",
          masks=[mask("disc", "ellipse", 20, 20, 400, 400), mask("hole", "rect", 150, 150, 140, 140, mode="subtract", radius=24)],
          kf={"masks.hole.w": [key(i * 70, s, "sineInOut") for i, s in enumerate(sizes)], "masks.hole.h": [key(i * 70, s, "sineInOut") for i, s in enumerate(sizes)],
              "masks.hole.x": [key(i * 70, 220 - s / 2, "sineInOut") for i, s in enumerate(sizes)], "masks.hole.y": [key(i * 70, 220 - s / 2, "sineInOut") for i, s in enumerate(sizes)]})
    solid(LY[1], s0, D, lin(135, (0, TEAL), (1, BLUE)), 440, 440, x=pos[1][0], y=pos[1][1], name="Intersect",
          masks=[mask("a", "ellipse", 40, 90, 260, 260), mask("b", "ellipse", 140, 90, 260, 260, mode="intersect")],
          kf={"masks.b.x": [key(i * 70, (140, 40, 240)[i % 3], "sineInOut") for i in range(7)]})
    solid(LY[2], s0, D, YELLOW, 440, 440, x=pos[2][0], y=pos[2][1], name="Inverted",
          masks=[mask("star", "path", d=poly_d(star_points(220, 225, 190, 80)), inverted=True, feather=2)], kf={"transform.rotation": [key(0, 0), key(D, 72)]})
    sq, st = square_points(220, 220, 170), star_points(220, 230, 200, 85)
    morph = [key(i * 70, [c for p in (sq if i % 2 == 0 else st) for c in p], "cubicInOut") for i in range(7)]
    solid(LY[3], s0, D, lin(45, (0, PINK), (1, VIOLET)), 440, 440, x=pos[3][0], y=pos[3][1], name="Path morph",
          masks=[mask("m", "path", d=poly_d(sq))], kf={"masks.m.path": morph})
    for i, s in enumerate(("add + subtract (hole keyed)", "intersect (second ellipse keyed)", "inverted path", "path morph: square to star")):
        label(LY[4 + i], s0 + 10, D - 10, s, x=pos[i][0], y=pos[i][1] + 255, size=24, font="JetBrains Mono", weight=500)
    text(LY[8], s0 + 20, D - 20, "REVEAL", text_style("Anton", 190, 400, fill=WHITE), y=440, name="Reveal",
         masks=[mask("wipe", "rect", 0, -200, 0, 800, feather=30)], kf={"masks.wipe.w": [key(0, 0, "cubicOut"), key(60, 1600)]})
    narrate(t0 + 20, [("Masks cut any layer to a shape: feathered ellipses, holes, intersections, inverted shapes and paths that morph.",
                       CAP_VARIANTS[6])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_fx1(t0, n):
    header(t0, SEC, n, 22, "Effects I", "Batch 74 · effect stacks: gaussian and directional blur, glow, drop shadow, outline; every number keyable")
    solid(BG, t0, SEC, lin(170, (0, hexc("1B2340")), (1, hexc("0A0B12"))), 1080, 1920, name="Background")
    pos = [(-250, -500), (250, -500), (-250, -160), (250, -160), (-250, 180), (250, 180)]
    s0, D = t0 + 10, SEC - 10
    c1 = card_image(LY[0], s0, D, PH["pillars"], 440, 280, x=pos[0][0], y=pos[0][1], radius=18, name="Gaussian blur")
    patch(c1, effects=[fx("blur", "gaussianBlur", radius=0, repeatEdges=1)], keyframes={"effects.blur.radius": [key(i * 75, 0 if i % 2 == 0 else 220, "sineInOut") for i in range(12)]})
    tile(LY[1], s0, D, TRAIN, 440, *pos[1], name="Directional blur", effects=[fx("streak", "directionalBlur", length=0, angle=0)],
         kf={"effects.streak.length": [key(i * 75, 0 if i % 2 == 0 else 160, "sineInOut") for i in range(12)]})
    text(LY[2], s0, D, "GLOW", text_style("Anton", 150, 400, fill=hexc("D9FBFF")), x=pos[2][0], y=pos[2][1], name="Glow",
         effects=[fx("glow", "glow", mode="outer", radius=40, intensity=1, threshold=0, color=L(TEAL))],
         kf={"effects.glow.intensity": [key(i * 60, 0.2 if i % 2 == 0 else 2.2, "sineInOut") for i in range(15)]})
    c4 = P.image(LY[3], s0, D, SMILEY, scale=0.9, x=pos[3][0], y=pos[3][1], name="Drop shadow")
    patch(c4, effects=[fx("shadow", "dropShadow", color=[0, 0, 0, 0.6], angle=45, distance=30, blur=14)], keyframes={"effects.shadow.angle": [key(0, 0), key(D, 720)]})
    text(LY[4], s0, D, "OUTLINE", text_style("Archivo Black", 96, 400, fill=CORAL), x=pos[4][0], y=pos[4][1], name="Outline",
         effects=[fx("line", "outline", width=8, color=L(WHITE))], kf={"effects.line.width": [key(i * 60, 2 if i % 2 == 0 else 16, "sineInOut") for i in range(15)]})
    c6 = P.image(LY[5], s0, D, FIRE, scale=0.95, x=pos[5][0], y=pos[5][1], name="Outline then shadow")
    patch(c6, effects=[fx("o", "outline", width=6, color=L(YELLOW)), fx("s", "dropShadow", color=L(rgba(1, 0.2, 0.4, 0.85)), angle=60, distance=24, blur=0)])
    for i, s in enumerate(("gaussianBlur: radius keyed", "directionalBlur: length keyed", "glow: intensity keyed", "dropShadow: angle keyed",
                           "outline: width keyed", "stack: outline, then drop shadow")):
        label(LY[6 + i], s0 + 10, D - 10, s, x=pos[i][0], y=pos[i][1] + 165, size=24, font="JetBrains Mono", weight=500)
    narrate(t0 + 20, [("Effects stack on any clip: gaussian and directional blur, glow, drop shadow and outline, all of them keyable.",
                       CAP_VARIANTS[0])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def s_fx2(t0, n):
    header(t0, SEC, n, 22, "Effects II", "Batch 75 · color adjust, vignette, sharpen, grain, chroma key, luma key, 3D LUTs (.cube)")
    bg_solid(t0, SEC, hexc("0F1018"))
    W = 440
    pos = [(-250, -520), (250, -520), (-250, -210), (250, -210), (-250, 100), (250, 100)]
    s0, D = t0 + 10, SEC - 10
    tile(LY[0], s0, D, SNOW, W, *pos[0], name="Temperature", effects=[fx("grade", "colorAdjust", temperature=-100)],
         kf={"effects.grade.temperature": [key(i * 90, -100 if i % 2 == 0 else 100, "sineInOut") for i in range(10)]})
    tile(LY[1], s0, D, VOLCANO, W, *pos[1], name="Saturation", effects=[fx("sat", "colorAdjust", saturation=-100, vibrance=40)],
         kf={"effects.sat.saturation": [key(i * 90, -100 if i % 2 == 0 else 80, "sineInOut") for i in range(10)]})
    tile(LY[2], s0, D, FOREST, W, *pos[2], name="Vignette", effects=[fx("vig", "vignette", amount=0.85, radius=0.75, softness=0.6)])
    tile(LY[3], s0, D, STREET, W, *pos[3], name="Sharpen + grain", effects=[fx("sh", "sharpen", amount=1.5, radius=1.5), fx("gr", "grain", amount=0.35, size=2, animated=1)])
    tile(LY[4], s0, D, OCEAN, W, *pos[4], name="Behind the green screen")
    tile(LY[5], s0, D, green_screen(), W, *pos[4], name="Green screen (keyed)",
         effects=[fx("key", "chromaKey", color=[0, 0.694, 0.251, 1], tolerance=0.18, softness=0.12, spill=0.6)])
    tile(LY[6], s0, D, CITY, W, *pos[5], name="Behind the luma key")
    tile(LY[7], s0, D, LIGHTNING, W, *pos[5], name="Lightning (luma keyed)", effects=[fx("lk", "lumaKey", threshold=0.25, softness=0.15, invert=0)])
    lut = lut_file()
    tile(LY[8], s0, D, CLOUDS, 560, 0, 440, name="LUT", effects=[fx("look", "lut", file=lut, intensity=0)],
         kf={"effects.look.intensity": [key(i * 90, 0 if i % 2 == 0 else 1, "sineInOut") for i in range(10)]})
    for i, s in enumerate(("colorAdjust: temperature keyed", "colorAdjust: saturation keyed", "vignette", "sharpen + animated grain",
                           "chromaKey with spill suppression", "lumaKey: the dark sky goes clear")):
        label(LY[9 + i], s0 + 10, D - 10, s, x=pos[i][0], y=pos[i][1] + 150, size=24, font="JetBrains Mono", weight=500)
    chip(LY[15], s0 + 10, D - 10, "LUT (teal-orange.cube): intensity keyed", y=300, color=YELLOW, size=26)
    narrate(t0 + 20, [("Color tools: exposure, temperature and saturation, vignette, sharpen, film grain, chroma and luma keys, and 3D LUTs.",
                       CAP_VARIANTS[1])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_fx3(t0, n):
    header(t0, SEC, n, 22, "Effects III and adjustment clips", "Batch 76 · RGB split, pixelate, mirror, wave, glitch, posterize, invert; adjustment layers")
    A = 450
    bg_solid(t0, A, hexc("12101C"))
    pos = [(-250, -500), (250, -500), (-250, -170), (250, -170), (-250, 160), (250, 160)]
    s0, D = t0 + 10, A - 10
    text(LY[0], s0, D, "RGB SPLIT", text_style("Archivo Black", 80, 400, fill=WHITE), x=pos[0][0], y=pos[0][1], name="RGB split",
         effects=[fx("rgb", "rgbSplit", distance=10, angle=0)], kf={"effects.rgb.distance": [key(i * 45, 0 if i % 2 == 0 else 22, "sineInOut") for i in range(10)]})
    c = card_image(LY[1], s0, D, PH["jupiter"], 440, 280, x=pos[1][0], y=pos[1][1], radius=18, name="Pixelate")
    patch(c, effects=[fx("px", "pixelate", size=160)], keyframes={"effects.px.size": [key(i * 80, 160 if i % 2 == 0 else 1, "cubicInOut") for i in range(6)]})
    tile(LY[2], s0, D, CLOUDS, 440, *pos[2], name="Mirror", effects=[fx("mir", "mirror", side="left", center=0.5)])
    text(LY[3], s0, D, "WAVE", text_style("Anton", 150, 400, fill=TEAL), x=pos[3][0], y=pos[3][1], name="Wave",
         effects=[fx("wv", "wave", amplitude=16, wavelength=140, direction="horizontal", speed=1)])
    text(LY[4], s0, D, "GLITCH", text_style("Anton", 150, 400, fill=PINK), x=pos[4][0], y=pos[4][1], name="Glitch",
         effects=[fx("gl", "glitch", amount=0.6, band=18, shift=50, split=10, rate=10, seed=3)])
    tile(LY[5], s0, D, VOLCANO, 440, *pos[5], name="Posterize + invert", effects=[fx("post", "posterize", levels=4), fx("inv", "invert", amount=0)],
         kf={"effects.inv.amount": [key(i * 60, 0 if i % 2 == 0 else 1, "hold") for i in range(8)]})
    for i, s in enumerate(("rgbSplit: distance keyed", "pixelate: size keyed", "mirror: left half", "wave: travels 1/s", "glitch: seed 3, 10/s",
                           "posterize 4 + invert (hold keys)")):
        label(LY[6 + i], s0 + 10, D - 10, s, x=pos[i][0], y=pos[i][1] + 165, size=24, font="JetBrains Mono", weight=500)
    cover(BG, t0 + A, SEC - A, FLOWERS)
    sweep = [k for c in range(4) for k in (key(c * 110, -540, "sineInOut"), key(c * 110 + 100, 1080, "hold"))]
    adjustment(LY[0], t0 + A, SEC - A, [fx("bw", "colorAdjust", saturation=-100, contrast=25)], name="Black and white (adjustment)",
               masks=[mask("sweep", "rect", -540, 0, 540, 1920, feather=40)], kf={"masks.sweep.x": sweep})
    for i in range(5):
        adjustment(LY[1], t0 + A + 40 + i * 80, 14, [fx("g", "glitch", amount=0.7, band=30, shift=140, split=16, rate=20, seed=i + 1),
                                                     fx("r", "rgbSplit", distance=18, angle=0)], name=f"Glitch hit {i + 1}")
    label(LY[2], t0 + A + 10, SEC - A - 10, "adjustment clip: black and white inside a moving mask", y=-600, size=28)
    label(LY[3], t0 + A + 10, SEC - A - 10, "short adjustment clips: glitch + RGB split hits", y=540, size=28)
    narrate(t0 + 20, [("Stylize with RGB split, pixelate, mirror, wave, glitch, posterize and invert. Adjustment clips apply effects to everything below them.",
                       CAP_VARIANTS[2])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def s_audio(t0, n):
    header(t0, SEC, n, 22, "Audio v2", "Batch 77 · track gain and pan, keyed clip pan, fade curves, beat markers, loudness target (LUFS)")
    solid(BG, t0, SEC, lin(180, (0, hexc("101A2E")), (1, hexc("06070C"))), 1080, 1920, name="Background")
    P.audio(MUSIC, t0, SEC, BEAT120, gain=-4, fades=(0, 30), name="Beat 120 BPM")
    for i in range(1, 60):
        P.marker(t0 + i * 15, "Beat", "teal")
    for k in range(4):
        keys = {0: key(0, 0.25)}
        for i in range(k, 60, 4):
            f = i * 15
            keys[f] = key(f, 1, "quadOut")
            keys[f + 12] = key(f + 12, 0.25)
        solid(LY[k], t0, SEC, CORAL if k == 0 else TEAL, 120, 120, shape="roundedRect", radius=20, x=-225 + k * 150, y=-520, op=0.25,
              kf={"opacity": [keys[f] for f in sorted(keys)]}, name=f"Beat {k + 1}")
    label(LY[4], t0 + 20, SEC - 20, "120 BPM: a teal Beat marker on every beat (Detect beats)", y=-410, size=26)
    solid(LY[5], t0 + 100, SEC - 100, rgba(1, 1, 1, 0.25), 680, 8, shape="roundedRect", radius=4, y=-250, name="Stereo bar")
    label(LY[6], t0 + 100, SEC - 100, "L", x=-390, y=-250, size=44, font="Bebas Neue", weight=400)
    label(LY[7], t0 + 100, SEC - 100, "R", x=390, y=-250, size=44, font="Bebas Neue", weight=400)
    pan = [key(c * 72, -1 if c % 2 == 0 else 1, "sineInOut") for c in range(5)]
    dot = [key(c * 72, -320 if c % 2 == 0 else 320, "sineInOut") for c in range(5)]
    ptone = tone("pan-tone", "0.3*sin(2*PI*330*t)*(0.65+0.35*sin(2*PI*6*t))", 12)
    pa = P.audio(PAN, t0 + 120, 300, ptone, gain=-6, fades=(10, 10), name="Panned tone")
    P.clips[pa]["volume"]["pan"] = -1
    patch(pa, keyframes={"volume.pan": pan})
    solid(LY[8], t0 + 120, 300, YELLOW, 44, 44, shape="ellipse", x=-320, y=-250, kf={"transform.x": dot}, name="Pan position")
    label(LY[9], t0 + 100, SEC - 100, "clip pan keyed L to R (volume.pan, equal power)", y=-170, size=26)
    chord = tone("chord", "0.18*sin(2*PI*261.63*t)+0.18*sin(2*PI*329.63*t)+0.18*sin(2*PI*392*t)", 4)
    curves = [("linear", lambda u: u), ("equalPower", lambda u: math.sin(u * math.pi / 2)), ("exponential", lambda u: (math.exp(5 * u) - 1) / (math.exp(5) - 1))]
    base = t0 + 480
    for i, (cv, fn) in enumerate(curves):
        s = t0 + 500 + i * 125
        a = P.audio(PAN, s, 110, chord, gain=-4, fades=(90, 10), name=f"Fade in, {cv}")
        P.clips[a]["fades"]["curve"] = cv
        d = "M" + " L".join(f"{u * 240:.1f} {160 - fn(u) * 160:.1f}" for u in [j / 40 for j in range(41)])
        x = (-330, 0, 330)[i]
        shape(LY[10 + i], base, SEC - 480, 240, 160, [pth("axis", "M0 0 L0 160 L240 160", stroke=stk(3, rgba(1, 1, 1, 0.3), cap="butt", join="miter")),
                                                      pth("curve", d, stroke=stk(7, YELLOW), trim={"start": 0, "end": 0, "offset": 0})],
              x=x, y=120, name=f"Curve {cv}", kf={"paths.curve.trim.end": [key(s - base, 0), key(s - base + 90, 1)]})
        label(LY[13 + i], base, SEC - 480, cv, x=x, y=245, size=28, font="JetBrains Mono", weight=600)
    label(LY[16], base, SEC - 480, "fade curves: three chords fade in", y=-20, size=26)
    st = text_style("Inter", 30, 600, fill=WHITE, bg=(rgba(0.09, 0.09, 0.14, 0.85), 26, 14, 16, "block"), line_height=1.35)
    text(LY[17], t0 + 60, SEC - 60, "Music track gain -3 dB  ·  SFX track pan +0.25\nExport loudness: -14 LUFS, true peak -1 dBTP", st, y=440,
         ain=anim("fade", 10), aout=anim("fade", 8), name="Mixer facts")
    narrate(t0 + 20, [("Audio got a mixer. Tracks have gain and pan, clips pan and can be keyed, fades take three curves, beats become markers, and exports hit minus 14 LUFS.",
                       CAP_VARIANTS[3])], "Microsoft David Desktop", 1, f"s{n:02d}")


def s_time(t0, n):
    header(t0, SEC, n, 22, "Time remap, reverse, frame blending", "Batch 78 · speed curves with eases, freezes, reverse playback, blended slow motion")
    bg_solid(t0, SEC, hexc("0D0E16"))
    W = 700
    sc = W / 1280
    ramp = [{"frame": 0, "sourceUs": 200000, "ease": "sineInOut"}, {"frame": 60, "sourceUs": 3200000, "ease": "sineInOut"},
            {"frame": 210, "sourceUs": 4400000, "ease": "sineInOut"}, {"frame": 300, "sourceUs": 7800000, "ease": "linear"}]
    for i in range(3):
        c = vid(LY[0], t0 + i * 300, 300, ROCKET, src_in=0.2, speed=0.76, scale=sc, y=-470, name=f"Hero ramp {i + 1}")
        patch(c, cornerRadius=18, timeRemap=[dict(k) for k in ramp])
    for i in range(4):
        c = vid(LY[1], t0 + i * 225, 225, WATERFALL, scale=sc, y=-60, name=f"Reversed {i + 1}")
        patch(c, cornerRadius=18, reverse=True)
    a = vid(LY[2], t0, SEC, TRAIN, speed=0.25, scale=340 / 1280, x=-180, y=330, name="25%, frame blending")
    patch(a, cornerRadius=14, frameBlend=True)
    b = vid(LY[3], t0, SEC, TRAIN, speed=0.25, scale=340 / 1280, x=180, y=330, name="25%, no blending")
    patch(b, cornerRadius=14)
    chip(LY[4], t0 + 20, SEC - 20, "time remap: fast, slow, fast (Hero)", y=-640, color=YELLOW, size=28)
    chip(LY[5], t0 + 20, SEC - 20, "reverse: the water runs up", y=-230, color=TEAL, size=28)
    chip(LY[6], t0 + 20, SEC - 20, "blend on", x=-180, y=205, color=PINK, size=26)
    chip(LY[7], t0 + 20, SEC - 20, "blend off", x=180, y=205, color=GREY, size=26)
    label(LY[8], t0 + 30, SEC - 30, "25% speed: frame blending mixes the two nearest source frames", y=470, size=24)
    narrate(t0 + 20, [("Time remapping ramps speed up and down, clips can play in reverse, and frame blending smooths slow motion.",
                       CAP_VARIANTS[4])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def lclip(tid, start, dur, mid, x, y, s, speed=1.0, loop=True, overrides=None, name=None):
    return add("lottie", tid, start, dur, name or P.media[mid]["name"], mediaId=mid, in_=0, out=int(round(dur * speed * P.us_per_frame)), speed=speed,
               transform=T(x, y, s), opacity=1, crop={"left": 0, "top": 0, "right": 0, "bottom": 0}, volume={"gainDb": 0, "muted": False},
               fades=fades(), loop=loop, colorOverrides=overrides)


def s_lottie(t0, n):
    header(t0, SEC, n, 22, "Lottie clips", "Batch 79 · bodymovin .json and .lottie files as vector clips: loop, speed, color overrides, sharp at any scale")
    solid(BG, t0, SEC, rad((0, hexc("2B2F4A")), (1, hexc("0B0C14")), radius=1.1), 1080, 1920, name="Background")
    spinner, bounce, pulse = lottie("spinner.json"), lottie("bounce.json"), lottie("pulse.lottie")
    fixture = json.load(open(os.path.join(FIX, "lottie", "project.json"), encoding="utf-8"))
    ov = {c["name"]: c["colorOverrides"] for c in fixture["clips"].values() if c.get("colorOverrides")}
    s0, D = t0 + 10, SEC - 10
    lclip(LY[0], s0, D, spinner, -250, -430, 1.3, name="Spinner, loop")
    lclip(LY[1], s0, D, spinner, 250, -430, 1.3, speed=2, overrides=ov["spinner-green"], name="Spinner, speed 2, recolored")
    lclip(LY[2], s0 + 20, D - 20, bounce, -250, -100, 1.2, name="Bounce, loop")
    lclip(LY[3], s0 + 20, D - 20, bounce, 250, -100, 1.2, overrides=ov["bounce-violet"], name="Bounce, recolored")
    lclip(LY[4], s0 + 40, D - 40, pulse, 0, 280, 3.0, name="Pulse (.lottie) at 300%")
    for i, (x, y, s) in enumerate(((-250, -270, "loop"), (250, -270, "speed 2 + colorOverrides"), (-250, 30, "loop"), (250, 30, "colorOverrides"),
                                   (0, 500, ".lottie archive at 300%: still sharp"))):
        label(LY[5 + i], s0 + 10, D - 10, s, x=x, y=y, size=26, font="JetBrains Mono", weight=500)
    narrate(t0 + 20, [("Lottie animations play as vector clips. They loop, change their colors, and stay crisp when scaled up three times.",
                       CAP_VARIANTS[5])], "Microsoft David Desktop", 0, f"s{n:02d}")


def s_templates(t0, n):
    header(t0, SEC, n, 22, "Templates", "Batch 80 · compound clips with parameters: text, color, number, media, font and toggle values per instance")
    solid(BG, t0, SEC, lin(160, (0, hexc("17304A")), (1, hexc("0A0D18"))), 1080, 1920, name="Background")
    sid = P.sequence("promo", "Promo card (template)", 700, 400, SEC, bg=None)
    tb, tp, tt, tx, tg, tgt = (P.strack(sid, "video", nm) for nm in ("bg", "photo", "title", "body", "badge", "badge text"))
    bgc = solid(tb, 0, SEC, VIOLET, 700, 400, shape="roundedRect", radius=36, name="Promo bg", t=T(-350, 0, ax=0, ay=0.5), stroke={"width": 4, "color": rgba(1, 1, 1, 0.6), "align": "inside"})
    ph = card_image(tp, 0, SEC, PH["earth"], 260, 260, x=-190, y=0, radius=130, stroke={"width": 5, "color": WHITE, "align": "inside"}, name="Promo photo")
    ti = text(tt, 0, SEC, "Weekly recap", text_style("Bebas Neue", 64, 400, fill=WHITE), x=120, y=-75, box={"mode": "fixed", "width": 340}, name="Promo title")
    bo = text(tx, 0, SEC, "Five things\nyou missed", text_style("Inter", 32, 600, fill=rgba(1, 1, 1, 0.85), line_height=1.15), x=120, y=55,
              box={"mode": "fixed", "width": 340}, name="Promo body")
    bd = solid(tg, 0, SEC, YELLOW, 96, 96, shape="ellipse", x=300, y=-150, name="Badge",
               kf={"transform.rotation": [key(0, -10, "sineInOut"), key(450, 10, "sineInOut"), key(SEC, -10)]})
    bt = text(tgt, 0, SEC, "NEW", text_style("Archivo Black", 30, 400, fill=INK), x=300, y=-150, name="Badge text")
    P.sequences[sid]["params"] = [
        {"id": "title", "label": "Title", "kind": "text", "targets": [{"clipId": ti, "path": "text.value"}], "default": "Weekly recap"},
        {"id": "body", "label": "Body", "kind": "text", "targets": [{"clipId": bo, "path": "text.value"}], "default": "Five things\nyou missed"},
        {"id": "accent", "label": "Accent color", "kind": "color", "targets": [{"clipId": bgc, "path": "fill"}], "default": VIOLET},
        {"id": "width", "label": "Card width", "kind": "number", "min": 640, "max": 700, "targets": [{"clipId": bgc, "path": "size.w"}], "default": 700},
        {"id": "photo", "label": "Photo", "kind": "media", "targets": [{"clipId": ph, "path": "mediaId"}], "default": PH["earth"]},
        {"id": "font", "label": "Title font", "kind": "font", "targets": [{"clipId": ti, "path": "style.fontFamily"}], "default": "Bebas Neue"},
        {"id": "badge", "label": "Show badge", "kind": "toggle", "targets": [{"clipId": bd, "path": "enabled"}, {"clipId": bt, "path": "enabled"}], "default": True},
    ]
    values = [{}, {"title": "Launch day", "body": "Rocket goes\nup at noon", "accent": CORAL, "photo": PH["earthrise"], "font": "Anton"},
              {"title": "Moon facts", "body": "Ten things\nabout Apollo", "accent": TEAL, "photo": PH["aldrin"], "badge": False, "width": 640},
              {"title": "Deep space", "body": "Pillars of\ncreation", "accent": BLUE, "photo": PH["pillars"], "font": "Permanent Marker"},
              {"title": "Your text here", "body": "npm run cli --\nfill <values.json>", "accent": PINK, "width": 660, "photo": PH["saturn"]}]
    places = [(-262, -450, 0.72), (262, -450, 0.72), (-262, -130, 0.72), (262, -130, 0.72), (0, 230, 0.8)]
    for i, (vals, (x, y, s)) in enumerate(zip(values, places)):
        st = 20 + i * 15
        compound(LY[i], t0 + st, SEC - st, sid, x=x, y=y, s=s, name=f"Promo {i + 1}", params=vals or None,
                 kf={"transform.scale": [key(0, s * 0.2, "backOut"), key(16, s)]})
    label(LY[5], t0 + 60, SEC - 60, "one template · five instances · their own values", y=450, size=28)
    label(LY[6], t0 + 70, SEC - 70, "params: text · text · color · number · media · font · toggle", y=515, size=24, font="JetBrains Mono", weight=500)
    narrate(t0 + 20, [("Templates are compound clips with parameters. One card design, five instances, each with its own text, color, width and picture.",
                       CAP_VARIANTS[6])], "Microsoft Zira Desktop", 0, f"s{n:02d}")


def outro(t0, dur):
    header(t0, dur, 0, 0, "Export v2", "Batch 81 · MP4, transparent WebM, PNG sequence, GIF, audio stems, collect and zip")
    cover(BG, t0, dur, CLOUDS2, op=0.75)
    solid(LY[0], t0, dur, rgba(0.03, 0.04, 0.1, 0.5), 1080, 1920, name="Dim")
    rows = ["MP4 · H.264, HEVC, AV1", "WebM · VP9 with transparency", "PNG sequence · RGBA frames", "GIF · palette and dithering",
            "Stems · one WAV per audio track", "Collect project · Zip"]
    for i, r in enumerate(rows):
        chip(LY[1 + i], t0 + 20 + i * 14, dur - 20 - i * 14, r, y=-560 + i * 110, color=[YELLOW, TEAL, CORAL, PINK, BLUE, GREEN][i], size=38)
    text(LY[8], t0 + 150, dur - 150, "THANKS FOR\nWATCHING", text_style("Anton", 130, 400, fill=WHITE, shadow=(0, 8, 24, rgba(0, 0, 0, 0.6)), line_height=1.0),
         y=280, ain=anim("tumbleIn", 30), aout=anim("fade", 10), name="Thanks")
    narrate(t0 + 20, [("Export to MP4, transparent WebM, GIF or a PNG sequence, write audio stems, or collect the whole project. Thanks for watching.",
                       CAP_VARIANTS[4])], "Microsoft Zira Desktop", 0, "outro")


def credits_md():
    used = {os.path.basename(src) for src in P.media_src.values()}
    rows, seen = [], set()
    for t in ("01-montage-marathon", "04-overlay-stack", "02-kinetic-typography"):
        p = os.path.join(TPL, t, "CREDITS.md")
        if not os.path.exists(p):
            continue
        for line in open(p, encoding="utf-8"):
            if line.startswith("| `"):
                name = line.split("`")[1]
                if name in used and name not in seen:
                    rows.append(line.rstrip("\n"))
                    seen.add(name)
    head = ["# Credits", "",
            "Media from outside sources, with their licenses. Everything else was made for these templates: the synthesized music and sounds, "
            "the motion graphics and stickers (and the alpha WebM files and PNG sequences made from them), the green screen clip, the LUT, "
            "the test tones and the text-to-speech narration (Windows SAPI voices). The Lottie animations and SVG icons are the editor's own "
            "CC0 fixtures (`fixtures/interop/lottie`, `fixtures/interop/svg`).", "",
            "| File | Source | Original | License | Author |", "| --- | --- | --- | --- | --- |"]
    return "\n".join(head + rows) + "\n"


def chapters_md(total):
    lines = ["# Chapters", "", f"Length: {total // 1800}:{(total // 30) % 60:02d} ({total} frames at 30 fps). Each chapter is a blue marker on the timeline.", "",
             "| Time | Frame | Chapter |", "| --- | --- | --- |"]
    for num, title, start in SECTIONS:
        s = start // 30
        lines.append(f"| {s // 60}:{s % 60:02d} | {start} | {f'{num:02d} ' if num else ''}{title} |")
    return "\n".join(lines) + "\n"


def build(out_root):
    t = 0
    intro(t, 300)
    t = 300
    order = [s_styles, s_eases, s_animate, s_captions, s_compound, s_alpha, s_vector, s_spans, s_counters, s_presets, s_rig, s_depth,
             s_transitions, s_blend, s_masks, s_fx1, s_fx2, s_fx3, s_audio, s_time, s_lottie, s_templates]
    assert len(order) == 22
    audio_at = None
    for i, fn in enumerate(order):
        if fn is s_audio:
            audio_at = t
        fn(t, i + 1)
        t += SEC
    outro(t, 450)
    total = t + 450
    solid(BAR, 0, total, CORAL, 1080, 10, name="Progress", t=T(-540, 955, ax=0, ay=0.5), kf={"size.w": [key(0, 1), key(total - 1, 1080)]})
    P.audio_fill(MUSIC, 0, audio_at, HOUSE, gain=-17, xfade=24, fades=(30, 30), name="House bed")
    P.audio_fill(MUSIC, audio_at + SEC, total - audio_at - SEC, HOUSE, gain=-17, xfade=24, fades=(30, 45), name="House bed")
    P.extra_files["CREDITS.md"] = credits_md()
    P.extra_files["CHAPTERS.md"] = chapters_md(total)
    ok = P.save(out_root)
    if ok:
        src, dst = os.path.join(out_root, SLUG), os.path.join(TPL, SLUG)
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("cache", "history", "exports", "session.json"))
        print("copied to", dst)
    return ok


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(WORK, "out")
    os.makedirs(out, exist_ok=True)
    sys.exit(0 if build(out) else 1)

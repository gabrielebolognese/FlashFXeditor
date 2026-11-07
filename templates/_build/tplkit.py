"""Builds Shorts Editor project folders (docs/INTEROP.md, schema 4) from Python.

A Proj collects media, tracks, clips, captions and markers, checks the document rules as it goes
(no overlaps, transitions on abutting media clips, in/out spans within the media), then `save()` writes
the folder, copies the media and runs the editor's own CLI: `normalize --write` (media headers, fonts)
and `validate` (strict).
"""
import json
import math
import os
import shutil
import subprocess
import uuid

import sys
HERE = os.path.dirname(os.path.abspath(__file__))
_repo_guess = os.path.abspath(os.path.join(HERE, "..", ".."))
# In the repo the scripts live in templates/_build/ (repo two levels up, work files in templates/_build/work/);
# TPL_REPO and TPL_WORK override both.
REPO = os.environ.get("TPL_REPO") or (_repo_guess if os.path.exists(os.path.join(_repo_guess, "package.json")) else "C:/Users/there/OneDrive/Desktop/editor")
WORK = os.environ.get("TPL_WORK") or (os.path.join(HERE, "work") if os.path.basename(HERE) == "_build" else os.path.dirname(HERE))
CLI = os.path.join(REPO, "dist-cli", "project-cli.mjs")
CATALOG = json.load(open(os.path.join(REPO, "public/fonts/library/catalog.json"), encoding="utf-8"))
FAMILIES = {f["family"]: f for f in CATALOG["families"]} if isinstance(CATALOG.get("families"), list) else {}
if not FAMILIES:
    FAMILIES = {f["family"]: f for f in CATALOG["fonts"]} if "fonts" in CATALOG else {}
IDLE = 0x00000040
EASES = ["linear", "easeIn", "easeOut", "easeInOut", "hold", "smooth", "snap", "overshoot"]
ANIMS = ["fade", "slideUp", "slideDown", "slideLeft", "slideRight", "pop", "typewriter", "wordPop", "wordFade", "lineReveal", "blurIn", "scaleBounce"]
LABELS = ["red", "orange", "green", "teal", "blue", "violet", "pink", "grey"]
NOW = "2026-11-07T09:00:00.000Z"


def rgba(r, g, b, a=1.0):
    return {"r": round(r, 4), "g": round(g, 4), "b": round(b, 4), "a": round(a, 4)}


def hexc(h, a=1.0):
    h = h.lstrip("#")
    return rgba(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)


def grad(top, bottom):
    return {"from": top, "to": bottom}


def font_weight(family, weight):
    """The family's nearest available weight (variable fonts: clamped to their range)."""
    info = FAMILIES.get(family)
    if not info:
        raise ValueError(f"font family not in the library: {family}")
    var = info.get("variable")
    if var and isinstance(var, dict) and "wght" in json.dumps(var):
        rng = var.get("wght") or var.get("axes", {}).get("wght")
        if isinstance(rng, (list, tuple)) and len(rng) == 2:
            return max(rng[0], min(rng[1], weight))
    weights = info.get("weights") or [400]
    return min(weights, key=lambda w: (abs(w - weight), -w))


def has_italic(family):
    info = FAMILIES.get(family, {})
    return bool(info.get("italic")) or any(f.get("style") == "italic" for f in info.get("files", []))


def text_style(font="Inter", size=96, weight=700, fill=None, italic=False, stroke=None, shadow=None, bg=None,
               case="none", spacing=0, line_height=1.2, align="center", anchor="middle"):
    """A complete TextStyle. stroke=(width, color), shadow=(x, y, blur, color), bg=(color, padX, padY, radius, mode)."""
    st = {
        "fontFamily": font,
        "fontWeight": font_weight(font, weight),
        "italic": bool(italic and has_italic(font)),
        "fontSize": size,
        "fill": fill or rgba(1, 1, 1),
        "stroke": {"enabled": False, "width": 6, "color": rgba(0, 0, 0)},
        "shadow": {"enabled": False, "x": 0, "y": 6, "blur": 16, "color": rgba(0, 0, 0, 0.6)},
        "background": {"enabled": False, "color": rgba(0, 0, 0, 0.7), "paddingX": 28, "paddingY": 12, "radius": 16, "mode": "block"},
        "textCase": case,
        "letterSpacing": spacing,
        "lineHeight": line_height,
        "align": align,
        "verticalAnchor": anchor,
    }
    if stroke:
        st["stroke"] = {"enabled": True, "width": stroke[0], "color": stroke[1]}
    if shadow:
        st["shadow"] = {"enabled": True, "x": shadow[0], "y": shadow[1], "blur": shadow[2], "color": shadow[3]}
    if bg:
        st["background"] = {"enabled": True, "color": bg[0], "paddingX": bg[1], "paddingY": bg[2], "radius": bg[3], "mode": bg[4]}
    return st


def anim(aid, duration, per=None, stagger=None, ease=None):
    a = {"id": aid, "duration": int(duration)}
    if per:
        a["perUnit"] = per
    if stagger is not None:
        a["stagger"] = int(stagger)
    if ease:
        a["ease"] = ease
    return a


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,duration,nb_frames:stream_side_data=rotation:stream_tags=rotate",
                          "-of", "json", path], capture_output=True, text=True, creationflags=IDLE)
    return json.loads(out.stdout or "{}")


class Proj:
    def __init__(self, slug, name, width, height, fps=(30, 1), background=(0, 0, 0), description=""):
        self.slug, self.name, self.description = slug, name, description
        self.w, self.h = width, height
        self.fps = fps
        self.bg = rgba(*background)
        self.media = {}
        self.media_src = {}
        self.media_info = {}
        self.vtracks, self.ctracks, self.atracks = [], [], []
        self.track_clips = {}
        self.clips = {}
        self.markers = []
        self.captions = {}
        self.bins = []
        self.bin_ids = {}
        self.presets = []
        self.n = 0
        self.extra_files = {}

    # ---------- time
    def f(self, seconds):
        return int(round(seconds * self.fps[0] / self.fps[1]))

    def ff(self, seconds):
        """Frames that fit in `seconds` (rounded down)."""
        return int(seconds * self.fps[0] / self.fps[1])

    @property
    def us_per_frame(self):
        return 1e6 * self.fps[1] / self.fps[0]

    def nid(self, prefix):
        self.n += 1
        return f"{prefix}{self.n}"

    # ---------- media
    def bin(self, name):
        if name not in self.bin_ids:
            bid = f"bin-{len(self.bins) + 1}"
            self.bins.append({"id": bid, "name": name})
            self.bin_ids[name] = bid
        return self.bin_ids[name]

    def add_media(self, path, kind=None, name=None, bin=None, sub=None):
        path = os.path.abspath(path)
        if path in self.media_src.values():
            return next(k for k, v in self.media_src.items() if v == path)
        ext = os.path.splitext(path)[1].lower()
        if kind is None:
            kind = "image" if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg") else "audio" if ext in (".mp3", ".m4a", ".aac", ".wav", ".ogg") else "video"
        mid = self.nid("m")
        base = os.path.basename(path)
        sub = sub or {"video": "video", "audio": "audio", "image": "images"}[kind]
        rel = f"media/{sub}/{base}"
        taken = {m["file"]["relPath"].lower() for m in self.media.values()}
        stem, e = os.path.splitext(base)
        k = 2
        while rel.lower() in taken:
            rel = f"media/{sub}/{stem} ({k}){e}"
            k += 1
        rec = {"id": mid, "kind": kind, "name": name or base, "file": {"relPath": rel}}
        if bin:
            rec["binId"] = self.bin(bin)
        self.media[mid] = rec
        self.media_src[mid] = path
        info = {"durationUs": 0, "width": None, "height": None, "hasAudio": False}
        if kind != "image" or ext in (".gif", ".webp"):
            pr = probe(path)
            streams = pr.get("streams", [])
            v = next((s for s in streams if s.get("codec_type") == "video"), None)
            a = next((s for s in streams if s.get("codec_type") == "audio"), None)
            durs = [float(pr.get("format", {}).get("duration") or 0)]
            if v and v.get("duration") and kind == "video":
                durs.append(float(v["duration"]))
            if a and a.get("duration") and kind == "audio":
                durs.append(float(a["duration"]))
            d = min(x for x in durs if x > 0) if any(x > 0 for x in durs) else 0
            info["durationUs"] = int(d * 1e6)
            if v:
                info["width"], info["height"] = v.get("width"), v.get("height")
                rot = 0
                for sd in v.get("side_data_list", []) or []:
                    if "rotation" in sd:
                        rot = int(sd["rotation"])
                rot = rot or int((v.get("tags") or {}).get("rotate", 0) or 0)
                if abs(rot) in (90, 270):
                    info["width"], info["height"] = info["height"], info["width"]
            info["hasAudio"] = a is not None
        if kind == "image" and not info["width"]:
            if ext == ".svg":
                import re
                txt = open(path, encoding="utf-8").read()
                mw, mh = re.search(r'width="(\d+)"', txt), re.search(r'height="(\d+)"', txt)
                info["width"], info["height"] = int(mw.group(1)), int(mh.group(1))
            else:
                from PIL import Image
                with Image.open(path) as im:
                    info["width"], info["height"] = im.size
        self.media_info[mid] = info
        return mid

    def mdur(self, mid):
        """Usable media length in seconds (a small margin under the header's duration)."""
        d = self.media_info[mid]["durationUs"] / 1e6
        return max(0.0, d - min(0.12, d * 0.05))

    # ---------- tracks
    def _track(self, kind, name, height="M", **flags):
        tid = self.nid({"video": "v", "audio": "a", "caption": "cc"}[kind])
        t = {"id": tid, "kind": kind, "name": name, "clipIds": [], "locked": flags.get("locked", False), "muted": flags.get("muted", False),
             "solo": flags.get("solo", False), "hidden": flags.get("hidden", False), "targeted": flags.get("targeted", True), "height": height}
        {"video": self.vtracks, "audio": self.atracks, "caption": self.ctracks}[kind].append(t)
        self.track_clips[tid] = []
        return tid

    def vtrack(self, name=None, height="M", **flags):
        return self._track("video", name or f"V{len(self.vtracks) + 1}", height, **flags)

    def atrack(self, name=None, height="M", **flags):
        return self._track("audio", name or f"A{len(self.atracks) + 1}", height, **flags)

    def ctrack(self, style, name="CC", height="S"):
        assert not self.ctracks, "one caption track at most"
        tid = self._track("caption", name, height)
        self.captions[tid] = {"style": style}
        return tid

    def track_kind(self, tid):
        for t in self.vtracks + self.atracks + self.ctracks:
            if t["id"] == tid:
                return t["kind"]
        raise KeyError(tid)

    # ---------- clips
    def _add(self, clip):
        tid = clip["trackId"]
        kind = self.track_kind(tid)
        ok = {"video": ("video", "image", "text", "solid"), "audio": ("audio",), "caption": ("caption",)}[kind]
        assert clip["kind"] in ok, f"{clip['kind']} clip on a {kind} track"
        assert isinstance(clip["start"], int) and clip["start"] >= 0 and isinstance(clip["duration"], int) and clip["duration"] >= 1, clip
        s, e = clip["start"], clip["start"] + clip["duration"]
        for other in self.track_clips[tid]:
            o = self.clips[other]
            if s < o["start"] + o["duration"] and o["start"] < e:
                raise ValueError(f"overlap on {tid}: {clip['name']} [{s},{e}) vs {o['name']} [{o['start']},{o['start'] + o['duration']})")
        self.clips[clip["id"]] = clip
        self.track_clips[tid].append(clip["id"])
        return clip["id"]

    def free(self, tid, start, dur):
        e = start + dur
        return all(not (start < self.clips[c]["start"] + self.clips[c]["duration"] and self.clips[c]["start"] < e) for c in self.track_clips[tid])

    def _base(self, kind, tid, start, dur, name, color=None, enabled=True, link=None, group=None):
        c = {"id": self.nid("c"), "trackId": tid, "kind": kind, "name": name, "start": int(start), "duration": int(dur), "enabled": enabled}
        if color:
            c["color"] = color
        if link:
            c["linkGroup"] = link
        if group:
            c["group"] = group
        return c

    @staticmethod
    def transform(x=0, y=0, scale=1.0, rot=0, scale_y=None, anchor=(0.5, 0.5), flip_h=False, flip_v=False):
        t = {"x": round(x, 3), "y": round(y, 3), "scale": round(scale, 5), "rotation": round(rot, 3), "anchor": {"x": anchor[0], "y": anchor[1]}, "flipH": flip_h, "flipV": flip_v}
        if scale_y is not None:
            t["scaleY"] = round(scale_y, 5)
        return t

    def fit_scale(self, mid, mode="cover", box=None):
        info = self.media_info[mid]
        bw, bh = box or (self.w, self.h)
        if not info["width"]:
            return 1.0
        sx, sy = bw / info["width"], bh / info["height"]
        return max(sx, sy) if mode == "cover" else min(sx, sy)

    def _media_clip(self, kind, tid, start, dur, mid, src_in=0.0, speed=1.0, name=None, fit="cover", x=0, y=0, scale=None, rot=0,
                    scale_y=None, flip_h=False, flip_v=False, opacity=1.0, crop=None, gain=0.0, muted=False, fades=(0, 0), kf=None,
                    color=None, enabled=True, link=None, group=None, anchor=(0.5, 0.5), box=None):
        c = self._base(kind, tid, start, dur, name or self.media[mid]["name"], color, enabled, link, group)
        upf = self.us_per_frame
        c["mediaId"] = mid
        if kind == "image":
            c["in"], c["out"], c["speed"] = 0, max(1, int(round(dur * upf))), 1
        elif speed == 0:
            dur_us = self.media_info[mid]["durationUs"]
            at = min(int(round(src_in * 1e6)), max(0, dur_us - 2))
            c["in"], c["out"], c["speed"] = at, min(at + int(round(upf)), dur_us), 0
            assert c["out"] > c["in"], ("freeze needs a frame", self.media[mid]["name"])
        else:
            span = int(round(dur * speed * upf))
            limit = int(self.mdur(mid) * 1e6)
            if span > limit and span - limit < 600_000:
                dur = int(limit / (speed * upf))  # a little short: trim the clip to the media
                c["duration"] = dur
                span = int(round(dur * speed * upf))
            if span > limit:
                raise ValueError(f"{self.media[mid]['name']}: needs {span / 1e6:.2f} s at speed {speed}, has {limit / 1e6:.2f} s")
            i = int(round(src_in * 1e6))
            if i + span > limit:
                i = limit - span
            c["in"], c["out"], c["speed"] = max(0, i), max(0, i) + span, speed
        if kind != "audio":
            sc = scale if scale is not None else (self.fit_scale(mid, fit, box) if fit else 1.0)
            c["transform"] = self.transform(x, y, sc, rot, scale_y, anchor, flip_h, flip_v)
        else:
            c["transform"] = self.transform()
        c["opacity"] = opacity
        c["crop"] = {"left": 0, "top": 0, "right": 0, "bottom": 0, **(crop or {})}
        c["volume"] = {"gainDb": gain, "muted": muted}
        c["fades"] = {"in": min(int(fades[0]), dur // 2), "out": min(int(fades[1]), dur // 2)}
        if kf:
            c["keyframes"] = kf
        return self._add(c)

    def video(self, tid, start, dur, mid, **kw):
        return self._media_clip("video", tid, start, dur, mid, **kw)

    def freeze(self, tid, start, dur, mid, at=0.0, **kw):
        return self._media_clip("video", tid, start, dur, mid, src_in=at, speed=0, **kw)

    def image(self, tid, start, dur, mid, **kw):
        kw.setdefault("fit", "cover")
        return self._media_clip("image", tid, start, dur, mid, **kw)

    def audio(self, tid, start, dur, mid, src_in=0.0, speed=1.0, gain=0.0, muted=False, fades=(0, 0), kf=None, name=None, color=None, enabled=True, link=None, group=None):
        return self._media_clip("audio", tid, start, dur, mid, src_in=src_in, speed=speed, gain=gain, muted=muted, fades=fades, kf=kf, name=name,
                                color=color, enabled=enabled, link=link, group=group, fit=None)

    def audio_any(self, tracks, start, dur, mid, **kw):
        """An audio clip on the first of `tracks` that is free over [start, start+dur); None when all are taken."""
        for tid in tracks:
            if self.free(tid, start, dur):
                return self.audio(tid, start, dur, mid, **kw)
        return None

    def any_free(self, tracks, start, dur):
        return next((t for t in tracks if self.free(t, start, dur)), None)

    def audio_fill(self, tid, start, dur, mid, gain=0.0, xfade=0, name=None, fades=(0, 0), kf_each=None):
        """Loops a music file over [start, start+dur) as consecutive clips (crossfaded when xfade > 0)."""
        ids = []
        pos, end = start, start + dur
        length = self.ff(self.mdur(mid))
        while pos < end:
            d = min(length, end - pos)
            if d < 2:
                break
            cid = self.audio(tid, pos, d, mid, gain=gain, name=name, fades=(fades[0] if pos == start else 0, fades[1] if pos + d >= end else 0))
            if ids and xfade:
                self.transition(ids[-1], cid, "crossDissolve", min(xfade, self.clips[ids[-1]]["duration"] // 3), min(xfade, d // 3))
            ids.append(cid)
            pos += d
        return ids

    def text(self, tid, start, dur, value, style=None, box=None, anim_in=None, anim_out=None, x=0, y=0, scale=1.0, rot=0, scale_y=None,
             opacity=1.0, kf=None, fades=None, name=None, color=None, enabled=True, group=None, anchor=(0.5, 0.5), preset=None, link=None):
        c = self._base("text", tid, start, dur, name or value.split("\n")[0][:40] or "Text", color, enabled, link, group)
        c["text"] = {"value": value, "box": box or {"mode": "auto", "width": 900}}
        c["style"] = style or text_style()
        half = dur // 2
        if anim_in:
            c["animIn"] = {**anim_in, "duration": min(anim_in["duration"], half)}
        if anim_out:
            c["animOut"] = {**anim_out, "duration": min(anim_out["duration"], half)}
        if preset:
            c["presetId"] = preset
        c["transform"] = self.transform(x, y, scale, rot, scale_y, anchor)
        c["opacity"] = opacity
        c["fades"] = {"in": min(int(fades[0]), dur // 2), "out": min(int(fades[1]), dur // 2)} if fades else {"in": 0, "out": 0}
        if kf:
            c["keyframes"] = kf
        return self._add(c)

    def solid(self, tid, start, dur, fill, w=None, h=None, shape="rect", radius=0, x=0, y=0, scale=1.0, rot=0, scale_y=None, opacity=1.0,
              kf=None, fades=None, name=None, color=None, enabled=True, group=None, anchor=(0.5, 0.5), link=None):
        c = self._base("solid", tid, start, dur, name or "Solid", color, enabled, link, group)
        w, h = w or self.w, h or self.h
        c["fill"] = fill
        c["shape"] = shape
        c["size"] = {"w": w, "h": h}
        c["cornerRadius"] = min(radius, min(w, h) / 2)
        c["transform"] = self.transform(x, y, scale, rot, scale_y, anchor)
        c["opacity"] = opacity
        if fades:
            c["fades"] = {"in": min(int(fades[0]), dur // 2), "out": min(int(fades[1]), dur // 2)}
        if kf:
            c["keyframes"] = kf
        return self._add(c)

    def caption(self, start, dur, text, words=None, override=None, name=None, preset=None):
        tid = self.ctracks[0]["id"]
        c = self._base("caption", tid, start, dur, name or f"Cue {len(self.track_clips[tid]) + 1}")
        c["text"] = text
        if words:
            c["words"] = words
        if override:
            c["styleOverride"] = override
        if preset:
            c["presetId"] = preset
        return self._add(c)

    def transition(self, a, b, kind="crossDissolve", before=8, after=8):
        ca, cb = self.clips[a], self.clips[b]
        assert ca["trackId"] == cb["trackId"] and ca["start"] + ca["duration"] == cb["start"], ("transition clips must abut", ca["name"], cb["name"])
        assert ca["kind"] in ("video", "image", "audio") and cb["kind"] in ("video", "image", "audio")
        if ca["kind"] == "audio":
            kind = "crossDissolve"
        before = max(0, min(before, ca["duration"] - (ca.get("transitionIn") or {}).get("after", 0) - 1))
        after = max(0, min(after, cb["duration"] - 1))
        if before + after < 1:
            return None
        t = {"id": self.nid("tr"), "kind": kind, "before": int(before), "after": int(after)}
        ca["transitionOut"] = dict(t)
        cb["transitionIn"] = dict(t)
        return t["id"]

    def marker(self, frame, label, color="blue"):
        self.markers.append({"id": self.nid("mk"), "frame": int(frame), "color": color, "label": label})

    def preset(self, pid, name, style, anim_in=None, anim_out=None, sample=None, tags=(), sets=None, highlight=None, position=None, favorite=False):
        p = {"id": pid, "name": name, "style": style, "box": {"mode": "auto", "width": 900}, "applyPosition": position is not None,
             "tags": list(tags), "favorite": favorite, "createdAt": NOW, "updatedAt": NOW}
        if anim_in:
            p["animIn"] = anim_in
        if anim_out:
            p["animOut"] = anim_out
        if sample:
            p["sampleText"] = sample
        if sets:
            p["sets"] = sets
        if highlight:
            p["highlight"] = highlight
        if position:
            p["position"] = {"x": position[0], "y": position[1]}
        self.presets.append(p)
        return pid

    # ---------- output
    def document(self):
        tracks = self.vtracks + self.ctracks + self.atracks
        for t in tracks:
            t["clipIds"] = sorted(self.track_clips[t["id"]], key=lambda c: self.clips[c]["start"])
        doc = {
            "schemaVersion": 4,
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"shorts-editor-template:{self.slug}")),
            "name": self.name,
            "settings": {"width": self.w, "height": self.h, "fps": {"num": self.fps[0], "den": self.fps[1]}, "background": self.bg, "sampleRate": 48000},
            "media": self.media,
            "bins": self.bins,
            "tracks": tracks,
            "clips": self.clips,
            "markers": sorted(self.markers, key=lambda m: m["frame"]),
            "captionTracks": self.captions,
            "textPresetsLocal": [],
            "meta": {"createdAt": NOW, "modifiedAt": NOW, "appVersion": "1.1.0",
                     "generator": {"name": "shorts-editor-templates", "version": "1.0.0", "source": f"templates/_build/{os.path.basename(sys.argv[0])}",
                                   "url": "https://github.com/gabrielebolognese/FlashFXeditor"}},
        }
        return doc

    def save(self, out_root, notes=None):
        folder = os.path.join(out_root, self.slug)
        if os.path.exists(os.path.join(folder, "project.json")):
            os.remove(os.path.join(folder, "project.json"))
        if os.path.isdir(os.path.join(folder, "media")):
            shutil.rmtree(os.path.join(folder, "media"))
        if os.path.isdir(os.path.join(folder, "fonts")):
            shutil.rmtree(os.path.join(folder, "fonts"))
        os.makedirs(folder, exist_ok=True)
        for mid, src in self.media_src.items():
            dst = os.path.join(folder, self.media[mid]["file"]["relPath"])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
        if self.presets:
            pdir = os.path.join(folder, "presets", "text")
            if os.path.isdir(pdir):
                shutil.rmtree(pdir)
            os.makedirs(pdir)
            for p in self.presets:
                json.dump(p, open(os.path.join(pdir, f"{p['id']}.json"), "w", encoding="utf-8"), indent=2)
        for rel, content in self.extra_files.items():
            open(os.path.join(folder, rel), "w", encoding="utf-8", newline="\n").write(content)
        doc = self.document()
        # normalize (Batch 55) merges a gradient fill {from, to} field by field into the default RGBA fill, which makes it
        # invalid: park every gradient as its top color for the normalize run, then put the gradients back.
        parked = []

        def park(node, path):
            if isinstance(node, dict):
                for key, value in list(node.items()):
                    if key == "fill" and isinstance(value, dict) and "from" in value:
                        parked.append((path + [key], value))
                        node[key] = dict(value["from"])
                    else:
                        park(value, path + [key])
            elif isinstance(node, list):
                for i, value in enumerate(node):
                    park(value, path + [i])
        park(doc, [])
        pj = os.path.join(folder, "project.json")
        json.dump(doc, open(pj, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        # Media whose header the CLI cannot read get their facts from ffprobe.
        dry = subprocess.run(["node", CLI, "normalize", folder], capture_output=True, text=True, cwd=REPO, creationflags=IDLE)
        import re as _re
        for mid in _re.findall(r"media\.(m\d+)\.file: its header cannot be read", dry.stderr):
            info = self.media_info[mid]
            rec = doc["media"][mid]
            rec["durationUs"] = info["durationUs"]
            rec["hasAudio"] = bool(info["hasAudio"])
            if info.get("width"):
                rec["width"], rec["height"] = info["width"], info["height"]
        json.dump(doc, open(pj, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        norm = subprocess.run(["node", CLI, "normalize", folder, "--write"], capture_output=True, text=True, cwd=REPO, creationflags=IDLE)
        if norm.returncode == 0 and parked:
            out = json.load(open(pj, encoding="utf-8"))
            for path, value in parked:
                node = out
                for key in path[:-1]:
                    node = node[key]
                node[path[-1]] = value
            json.dump(out, open(pj, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        val = subprocess.run(["node", CLI, "validate", folder], capture_output=True, text=True, cwd=REPO, creationflags=IDLE)
        info = subprocess.run(["node", CLI, "info", folder], capture_output=True, text=True, cwd=REPO, creationflags=IDLE)
        ok = val.returncode == 0
        report = {"normalize": norm.returncode, "validate": val.returncode, "normalizeErr": norm.stderr[-3000:], "validateOut": val.stdout[-4000:],
                  "info": info.stdout[:1500]}
        json.dump(report, open(os.path.join(out_root, f"{self.slug}.report.json"), "w", encoding="utf-8"), indent=1)
        print(f"{self.slug}: normalize {norm.returncode}, validate {'OK' if ok else 'FAILED'}; {len(self.clips)} clips, {len(self.media)} media, "
              f"{len(self.vtracks)}V/{len(self.ctracks)}C/{len(self.atracks)}A tracks")
        if not ok:
            print(val.stdout[-2500:])
            print(norm.stderr[-1500:])
        return ok

    def length(self):
        return max((c["start"] + c["duration"] for c in self.clips.values()), default=0)


def kf(*props):
    """kf(("transform.scale", [(0, 1, "easeOut"), (30, 1.2, "linear")]), ...) -> Keyframes object."""
    out = {}
    for prop, keys in props:
        seen = {}
        for frame, value, *ease in keys:
            seen[int(frame)] = {"frame": int(frame), "value": round(float(value), 4), "ease": ease[0] if ease else "linear"}
        out[prop] = [seen[k] for k in sorted(seen)]
    return out


def words_from_tts(entries, cue_start_ms, fps, end_ms=None):
    """CaptionWord list (frames relative to the cue start) from TTS word events [{t, w}] in ms."""
    words = []
    for i, e in enumerate(entries):
        s = e["t"]
        nxt = entries[i + 1]["t"] if i + 1 < len(entries) else (end_ms if end_ms else s + 450)
        dur = min(nxt - s, 260 + 70 * len(e["w"]))
        fs = int(round((s - cue_start_ms) * fps[0] / fps[1] / 1000))
        fe = int(round((s + dur - cue_start_ms) * fps[0] / fps[1] / 1000))
        words.append({"text": e["w"], "start": fs, "end": max(fs + 1, fe)})
    return words


CONV_DIR = os.path.join(WORK, "gen", "conv")


def conv(src, name, args, start=None, seconds=None):
    """ffmpeg-converts `src` into gen/conv/<name> once (args: codec options); returns the path."""
    os.makedirs(CONV_DIR, exist_ok=True)
    out = os.path.join(CONV_DIR, name)
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", str(start)]
    cmd += ["-i", src]
    if seconds is not None:
        cmd += ["-t", str(seconds)]
    p = subprocess.run(cmd + list(args) + [out], capture_output=True, text=True, creationflags=IDLE)
    if p.returncode != 0:
        raise RuntimeError(f"conv failed {name}: {p.stderr[-400:]}")
    return out


AAC = ["-vn", "-c:a", "aac", "-b:a", "128k", "-ar", "48000"]
AAC_VOICE = ["-vn", "-c:a", "aac", "-b:a", "64k", "-ar", "48000", "-ac", "1"]
MP3 = ["-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100"]
MP3_VOICE = ["-vn", "-c:a", "libmp3lame", "-b:a", "64k", "-ar", "44100", "-ac", "1"]
OGG = ["-vn", "-c:a", "libvorbis", "-q:a", "3", "-ar", "48000"]
OPUS_OGG = ["-vn", "-c:a", "libopus", "-b:a", "64k"]
WAV48 = ["-vn", "-c:a", "pcm_s16le", "-ar", "48000"]


def pick_font(*names):
    for n in names:
        if n in FAMILIES:
            return n
    return "Inter"


def tts_words(json_path):
    return json.load(open(json_path, encoding="utf-8"))


def cues_from_tts(entries, text, max_words=7, max_ms=3800):
    """Groups TTS word events into cues: [(start_ms, end_ms, cue_text, [(word, start_ms, end_ms)])]."""
    cues, cur = [], []
    for i, e in enumerate(entries):
        nxt = entries[i + 1]["t"] if i + 1 < len(entries) else e["t"] + 260 + 60 * e["len"]
        end = min(nxt, e["t"] + 260 + 75 * e["len"])
        cur.append((e, end))
        tail = text[e["pos"] + e["len"]: e["pos"] + e["len"] + 1]
        span = cur[-1][1] - cur[0][0]["t"]
        if len(cur) >= max_words or tail in ".,;:?!" and len(cur) >= 3 or span > max_ms or i + 1 == len(entries):
            first, last = cur[0][0], cur[-1][0]
            seg = text[first["pos"]: last["pos"] + last["len"]]
            if tail in ".?!":
                seg += tail
            cues.append((first["t"], cur[-1][1], seg, [(w["w"], w["t"], en) for w, en in cur]))
            cur = []
    return cues

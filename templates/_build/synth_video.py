"""Original motion graphics, stickers and overlays for the templates (ffmpeg lavfi + PIL frames).

Usage: python -I synth_video.py <out dir> [group...]   groups: mg counters stickers overlays torture
"""
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1]
GROUPS = set(sys.argv[2:]) or {"mg", "counters", "stickers", "overlays", "torture"}
IDLE = 0x00000040
FONT = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"
FF_FONT = "C\\:/Windows/Fonts/arialbd.ttf"
rng = np.random.default_rng(11)


def sh(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, creationflags=IDLE)
    if p.returncode != 0:
        print("FAILED", " ".join(cmd)[:300], p.stderr[-800:])
    return p.returncode == 0


def x264(out, crf=24, extra=()):
    return ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", "-threads", "3", *extra, "-movflags", "+faststart", out]


def lavfi(out, src, seconds, crf=24, vf=None, audio=None):
    if os.path.exists(out):
        return
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", src]
    if audio:
        cmd += ["-f", "lavfi", "-i", audio]
    cmd += ["-t", str(seconds)]
    if vf:
        cmd += ["-vf", vf]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-shortest"]
    sh(cmd + x264(out, crf))
    print("mg", os.path.basename(out))


class Pipe:
    """Raw RGB(A) frames into an ffmpeg encoder."""

    def __init__(self, out, w, h, fps, args, pix="rgb24"):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        self.p = subprocess.Popen(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", pix,
                                   "-s", f"{w}x{h}", "-r", str(fps), "-i", "-", *args, out],
                                  stdin=subprocess.PIPE, creationflags=IDLE)

    def write(self, img):
        self.p.stdin.write(img.tobytes())

    def close(self):
        self.p.stdin.close()
        self.p.wait()


def font(size, bold=True):
    return ImageFont.truetype(FONT if bold else FONT_REG, size)


# ------------------------------------------------------------------ motion graphics
def mg():
    d = os.path.join(OUT, "mg")
    lavfi(f"{d}/mg-gradient-vertical.mp4", "gradients=s=1080x1920:r=30:c0=0x1d2b64:c1=0xf8cdda:c2=0x6a3093:c3=0x00c9ff:n=4:speed=0.02:type=radial", 10)
    lavfi(f"{d}/mg-gradient-wide.mp4", "gradients=s=1920x1080:r=30:c0=0xff512f:c1=0xdd2476:c2=0x1fa2ff:n=3:speed=0.015:type=linear", 10)
    lavfi(f"{d}/mg-mandelbrot.mp4", "mandelbrot=s=960x540:r=30:end_scale=0.002:inner=convergence", 8, crf=26)
    lavfi(f"{d}/mg-life.mp4", "life=s=320x320:r=25:mold=10:ratio=0.2:death_color=#1a1a2e:life_color=#e94560", 10, crf=28)
    lavfi(f"{d}/mg-cellauto.mp4", "cellauto=s=640x360:r=30:rule=110:scroll=1", 8, crf=28, vf="scale=1280:720:flags=neighbor")
    lavfi(f"{d}/mg-zoneplate.mp4", "zoneplate=s=720x720:r=30:ku=128:kv=128:kt2=8:kx2=256:ky2=256", 4, crf=32)
    lavfi(f"{d}/mg-testsrc-2997.mp4", "testsrc2=s=1920x1080:r=30000/1001", 10, crf=31,
          vf=f"drawtext=fontfile='{FF_FONT}':text='%{{pts\\:hms}}  frame %{{n}}':fontsize=64:fontcolor=white:box=1:boxcolor=black@0.6:x=(w-tw)/2:y=h-140")
    lavfi(f"{d}/mg-smpte-bars-tone.mp4", "smptehdbars=s=1920x1080:r=25", 8, crf=24, audio="sine=frequency=1000:sample_rate=48000")
    lavfi(f"{d}/mg-film-grain.mp4", "color=c=0x808080:s=640x360:r=24", 4, crf=34,
          vf="noise=alls=28:allf=t,vignette=PI/4,format=yuv420p")
    lavfi(f"{d}/mg-countdown.mp4", "color=c=0x101418:s=1080x1080:r=30", 10, crf=24,
          vf=(f"drawtext=fontfile='{FF_FONT}':text='%{{eif\\:10-t\\:d}}':fontsize=520:fontcolor=white:x=(w-tw)/2:y=(h-th)/2,"
              "drawbox=x=0:y=ih-40:w=iw*mod(t\\,1):h=40:color=0xff4757:t=fill"))
    lavfi(f"{d}/mg-rgb-cycle.mp4", "rgbtestsrc=s=1280x720:r=30", 6, crf=26, vf="hue=h=t*60")
    lavfi(f"{d}/mg-sierpinski.mp4", "sierpinski=s=1080x1080:r=30:type=carpet:jump=50", 8, crf=26)
    # PIL-drawn: light leaks (soft moving blobs)
    out = f"{d}/mg-light-leak.mp4"
    if not os.path.exists(out):
        w, h, fps, n = 960, 540, 30, 240
        pipe = Pipe(out, w, h, fps, x264(out, 26)[:-1])
        blobs = [(rng.random() * w, rng.random() * h, 120 + rng.random() * 220, rng.random() * 6.28, tuple(int(c) for c in col))
                 for col in ([255, 120, 40], [255, 60, 120], [255, 200, 80], [200, 80, 255])]
        for f in range(n):
            img = Image.new("RGB", (w, h), (0, 0, 0))
            dr = ImageDraw.Draw(img)
            for i, (bx, by, r, ph, col) in enumerate(blobs):
                x = bx + math.sin(f / 40 + ph) * 200
                y = by + math.cos(f / 55 + ph * 2) * 120
                rr = r * (1 + 0.3 * math.sin(f / 30 + i))
                dr.ellipse([x - rr, y - rr, x + rr, y + rr], fill=col)
            pipe.write(img.filter(ImageFilter.GaussianBlur(70)))
        pipe.close()
        print("mg light leak")
    # PIL-drawn: rising bokeh particles, vertical
    out = f"{d}/mg-particles-vertical.mp4"
    if not os.path.exists(out):
        w, h, fps, n = 540, 960, 30, 300
        pipe = Pipe(out, w, h, fps, x264(out, 26)[:-1])
        parts = [[rng.random() * w, rng.random() * h, 4 + rng.random() * 26, 0.5 + rng.random() * 2.5, rng.random()] for _ in range(70)]
        for f in range(n):
            img = Image.new("RGB", (w, h), (8, 10, 30))
            dr = ImageDraw.Draw(img)
            for p in parts:
                p[1] -= p[3]
                if p[1] < -40:
                    p[1] = h + 40
                x = p[0] + math.sin(f / 25 + p[4] * 6) * 12
                a = int(80 + 175 * p[4])
                dr.ellipse([x - p[2], p[1] - p[2], x + p[2], p[1] + p[2]], fill=(a, int(a * 0.7), 255))
            pipe.write(img.filter(ImageFilter.GaussianBlur(3)))
        pipe.close()
        print("mg particles")
    # PIL-drawn: kinetic shapes loop (squares, circles), square
    out = f"{d}/mg-shapes-loop.mp4"
    if not os.path.exists(out):
        w, h, fps, n = 1080, 1080, 30, 180
        pipe = Pipe(out, w, h, fps, x264(out, 24)[:-1])
        cols = [(255, 71, 87), (46, 213, 115), (30, 144, 255), (255, 165, 2), (164, 94, 229)]
        for f in range(n):
            img = Image.new("RGB", (w, h), (20, 20, 28))
            dr = ImageDraw.Draw(img)
            for i in range(5):
                for j in range(5):
                    t = (f / n * 2 * math.pi) + (i + j) * 0.5
                    s = 60 + 50 * math.sin(t)
                    cx, cy = 140 + i * 200, 140 + j * 200
                    if (i + j) % 2:
                        dr.ellipse([cx - s, cy - s, cx + s, cy + s], fill=cols[(i + j) % 5])
                    else:
                        dr.rectangle([cx - s, cy - s, cx + s, cy + s], fill=cols[(i * 2 + j) % 5])
            pipe.write(img)
        pipe.close()
        print("mg shapes")
    # Glitch: testsrc through rgbashift / noise bursts, vertical
    lavfi(f"{d}/mg-glitch-vertical.mp4", "testsrc2=s=540x960:r=30", 6, crf=30,
          vf="rgbashift=rh=12:bh=-12:edge=wrap,noise=alls=14:allf=t,hue=s=3")


# ------------------------------------------------------------------ frame counters (one per frame rate)
def counters():
    d = os.path.join(OUT, "counters")
    for label, rate, size in (("24", "24", "1280x720"), ("25", "25", "1280x720"), ("30", "30", "1280x720"), ("2997", "30000/1001", "1280x720"),
                              ("60", "60", "1280x720"), ("23976", "24000/1001", "1280x720"), ("5994", "60000/1001", "1280x720"),
                              ("12", "12", "960x540"), ("120", "120", "960x540"), ("50", "50", "1280x720")):
        lavfi(f"{d}/counter-{label}fps.mp4", f"color=c=0x202830:s={size}:r={rate}", 8, crf=28,
              vf=(f"drawtext=fontfile='{FF_FONT}':text='{label.replace('2997', '29.97').replace('23976', '23.976').replace('5994', '59.94')} fps':fontsize=48:fontcolor=0xffa502:x=40:y=40,"
                  f"drawtext=fontfile='{FF_FONT}':text='%{{n}}':fontsize=260:fontcolor=white:x=(w-tw)/2:y=(h-th)/2,"
                  f"drawtext=fontfile='{FF_FONT}':text='%{{pts\\:hms}}':fontsize=48:fontcolor=0x7bed9f:x=40:y=h-90,"
                  "drawbox=x='mod(t*400,iw-16)':y=ih-20:w=16:h=20:color=0xff4757:t=fill"),
              audio="sine=frequency=880:beep_factor=4:sample_rate=48000")


# ------------------------------------------------------------------ stickers (animated GIF and WebP with alpha)
def save_anim(frames, base, fps, gif=True, webp=True):
    dur = int(1000 / fps)
    if webp and not os.path.exists(base + ".webp"):
        frames[0].save(base + ".webp", save_all=True, append_images=frames[1:], duration=dur, loop=0, lossless=False, quality=80, method=4)
    if gif and not os.path.exists(base + ".gif"):
        gf = []
        for fr in frames:
            alpha = fr.getchannel("A").point(lambda a: 255 if a > 128 else 0)
            p = fr.convert("RGB").convert("P", palette=Image.ADAPTIVE, colors=255)
            p.paste(255, mask=Image.eval(alpha, lambda a: 255 - a))
            gf.append(p)
        gf[0].save(base + ".gif", save_all=True, append_images=gf[1:], duration=dur, loop=0, transparency=255, disposal=2)


def star_points(cx, cy, r1, r2, n=5, rot=0.0):
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = rot + i * math.pi / n - math.pi / 2
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def stickers():
    d = os.path.join(OUT, "stickers")
    os.makedirs(d, exist_ok=True)
    S = 320
    def canvas(size=S):
        return Image.new("RGBA", (size, size), (0, 0, 0, 0))
    frames = []
    for f in range(30):
        im = canvas(); dr = ImageDraw.Draw(im)
        sc = 1 + 0.12 * math.sin(f / 30 * 2 * math.pi)
        dr.polygon(star_points(S / 2, S / 2, 140 * sc, 60 * sc, 5, f / 30 * 2 * math.pi / 5), fill=(255, 210, 0, 255), outline=(255, 140, 0, 255))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-star-spin", 30)
    frames = []
    for f in range(24):
        im = canvas(); dr = ImageDraw.Draw(im)
        sc = 1 + 0.18 * max(0, math.sin(f / 24 * 4 * math.pi))
        r = 70 * sc
        dr.ellipse([S / 2 - r * 1.05 - 40, S / 2 - r - 20, S / 2 - 40 + r * 0.95, S / 2 + r * 0.9 - 20], fill=(255, 60, 90, 255))
        dr.ellipse([S / 2 + 40 - r * 0.95, S / 2 - r - 20, S / 2 + 40 + r * 1.05, S / 2 + r * 0.9 - 20], fill=(255, 60, 90, 255))
        dr.polygon([(S / 2 - 2.0 * r, S / 2 - 0.1 * r), (S / 2 + 2.0 * r, S / 2 - 0.1 * r), (S / 2, S / 2 + 2.0 * r)], fill=(255, 60, 90, 255))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-heart-pulse", 24)
    frames = []
    for f in range(20):
        im = canvas(); dr = ImageDraw.Draw(im)
        y = 40 + 50 * abs(math.sin(f / 20 * math.pi))
        dr.polygon([(S / 2, y + 220), (S / 2 - 110, y + 100), (S / 2 - 45, y + 100), (S / 2 - 45, y), (S / 2 + 45, y), (S / 2 + 45, y + 100), (S / 2 + 110, y + 100)],
                   fill=(46, 213, 115, 255), outline=(255, 255, 255, 255))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-arrow-bounce", 20)
    frames = []
    for f in range(36):
        im = canvas(); dr = ImageDraw.Draw(im)
        for k in range(8):
            a = k * math.pi / 4 + f / 36 * math.pi
            r = 30 + (f % 18) * 7
            x, y = S / 2 + r * math.cos(a), S / 2 + r * math.sin(a)
            s = 22 * (1 - (f % 18) / 18)
            dr.polygon(star_points(x, y, s, s / 3, 4, a), fill=(255, 255, 255, int(255 * (1 - (f % 18) / 18))))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-sparkle", 30)
    frames = []
    for f in range(30):
        im = canvas(480); dr = ImageDraw.Draw(im)
        pop = min(1.0, f / 8) * (1 + 0.15 * math.sin(min(f, 16) / 16 * math.pi * 2) * (f < 16))
        w, h = 400 * pop, 120 * pop
        dr.rounded_rectangle([240 - w / 2, 240 - h / 2, 240 + w / 2, 240 + h / 2], radius=h / 2, fill=(255, 0, 0, 255))
        if pop > 0.5:
            fnt = font(int(54 * pop))
            dr.text((240, 240), "SUBSCRIBE", font=fnt, anchor="mm", fill=(255, 255, 255, 255))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-subscribe", 30)
    frames = []
    for f in range(24):
        im = canvas(); dr = ImageDraw.Draw(im)
        dr.ellipse([30, 30, S - 30, S - 30], fill=(255, 205, 60, 255), outline=(200, 140, 0, 255), width=6)
        blink = f in (10, 11, 12)
        dr.ellipse([95, 105, 135, 155], fill=(40, 30, 20, 255))
        if blink:
            dr.line([185, 130, 225, 130], fill=(40, 30, 20, 255), width=8)
        else:
            dr.ellipse([185, 105, 225, 155], fill=(40, 30, 20, 255))
        dr.arc([90, 140, 230, 250], 20, 160, fill=(40, 30, 20, 255), width=10)
        frames.append(im.rotate(8 * math.sin(f / 24 * 2 * math.pi), resample=Image.BICUBIC))
    save_anim(frames, f"{d}/sticker-smiley-wink", 24)
    frames = []
    pieces = [(rng.random() * 6.28, 3 + rng.random() * 9, tuple(int(c) for c in rng.integers(60, 255, 3)), rng.random() * 6.28) for _ in range(90)]
    for f in range(48):
        im = canvas(640); dr = ImageDraw.Draw(im)
        for a, v, col, spin in pieces:
            r = v * f * 1.4
            x, y = 320 + r * math.cos(a), 320 + r * math.sin(a) + 0.25 * f * f
            s = 9
            ang = spin + f / 5
            pts = [(x + s * math.cos(ang + k * math.pi / 2), y + s * 0.5 * math.sin(ang + k * math.pi / 2)) for k in range(4)]
            dr.polygon(pts, fill=col + (int(255 * max(0, 1 - f / 48)),))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-confetti", 30)
    frames = []
    for f in range(24):
        im = canvas(200); dr = ImageDraw.Draw(im)
        for k in range(12):
            a = k * math.pi / 6
            alpha = int(255 * (((k - f / 2) % 12) / 12))
            dr.line([100 + 40 * math.cos(a), 100 + 40 * math.sin(a), 100 + 80 * math.cos(a), 100 + 80 * math.sin(a)], fill=(255, 255, 255, alpha), width=12)
        frames.append(im)
    save_anim(frames, f"{d}/sticker-spinner", 24)
    frames = []
    for f in range(20):
        im = canvas(); dr = ImageDraw.Draw(im)
        for k, col in enumerate([(255, 80, 0), (255, 160, 0), (255, 230, 80)]):
            sc = 1 - k * 0.28
            wob = 10 * math.sin(f / 20 * 2 * math.pi * (k + 1) + k)
            pts = [(S / 2 - 100 * sc, 280), (S / 2 - 90 * sc + wob, 180 - 20 * k), (S / 2 - 30 * sc, 120 - 10 * k + wob),
                   (S / 2 + wob, 40 + 30 * k), (S / 2 + 40 * sc, 130 - 10 * k - wob), (S / 2 + 90 * sc - wob, 190 - 20 * k), (S / 2 + 100 * sc, 280)]
            dr.polygon(pts, fill=col + (255,))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-fire", 20)
    frames = []
    for f in range(40):
        im = canvas(512); dr = ImageDraw.Draw(im)
        sc = min(1, f / 10)
        dr.rounded_rectangle([256 - 220 * sc, 256 - 140 * sc, 256 + 220 * sc, 256 + 100 * sc], radius=40 * sc + 1, fill=(255, 255, 255, 255), outline=(30, 30, 30, 255), width=6)
        dr.polygon([(256 - 60 * sc, 256 + 95 * sc), (256 - 120 * sc, 256 + 200 * sc), (256 + 10 * sc, 256 + 95 * sc)], fill=(255, 255, 255, 255))
        if f > 10:
            txt = "WOW!"[: 1 + (f - 10) // 4]
            dr.text((256, 236), txt, font=font(110), anchor="mm", fill=(30, 30, 30, 255))
        frames.append(im)
    save_anim(frames, f"{d}/sticker-speech-wow", 20)
    # A large GIF (many frames) to test the animated-image texture budget.
    big = f"{d}/sticker-big-tunnel"
    if not os.path.exists(big + ".gif"):
        frames = []
        for f in range(90):
            im = Image.new("RGBA", (800, 800), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
            for k in range(14, 0, -1):
                r = ((k * 30 + f * 4) % 420)
                col = (int(127 + 127 * math.sin(k + f / 10)), int(127 + 127 * math.sin(k * 1.3)), 255, 255 if k % 2 else 0)
                dr.ellipse([400 - r, 400 - r, 400 + r, 400 + r], outline=col, width=14)
            frames.append(im)
        save_anim(frames, big, 30, gif=True, webp=True)
    print("stickers done")


# ------------------------------------------------------------------ overlays and stills
def radial_alpha(w, h, inner=0.45, outer=0.95, strength=235):
    y, x = np.mgrid[0:h, 0:w]
    dx, dy = (x - w / 2) / (w / 2), (y - h / 2) / (h / 2)
    r = np.sqrt(dx * dx + dy * dy) / math.sqrt(2) * 1.414
    a = np.clip((r - inner) / (outer - inner), 0, 1) ** 1.6 * strength
    return a.astype(np.uint8)


def overlays():
    d = os.path.join(OUT, "overlays")
    os.makedirs(d, exist_ok=True)
    for name, (w, h) in (("vignette-wide", (1920, 1080)), ("vignette-tall", (1080, 1920)), ("vignette-square", (1080, 1080))):
        p = f"{d}/{name}.png"
        if not os.path.exists(p):
            a = radial_alpha(w, h)
            img = np.zeros((h, w, 4), np.uint8)
            img[..., 3] = a
            Image.fromarray(img, "RGBA").save(p, optimize=True)
    p = f"{d}/frame-film-tall.png"
    if not os.path.exists(p):
        im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
        dr.rectangle([0, 0, 110, 1920], fill=(15, 15, 15, 255)); dr.rectangle([970, 0, 1080, 1920], fill=(15, 15, 15, 255))
        for y in range(20, 1920, 90):
            dr.rounded_rectangle([30, y, 80, y + 50], 8, fill=(0, 0, 0, 0)); dr.rounded_rectangle([1000, y, 1050, y + 50], 8, fill=(0, 0, 0, 0))
        im.save(p, optimize=True)
    p = f"{d}/frame-polaroid.png"
    if not os.path.exists(p):
        im = Image.new("RGBA", (1000, 1200), (250, 248, 240, 255)); dr = ImageDraw.Draw(im)
        dr.rectangle([60, 60, 940, 940], fill=(0, 0, 0, 0))
        dr.text((500, 1060), "summer '44", font=ImageFont.truetype("C:/Windows/Fonts/segoepr.ttf", 72) if os.path.exists("C:/Windows/Fonts/segoepr.ttf") else font(60), anchor="mm", fill=(40, 40, 60, 255))
        im.save(p, optimize=True)
    p = f"{d}/grid-thirds.png"
    if not os.path.exists(p):
        im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
        for k in (1, 2):
            dr.line([1080 * k / 3, 0, 1080 * k / 3, 1920], fill=(255, 255, 255, 120), width=3)
            dr.line([0, 1920 * k / 3, 1080, 1920 * k / 3], fill=(255, 255, 255, 120), width=3)
        im.save(p, optimize=True)
    p = f"{d}/logo-badge.png"
    if not os.path.exists(p):
        im = Image.new("RGBA", (512, 512), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
        dr.ellipse([16, 16, 496, 496], fill=(255, 71, 87, 255)); dr.ellipse([56, 56, 456, 456], outline=(255, 255, 255, 255), width=10)
        dr.polygon([(200, 160), (200, 352), (360, 256)], fill=(255, 255, 255, 255))
        im.save(p, optimize=True)
    svgs = {
        "logo-badge.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="240" fill="#ff4757"/><circle cx="256" cy="256" r="200" fill="none" stroke="#fff" stroke-width="10"/><path d="M200 160v192l160-96z" fill="#fff"/></svg>',
        "map-pin.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><path d="M100 0C45 0 0 45 0 100c0 75 100 200 100 200s100-125 100-200C200 45 155 0 100 0z" fill="#e63946"/><circle cx="100" cy="100" r="40" fill="#fff"/></svg>',
        "arrow-right.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200"><path d="M0 70h420V0l180 100-180 100v-70H0z" fill="#ffd166" stroke="#000" stroke-width="6"/></svg>',
        "badge-new.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><polygon points="200,10 240,140 380,140 268,222 310,360 200,276 90,360 132,222 20,140 160,140" fill="#06d6a0" stroke="#073b4c" stroke-width="8"/><text x="200" y="230" font-family="Arial" font-weight="bold" font-size="80" text-anchor="middle" fill="#073b4c">NEW</text></svg>',
        "wave-divider.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="240" viewBox="0 0 1080 240"><path d="M0 120 C180 0 360 240 540 120 S900 0 1080 120 V240 H0z" fill="#118ab2"/></svg>',
    }
    for name, body in svgs.items():
        if not os.path.exists(f"{d}/{name}"):
            open(f"{d}/{name}", "w", encoding="utf-8").write(body)
    for name, (c1, c2), initials in (("avatar-host", ((255, 94, 98), (255, 195, 113)), "DH"), ("avatar-guest", ((43, 88, 118), (78, 67, 118)), "ZG")):
        p = f"{d}/{name}.png"
        if not os.path.exists(p):
            g = np.linspace(0, 1, 1024)[:, None, None]
            arr = (np.array(c1) * (1 - g) + np.array(c2) * g) * np.ones((1024, 1024, 3))
            im = Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")
            mask = Image.new("L", (1024, 1024), 0); ImageDraw.Draw(mask).ellipse([0, 0, 1023, 1023], fill=255)
            im.putalpha(mask)
            ImageDraw.Draw(im).text((512, 512), initials, font=font(380), anchor="mm", fill=(255, 255, 255, 235))
            im.save(p, optimize=True)
    for name, (w, h), cols in (("bg-sunset-4k", (3840, 2160), ((255, 94, 98), (40, 20, 80))), ("bg-ocean-tall", (1080, 1920), ((0, 180, 219), (0, 30, 80))),
                               ("bg-paper", (1920, 1080), ((240, 230, 210), (220, 205, 175)))):
        p = f"{d}/{name}.jpg"
        if not os.path.exists(p):
            g = np.linspace(0, 1, h)[:, None, None]
            arr = (np.array(cols[0]) * (1 - g) + np.array(cols[1]) * g) * np.ones((h, w, 3))
            arr += rng.normal(0, 6 if "paper" in name else 2, (h, w, 1))
            Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(p, quality=88)
    print("overlays done")


# ------------------------------------------------------------------ format torture media
def torture():
    d = os.path.join(OUT, "torture")
    os.makedirs(d, exist_ok=True)
    src = "testsrc2=s={s}:r={r}"
    jobs = [
        ("h264-4k60.mp4", ["-f", "lavfi", "-i", src.format(s="3840x2160", r=60), "-t", "5"], x264("", 30)[:-1]),
        ("hevc-1080p.mp4", ["-f", "lavfi", "-i", src.format(s="1920x1080", r=30), "-t", "6"], ["-c:v", "libx265", "-crf", "30", "-tag:v", "hvc1", "-pix_fmt", "yuv420p", "-x265-params", "log-level=error:pools=3", "-movflags", "+faststart"]),
        ("av1-1080p.mp4", ["-f", "lavfi", "-i", src.format(s="1920x1080", r=30), "-t", "6"], ["-c:v", "libsvtav1", "-crf", "40", "-preset", "10", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]),
        ("vp9-1080p.webm", ["-f", "lavfi", "-i", src.format(s="1920x1080", r=25), "-f", "lavfi", "-i", "sine=f=440:sample_rate=48000", "-t", "6"], ["-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0", "-row-mt", "1", "-threads", "3", "-c:a", "libopus", "-shortest"]),
        ("vp8-720p.webm", ["-f", "lavfi", "-i", src.format(s="1280x720", r=30), "-t", "6"], ["-c:v", "libvpx", "-crf", "20", "-b:v", "1M", "-threads", "3"]),
        ("vp9-alpha.webm", ["-f", "lavfi", "-i", "color=c=red@0.5:s=640x640:r=30,format=rgba,geq=r='255*X/W':g='255*Y/H':b=128:a='255*abs(sin(T+X/80))'", "-t", "4"], ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "35", "-b:v", "0", "-auto-alt-ref", "0"]),
        ("h264-rotated-90.mp4", ["-f", "lavfi", "-i", src.format(s="1280x720", r=30), "-t", "6"], x264("", 28)[:-1] + ["-metadata:s:v:0", "rotate=90"]),
        ("mov-h264.mov", ["-f", "lavfi", "-i", src.format(s="1280x720", r=24), "-f", "lavfi", "-i", "sine=f=330:sample_rate=48000", "-t", "6"], ["-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]),
        ("prores-422.mov", ["-f", "lavfi", "-i", src.format(s="640x360", r=25), "-t", "3"], ["-c:v", "prores_ks", "-profile:v", "2"]),
        ("m4v-sd.m4v", ["-f", "lavfi", "-i", src.format(s="720x480", r="30000/1001"), "-t", "6"], ["-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p"]),
        ("h264-high10.mp4", ["-f", "lavfi", "-i", src.format(s="1280x720", r=30), "-t", "4"], ["-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p10le", "-profile:v", "high10"]),
        ("h264-odd-1278x718.mp4", ["-f", "lavfi", "-i", src.format(s="1278x718", r=30), "-t", "5"], ["-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p"]),
        ("h264-tiny-64.mp4", ["-f", "lavfi", "-i", src.format(s="64x64", r=30), "-t", "5"], ["-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p"]),
        ("h264-ultrawide-3000x200.mp4", ["-f", "lavfi", "-i", src.format(s="3000x200", r=30), "-t", "5"], ["-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p"]),
        ("h264-one-frame.mp4", ["-f", "lavfi", "-i", src.format(s="1280x720", r=30), "-frames:v", "1"], ["-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p"]),
        ("h264-vfr.mp4", ["-f", "lavfi", "-i", src.format(s="1280x720", r=60), "-t", "6", "-vf", "select='not(mod(n\\,3))+gt(mod(n\\,7)\\,4)'", "-fps_mode", "vfr"], ["-c:v", "libx264", "-crf", "28", "-pix_fmt", "yuv420p"]),
        ("h264-allintra.mp4", ["-f", "lavfi", "-i", src.format(s="1920x1080", r=30), "-t", "4"], ["-c:v", "libx264", "-crf", "30", "-g", "1", "-pix_fmt", "yuv420p"]),
        ("h264-longgop-300.mp4", ["-f", "lavfi", "-i", src.format(s="1920x1080", r=30), "-t", "12"], ["-c:v", "libx264", "-crf", "30", "-g", "300", "-bf", "3", "-pix_fmt", "yuv420p"]),
        ("h264-8k-2s.mp4", ["-f", "lavfi", "-i", src.format(s="7680x4320", r=24), "-t", "2"], ["-c:v", "libx264", "-crf", "34", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-threads", "3"]),
        ("audio-only.mp4", ["-f", "lavfi", "-i", "sine=f=523:sample_rate=48000", "-t", "6"], ["-c:a", "aac", "-b:a", "96k"]),
    ]
    for name, inputs, enc in jobs:
        out = f"{d}/{name}"
        if os.path.exists(out):
            continue
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs, *[e for e in enc if e], out]
        if sh(cmd):
            print("torture", name)
    # audio formats and rates
    aud = [
        ("wav-8bit-8k-mono.wav", ["-ar", "8000", "-ac", "1", "-c:a", "pcm_u8"]),
        ("wav-24bit-96k-stereo.wav", ["-ar", "96000", "-ac", "2", "-c:a", "pcm_s24le"]),
        ("wav-float32-48k.wav", ["-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le"]),
        ("mp3-vbr-44k.mp3", ["-ar", "44100", "-c:a", "libmp3lame", "-q:a", "4"]),
        ("mp3-cbr-22k-mono.mp3", ["-ar", "22050", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k"]),
        ("ogg-vorbis.ogg", ["-ar", "44100", "-c:a", "libvorbis", "-q:a", "4"]),
        ("ogg-opus.ogg", ["-c:a", "libopus", "-b:a", "96k"]),
        ("m4a-aac.m4a", ["-c:a", "aac", "-b:a", "128k"]),
        ("aac-adts.aac", ["-c:a", "aac", "-b:a", "96k"]),
        ("wav-6ch-51.wav", ["-ac", "6", "-ar", "48000", "-c:a", "pcm_s16le"]),
    ]
    for name, enc in aud:
        out = f"{d}/{name}"
        if not os.path.exists(out):
            sh(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=220:sample_rate=48000,aformat=channel_layouts=stereo", "-f", "lavfi",
                "-i", "sine=f=330:sample_rate=48000:beep_factor=2", "-filter_complex", "[0][1]amix=inputs=2,volume=2", "-t", "8", *enc, out])
    # images
    imgs = {
        "png-16bit.png": lambda: Image.fromarray((np.linspace(0, 65535, 1024 * 768).reshape(768, 1024)).astype(np.uint16), "I;16"),
        "png-alpha-gradient.png": lambda: Image.fromarray(np.dstack([np.full((800, 800), 255, np.uint8), np.tile(np.linspace(0, 255, 800, dtype=np.uint8), (800, 1)), np.full((800, 800), 80, np.uint8), np.tile(np.linspace(255, 0, 800, dtype=np.uint8)[:, None], (1, 800))]), "RGBA"),
        "png-1x1.png": lambda: Image.new("RGB", (1, 1), (255, 0, 255)),
        "png-huge-8192.png": lambda: Image.fromarray((np.indices((8192 // 16, 8192 // 16)).sum(axis=0) % 2 * 200 + 30).astype(np.uint8).repeat(16, 0).repeat(16, 1), "L"),
        "jpg-progressive.jpg": lambda: Image.open(os.path.join(OUT, "overlays", "bg-sunset-4k.jpg")),
        "webp-lossless-alpha.webp": lambda: Image.open(os.path.join(OUT, "overlays", "logo-badge.png")),
        "gif-static.gif": lambda: Image.open(os.path.join(OUT, "overlays", "logo-badge.png")).convert("RGB").convert("P", palette=Image.ADAPTIVE),
        "jpg-cmyk.jpg": lambda: Image.open(os.path.join(OUT, "overlays", "bg-paper.jpg")).convert("CMYK"),
    }
    for name, make in imgs.items():
        out = f"{d}/{name}"
        if os.path.exists(out):
            continue
        im = make()
        if name.endswith(".jpg"):
            im.save(out, quality=85, progressive="progressive" in name)
        elif name.endswith(".webp"):
            im.save(out, lossless=True)
        else:
            im.save(out, optimize=True)
    out = f"{d}/jpg-exif-rotated.jpg"
    if not os.path.exists(out):
        im = Image.new("RGB", (1200, 800), (30, 120, 200)); ImageDraw.Draw(im).text((600, 400), "TOP (EXIF 6)", font=font(120), anchor="mm", fill="white")
        exif = Image.Exif(); exif[0x0112] = 6
        im.save(out, quality=88, exif=exif.tobytes())
    print("torture done")


if "mg" in GROUPS:
    mg()
if "counters" in GROUPS:
    counters()
if "stickers" in GROUPS:
    stickers()
if "overlays" in GROUPS:
    overlays()
if "torture" in GROUPS:
    torture()

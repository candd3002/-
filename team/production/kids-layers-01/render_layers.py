"""Kids experiment short: liquid layers (idea 1 from Hassan).

Silent, on-screen captions only. Safe: water, oil, food colouring.
PIL draws each frame, ffmpeg encodes it at 1080x1920, 30 fps.
"""
import math
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SECONDS = 1080, 1920, 30, 30
OUT = sys.argv[1]
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

BG_TOP = (255, 214, 102)
BG_BOT = (255, 140, 120)
INK = (40, 30, 50)
GLASS = (230, 245, 255)
WATER = (60, 150, 235)
OIL = (255, 196, 60)
DROP_COLORS = [(230, 60, 90), (90, 200, 120), (150, 90, 230)]

f_title = ImageFont.truetype(FONT_B, 92)
f_cap = ImageFont.truetype(FONT_B, 64)
f_small = ImageFont.truetype(FONT, 50)

JAR = (240, 1100, 840, 1640)  # x0, y0, x1, y1
INNER = (262, 1120, 818, 1620)
BOTTOM = INNER[3]
TOP = INNER[1]


def gradient():
    img = Image.new("RGB", (W, H), BG_TOP)
    d = ImageDraw.Draw(img)
    for y in range(H):
        k = y / H
        c = tuple(int(BG_TOP[i] * (1 - k) + BG_BOT[i] * k) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    return img


BASE = gradient()


def caption_block(d, lines):
    y = 300
    for text, font, fill in lines:
        d.multiline_text((90, y), text, font=font, fill=fill, spacing=10)
        y += font.size * (len(text.split("\n")) + 0.4) + 20


def drop(d, x, y, r, color):
    d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def frame(t):
    img = BASE.copy()
    d = ImageDraw.Draw(img)

    if t < 4:
        caption_block(d, [("Layers of Colors!", f_title, INK), ("Watch the liquids stack up.", f_small, INK)])
    elif t < 27:
        caption_block(d, [(cap_for(t), f_cap, INK)])

    # Jar: glass outline
    d.rounded_rectangle(JAR, radius=60, fill=GLASS, outline=INK, width=8)
    d.rounded_rectangle(INNER, radius=40, fill=(250, 252, 255))

    # Fill levels, water first, then oil on top. Heights ease in.
    span = INNER[3] - INNER[1]
    water_h = span * 0.42 * ease(t, 4, 11)
    oil_h = span * 0.22 * ease(t, 11, 17)
    if water_h > 0:
        d.rectangle([INNER[0], BOTTOM - water_h, INNER[2], BOTTOM], fill=WATER)
    if oil_h > 0:
        top_of_water = BOTTOM - water_h
        d.rectangle([INNER[0], top_of_water - oil_h, INNER[2], top_of_water], fill=OIL)

    # Coloured drops fall in and settle into the layers (17 to 25 s).
    if 17 <= t < 26:
        for i, col in enumerate(DROP_COLORS):
            p = min(1.0, (t - 17 - i * 0.6) / 3.0)
            if p <= 0:
                continue
            y_start = INNER[1] + 40
            if i == 0:
                y_end = BOTTOM - 80  # sinks into water
            elif i == 1:
                y_end = BOTTOM - water_h - 120  # rests at the water/oil edge
            else:
                y_end = INNER[1] + 90  # floats near the top
            y = y_start + (y_end - y_start) * p
            drop(d, INNER[0] + 180 + i * 180, y, 34, col)

    # Gentle bubbles rising for life.
    for k in range(6):
        p = (t * 0.2 + k / 6) % 1.0
        x = INNER[0] + 90 + k * 110 + math.sin(t * 2 + k) * 14
        y = BOTTOM - 20 - p * (span * 0.6)
        d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=(255, 255, 255), width=4)

    if t >= 27:
        caption_block(d, [("Ask a grown-up", f_title, INK), ("to help with experiments!", f_small, INK)])

    return img


def ease(t, a, b):
    if t <= a:
        return 0.0
    if t >= b:
        return 1.0
    x = (t - a) / (b - a)
    return x * x * (3 - 2 * x)


def cap_for(t):
    if t < 11:
        return "Pour in water first."
    if t < 17:
        return "Then pour in\noil."
    if t < 21:
        return "Oil is lighter,\nso it floats on top."
    if t < 26:
        return "Drops settle where\nthey are lighter or heavier."
    return "Ask a grown-up to help!"


def main():
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
        "-movflags", "+faststart", OUT,
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(SECONDS * FPS):
        p.stdin.write(frame(n / FPS).tobytes())
    p.stdin.close()
    p.wait()
    print("wrote", OUT, "exit", p.returncode)


if __name__ == "__main__":
    main()

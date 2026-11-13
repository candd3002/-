"""Render v2 of the octopus short from the writer's script.

Changes from v1 (no new tools, PIL + ffmpeg only):
- Octopus body with curved tentacles and eyes.
- Blood as moving dots: blue-ish for deoxygenated flow to the gills,
  red for oxygenated flow from the gills to the body (as in the script).
- Captions unchanged in timing and wrapping.
Still silent: no voiceover until a TTS model is approved.
"""
import math
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1080, 1920, 24
OUT = sys.argv[1]
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

BG = (14, 22, 30)
INK = (240, 244, 247)
MUTED = (150, 170, 185)
TEAL = (64, 190, 170)
RED = (226, 92, 96)
BLUE = (96, 150, 235)
BODY = (84, 116, 142)
BODY_DARK = (58, 84, 106)

# (start, end, caption, sub-caption), same timing as the script
SEGMENTS = [
    (0, 3, "An octopus has three hearts.", "And its blood is blue."),
    (3, 15, "Two branchial hearts", "pump blood through the gills."),
    (15, 30, "The third, systemic heart", "sends oxygen-rich blood to the body."),
    (30, 40, "Why blue?", "Hemocyanin, a copper-based protein, carries oxygen."),
    (40, 45, "Follow for a new explainer", "every week."),
]

f_big = ImageFont.truetype(FONT_B, 66)
f_small = ImageFont.truetype(FONT, 50)
f_tag = ImageFont.truetype(FONT_B, 40)

OCT_X, OCT_Y = W // 2, 700
GILL_L, GILL_R = (330, 1000), (750, 1000)
BODY_HEART = (W // 2, 1180)


def heart_points(cx, cy, size):
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 120
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * size / 16, cy + y * size / 16))
    return pts


def octopus(d, t):
    # Mantle (head) with a soft shade on the lower edge.
    d.ellipse([OCT_X - 170, OCT_Y - 210, OCT_X + 170, OCT_Y + 70], fill=BODY)
    d.ellipse([OCT_X - 150, OCT_Y - 150, OCT_X + 150, OCT_Y + 20], fill=BODY)
    # Eyes.
    for ex in (OCT_X - 60, OCT_X + 60):
        d.ellipse([ex - 22, OCT_Y - 60, ex + 22, OCT_Y - 16], fill=INK)
        d.ellipse([ex - 9, OCT_Y - 50, ex + 2, OCT_Y - 37], fill=BG)
    # Eight tentacles: curved lines that sway over time.
    for i in range(8):
        bx = OCT_X - 150 + i * 43
        pts = []
        for s in range(0, 21):
            u = s / 20
            sway = math.sin(t * 2.2 + i * 0.7 + u * 3) * (18 + 30 * u)
            pts.append((bx + sway, OCT_Y + 40 + u * 230))
        d.line(pts, fill=BODY_DARK, width=20, joint="curve")


def flow_dots(d, t, a, b, color, count=7, speed=0.35):
    # Dots moving along a straight path from a to b, looping.
    for k in range(count):
        p = (t * speed + k / count) % 1.0
        x = a[0] + (b[0] - a[0]) * p
        y = a[1] + (b[1] - a[1]) * p
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=color)


def frame(t):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    seg = next((s for s in SEGMENTS if s[0] <= t < s[1]), SEGMENTS[-1])
    _, _, cap, sub = seg
    pulse = 1 + 0.06 * math.sin(t * 6)

    octopus(d, t)

    if t < 3:
        # Three hearts appear together as the hook.
        for x, y in ((330, 1000), (750, 1000), (540, 1180)):
            d.polygon(heart_points(x, y, 80 * pulse), fill=RED)
    elif t < 15:
        # Gill hearts beat; blue blood flows toward them from the body.
        flow_dots(d, t, (OCT_X, 1180), GILL_L, BLUE)
        flow_dots(d, t, (OCT_X, 1180), GILL_R, BLUE)
        for x, y in GILL_L, GILL_R:
            d.polygon(heart_points(x, y, 80 * pulse), fill=RED)
    elif t < 30:
        # Oxygenated red flow leaves the gills toward the body heart.
        flow_dots(d, t, GILL_L, BODY_HEART, RED, speed=0.4)
        flow_dots(d, t, GILL_R, BODY_HEART, RED, speed=0.4)
        for x, y in GILL_L, GILL_R:
            d.polygon(heart_points(x, y, 70 * pulse), fill=RED)
        d.polygon(heart_points(BODY_HEART[0], BODY_HEART[1], 110 * pulse), fill=RED)
    elif t < 40:
        # Blue colour of the blood, the copper protein.
        d.polygon(heart_points(BODY_HEART[0], BODY_HEART[1], 100 * pulse), fill=BLUE)
        flow_dots(d, t, GILL_L, BODY_HEART, BLUE, speed=0.4)
        flow_dots(d, t, GILL_R, BODY_HEART, BLUE, speed=0.4)
    else:
        d.ellipse([W // 2 - 220, 640, W // 2 + 220, 1080], outline=TEAL, width=14)

    cap_lines = sub_wrap(cap, 20).split("\n")
    d.multiline_text((90, 1400), "\n".join(cap_lines), font=f_big, fill=INK, spacing=10)
    sub_y = 1400 + len(cap_lines) * 92 + 30
    d.multiline_text((90, sub_y), sub_wrap(sub), font=f_small, fill=MUTED, spacing=14)
    d.text((90, 150), "Octopus biology", font=f_tag, fill=TEAL)
    return img


def sub_wrap(text, width=28):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    lines.append(cur)
    return "\n".join(lines)


def main():
    total = 45
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "medium",
        "-movflags", "+faststart", OUT,
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for n in range(total * FPS):
        p.stdin.write(frame(n / FPS).tobytes())
    p.stdin.close()
    p.wait()
    print("wrote", OUT, "exit", p.returncode)


if __name__ == "__main__":
    main()

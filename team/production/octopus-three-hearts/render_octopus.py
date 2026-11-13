"""Render the first short (octopus three hearts) from the writer's script.

Silent cut with on-screen captions: no voiceover yet (no TTS tool is approved).
Frames are drawn with PIL and piped straight into ffmpeg.
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

# (start, end, caption, sub-caption) following the script's timestamps
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


def heart_points(cx, cy, size):
    pts = []
    for i in range(120):
        t = 2 * math.pi * i / 120
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        pts.append((cx + x * size / 16, cy + y * size / 16))
    return pts


def draw_octopus(d, cx, cy, t):
    # Head (mantle) and tentacles, drawn as simple shapes.
    d.ellipse([cx - 150, cy - 190, cx + 150, cy + 60], fill=(70, 96, 120))
    for i in range(8):
        base_x = cx - 140 + i * 40
        wave = math.sin(t * 2 + i) * 18
        d.line([(base_x, cy + 40), (base_x + wave, cy + 130), (base_x - wave / 2, cy + 200)],
               fill=(70, 96, 120), width=22)


def frame(t):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Caption block, chosen by time.
    seg = next((s for s in SEGMENTS if s[0] <= t < s[1]), SEGMENTS[-1])
    _, _, cap, sub = seg

    # Pulsing hearts for the heart segments, octopus otherwise.
    pulse = 1 + 0.06 * math.sin(t * 6)
    if 0 <= t < 3 or 30 <= t < 40:
        draw_octopus(d, W // 2, 760, t)
        # Three heart markers: two gill hearts, one body heart, with pulse.
        if 0 <= t < 3:
            for x in (360, 720, 540):
                d.polygon(heart_points(x, 1080, 90 * pulse), fill=RED)
        else:
            # 30-40s: the blue-blood beat, shown on the octopus itself.
            d.polygon(heart_points(W // 2, 1080, 100 * pulse), fill=BLUE)
    elif 3 <= t < 15:
        draw_octopus(d, W // 2, 760, t)
        for x in (330, 750):
            d.polygon(heart_points(x, 1080, 80 * pulse), fill=RED)
        d.rounded_rectangle([160, 1010, 920, 1020], radius=5, fill=TEAL)
    elif 15 <= t < 30:
        draw_octopus(d, W // 2, 760, t)
        d.polygon(heart_points(W // 2, 1080, 110 * pulse), fill=RED)
        d.line([(W // 2, 1190), (W // 2, 1400)], fill=BLUE, width=12)
    else:
        d.ellipse([W // 2 - 220, 640, W // 2 + 220, 1080], outline=TEAL, width=14)

    # Text block, bottom third (captions must read without sound).
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

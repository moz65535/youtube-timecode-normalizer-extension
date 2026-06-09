import math
import struct
import zlib
from pathlib import Path


def write_png(path, width, height, pixels):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        row = pixels[y * width : (y + 1) * width]
        for r, g, b, a in row:
            raw.extend((r, g, b, a))

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def blend(bg, fg, alpha):
    return tuple(round(bg[i] * (1 - alpha) + fg[i] * alpha) for i in range(3)) + (255,)


def icon(size):
    scale = 4
    canvas = size * scale
    pixels = []
    center = (canvas - 1) / 2
    radius = canvas * 0.43
    face = (17, 126, 122)
    edge = (9, 81, 96)
    hand = (255, 255, 255)
    accent = (255, 210, 77)
    transparent = (0, 0, 0, 0)

    hi = [[transparent for _ in range(canvas)] for _ in range(canvas)]
    for y in range(canvas):
      for x in range(canvas):
        dx = x - center
        dy = y - center
        dist = math.hypot(dx, dy)
        if dist <= radius:
            shade = max(0, min(1, (dy / radius + 1) / 2))
            base = blend(face, edge, shade * 0.25)
            hi[y][x] = base
        if radius * 0.78 <= dist <= radius * 0.94 and abs(dx) < radius * 0.95:
            hi[y][x] = (*accent, 255)

    def draw_line(angle, length, thickness, color):
        end_x = center + math.cos(angle) * length
        end_y = center + math.sin(angle) * length
        steps = max(1, int(length * 2))
        for i in range(steps + 1):
            t = i / steps
            px = center + (end_x - center) * t
            py = center + (end_y - center) * t
            min_x = max(0, int(px - thickness - 1))
            max_x = min(canvas - 1, int(px + thickness + 1))
            min_y = max(0, int(py - thickness - 1))
            max_y = min(canvas - 1, int(py + thickness + 1))
            for yy in range(min_y, max_y + 1):
                for xx in range(min_x, max_x + 1):
                    if math.hypot(xx - px, yy - py) <= thickness:
                        hi[yy][xx] = (*color, 255)

    draw_line(-math.pi / 2, radius * 0.45, canvas * 0.025, hand)
    draw_line(-0.05, radius * 0.62, canvas * 0.025, hand)

    for y in range(canvas):
        for x in range(canvas):
            if math.hypot(x - center, y - center) <= canvas * 0.055:
                hi[y][x] = (*hand, 255)

    for y in range(size):
        for x in range(size):
            samples = [hi[y * scale + sy][x * scale + sx] for sy in range(scale) for sx in range(scale)]
            r = sum(p[0] for p in samples) // len(samples)
            g = sum(p[1] for p in samples) // len(samples)
            b = sum(p[2] for p in samples) // len(samples)
            a = sum(p[3] for p in samples) // len(samples)
            pixels.append((r, g, b, a))

    return pixels


out = Path("extension/icons")
out.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    write_png(out / f"icon-{size}.png", size, size, icon(size))

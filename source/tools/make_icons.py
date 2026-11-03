"""生成 iOS 主屏幕图标（apple-touch-icon 必须是 PNG，SVG 不被接受）。

不依赖任何第三方库：纯 stdlib 逐像素绘制 + zlib/struct 写 PNG。
图形：深色圆角方块 + 一段绿色渐变圆环 + 三道横线（污染物条）。
"""

import math
import struct
import zlib
import os

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def rounded_rect_alpha(x, y, size, radius):
    """返回 (x,y) 像素在圆角矩形内的覆盖率 0..1（1 像素抗锯齿）。"""
    def edge(px, py):
        # 到圆角矩形边界的有符号距离，内部为正
        cx = min(max(px, radius), size - radius)
        cy = min(max(py, radius), size - radius)
        dx = px - cx
        dy = py - cy
        return radius - math.hypot(dx, dy) if (dx or dy) else size

    d = edge(x + 0.5 - 0.0, y + 0.5 - 0.0)
    return max(0.0, min(1.0, d + 0.5))


def ring_coverage(x, y, cx, cy, r, thickness):
    d = math.hypot(x - cx, y - cy)
    half = thickness / 2.0
    return max(0.0, min(1.0, half - abs(d - r) + 0.5))


def arc_mask(x, y, cx, cy, start_deg, end_deg):
    """只保留 [start_deg, end_deg] 的扇区（角度按屏幕坐标，0 度指向右，顺时针）。"""
    ang = math.degrees(math.atan2(y - cy, x - cx))
    if ang < 0:
        ang += 360
    if start_deg <= end_deg:
        return start_deg <= ang <= end_deg
    return ang >= start_deg or ang <= end_deg


def hbar_coverage(x, y, x0, x1, yc, thickness):
    if not (x0 - 0.5 <= x <= x1 + 0.5):
        return 0.0
    half = thickness / 2.0
    v = half - abs(y - yc) + 0.5
    edge = min(x - (x0 - 0.5), (x1 + 0.5) - x) + 0.5
    return max(0.0, min(1.0, min(v, edge)))


def render(size):
    cx = cy = size / 2.0
    radius = size * 0.2188          # iOS 图标圆角约 22.37% → 用 21.9% 接近
    ring_r = size * 0.3203
    ring_t = size * 0.0508

    bg_top = (0x17, 0x1A, 0x22)
    bg_bot = (0x08, 0x09, 0x0B)
    green = (0x2E, 0xE0, 0x6A)
    green_hi = (0x43, 0xF0, 0x7E)
    yellow = (0xF2, 0xD0, 0x24)

    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type 0
        vt = y / max(1, size - 1)
        bg = lerp(bg_top, bg_bot, vt)
        for x in range(size):
            a = rounded_rect_alpha(x, y, size, radius)
            if a <= 0:
                row += bytes((0, 0, 0, 0))
                continue

            r, g, b = bg

            # 圆环：从 135° 顺时针到 45°（即缺口在正下方）
            rc = ring_coverage(x + 0.5, y + 0.5, cx, cy, ring_r, ring_t)
            if rc > 0 and arc_mask(x + 0.5, y + 0.5, cx, cy, 135, 45):
                ang = math.degrees(math.atan2(y + 0.5 - cy, x + 0.5 - cx))
                if ang < 0:
                    ang += 360
                # 沿弧长做黄 → 绿渐变
                t = ((ang - 135) % 360) / 270.0
                col = lerp(yellow, green_hi, clamp01(t * 1.6))
                col = lerp(col, green, clamp01((t - 0.55) * 2.2))
                r = int(r + (col[0] - r) * rc)
                g = int(g + (col[1] - g) * rc)
                b = int(b + (col[2] - b) * rc)

            # 中心三道横线，长短递减，模拟污染物条
            bars = [
                (-size * 0.152, size * 0.152, -size * 0.098),
                (-size * 0.109, size * 0.109, 0.0),
                (-size * 0.066, size * 0.066, size * 0.098),
            ]
            for x0f, x1f, ycf in bars:
                hc = hbar_coverage(x + 0.5, y + 0.5, cx + x0f, cx + x1f, cy + ycf, size * 0.043)
                if hc > 0:
                    r = int(r + (green[0] - r) * hc)
                    g = int(g + (green[1] - g) * hc)
                    b = int(b + (green[2] - b) * hc)

            row += bytes((r, g, b, int(round(255 * a))))
        rows.append(bytes(row))

    return b"".join(rows)


def clamp01(v):
    return max(0.0, min(1.0, v))


def write_png(path, size, raw):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    idat = zlib.compress(raw, 9)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
           + chunk(b"IDAT", idat) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    return len(png)


def main():
    for size, name in ((192, "icon-192.png"), (512, "icon-512.png")):
        raw = render(size)
        path = os.path.join(OUT_DIR, name)
        n = write_png(path, size, raw)
        print(f"{name}: {size}x{size}, {n} bytes -> {path}")


if __name__ == "__main__":
    main()

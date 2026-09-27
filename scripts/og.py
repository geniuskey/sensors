from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
FONTS = Path(__file__).resolve().parent/'fonts'
BG, PANEL, INK, MUTED, ACCENT, LINE = '#0b1220', '#131c2e', '#f1f5f9', '#94a3b8', '#38bdf8', '#26324a'
PALETTE = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#facc15']
_cache = {}

def mix(a, b, t):
    rgb = lambda c: [int(c[i:i+2], 16) for i in (1, 3, 5)]
    return tuple(round(x*t+y*(1-t)) for x, y in zip(rgb(a), rgb(b)))

def font(weight, size):
    key = (weight, size)
    if key not in _cache: _cache[key] = ImageFont.truetype(str(FONTS/f'Inter-{weight}.ttf'), size)
    return _cache[key]

def fit(draw, text, weight, size, max_w, min_size=28):
    while size > min_size and draw.textlength(text, font=font(weight, size)) > max_w: size -= 2
    f = font(weight, size)
    while draw.textlength(text, font=f) > max_w and len(text) > 4: text = text[:-2].rstrip()+'…'
    return text, f

def wrap(draw, text, f, max_w, max_lines):
    out, cur = [], ''
    for word in text.split():
        nxt = f'{cur} {word}'.strip()
        if cur and draw.textlength(nxt, font=f) > max_w:
            out.append(cur); cur = word
        else: cur = nxt
    out.append(cur)
    if len(out) > max_lines:
        out = out[:max_lines]; out[-1] = out[-1].rstrip('.,')+'…'
    return out

def sensors_panel(draw, rects, box):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, 28, fill=PANEL)
    if not rects: return
    ref = max(max(w for _, w, _ in rects), 13.2)
    scale = min((x1-x0-80)/ref, (y1-y0-110)/max(max(h for _, _, h in rects), 8.8))
    cx, cy = (x0+x1)/2, (y0+y1)/2-18
    rw, rh = 13.2*scale, 8.8*scale
    for i, (label, w, h) in sorted(enumerate(rects), key=lambda t: -t[1][1]*t[1][2]):
        c = PALETTE[i % len(PALETTE)]
        draw.rectangle((cx-w*scale/2, cy-h*scale/2, cx+w*scale/2, cy+h*scale/2), fill=mix(c, PANEL, .22), outline=c, width=4)
    draw.rectangle((cx-rw/2, cy-rh/2, cx+rw/2, cy+rh/2), outline='#64748b', width=2)
    top = max(rh, max(h for _, _, h in rects)*scale)/2
    draw.text((cx-rw/2, cy-top-10), '1" type', font=font('Medium', 20), fill='#64748b', anchor='ld')
    legend = '  ·  '.join(f'{w:.1f}×{h:.1f} mm' for _, w, h in rects[:3])
    legend, f = fit(draw, legend, 'Medium', 22, x1-x0-48, 16)
    draw.text(((x0+x1)/2, y1-38), legend, font=f, fill=MUTED, anchor='mm')

def render(out, kicker, title, lines, rects, footer='sensors.euiyun.com'):
    img = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 8), fill=ACCENT)
    left_w = 640 if rects else 1080
    d.text((64, 72), kicker.upper(), font=font('Bold', 26), fill=ACCENT)
    titles = title if isinstance(title, list) else [title]
    size = 76 if len(titles) == 1 else 58
    y = 112
    for t in titles:
        t, f = fit(d, t, 'ExtraBold', size, left_w, 40)
        d.text((64, y), t, font=f, fill=INK); y += f.size+8
    y += 32
    for text, strong in lines[:5]:
        lf = font('Bold' if strong else 'Medium', 32 if strong else 28)
        for row in (wrap(d, text, lf, left_w, 2) if strong else [fit(d, text, 'Medium', 28, left_w, 28)[0]]):
            if y > H-150: break
            d.text((64, y), row, font=lf, fill=INK if strong else MUTED); y += lf.size+14
        y += 6
    d.text((64, H-72), footer, font=font('Bold', 26), fill=INK)
    d.text((64+d.textlength(footer, font=font('Bold', 26))+16, H-72), 'Mobile Image Sensor Database', font=font('Medium', 26), fill=MUTED)
    if rects: sensors_panel(d, rects, (744, 64, W-64, H-120))
    out.parent.mkdir(parents=True, exist_ok=True)
    img.quantize(64, method=Image.Quantize.MEDIANCUT).save(out, 'PNG')

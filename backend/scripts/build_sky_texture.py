"""Перепроецирование ночного неба участка в небесные координаты ICRF для любой точки Марса."""

import json
import math
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from PIL import Image

OUT_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "data" / "sky"
OUT_W, OUT_H = 2048, 1024
GAMMA = 2.6
D2R = math.pi / 180


def read_hdr(path: Path) -> np.ndarray:
    data = path.read_bytes()
    pos = 0
    while True:
        end = data.index(b"\n", pos)
        line = data[pos:end]
        pos = end + 1
        if line == b"":
            break
    dims = data[pos : data.index(b"\n", pos)].decode()
    pos = data.index(b"\n", pos) + 1
    parts = dims.split()
    height, width = int(parts[1]), int(parts[3])
    raw = np.zeros((height, width, 4), dtype=np.uint8)
    for y in range(height):
        if not (data[pos] == 2 and data[pos + 1] == 2):
            raise ValueError("ожидается RLE-строка Radiance")
        pos += 4
        for channel in range(4):
            x = 0
            while x < width:
                count = data[pos]
                pos += 1
                if count > 128:
                    raw[y, x : x + count - 128, channel] = data[pos]
                    pos += 1
                    x += count - 128
                else:
                    chunk = np.frombuffer(data[pos : pos + count], dtype=np.uint8)
                    raw[y, x : x + count, channel] = chunk
                    pos += count
                    x += count
    exponent = raw[:, :, 3].astype(np.int32)
    scale = np.where(exponent > 0, np.ldexp(1.0, exponent - 136), 0.0)
    return raw[:, :, :3].astype(np.float32) * scale[:, :, None]


def icrf_to_enu(utc_iso: str, lat_deg: float, lon_east_deg: float) -> np.ndarray:
    moment = datetime.fromisoformat(utc_iso).replace(tzinfo=UTC)
    jd_tt = 2440587.5 + moment.timestamp() / 86400.0 + 69.184 / 86400.0
    days = jd_tt - 2451545.0
    centuries = days / 36525.0
    ra_pole = (317.68143 - 0.1061 * centuries) * D2R
    dec_pole = (52.88650 - 0.0609 * centuries) * D2R
    prime = (176.630 + 350.89198226 * days) % 360 * D2R

    def rot_z(angle: float) -> np.ndarray:
        c, s = math.cos(angle), math.sin(angle)
        return np.array([[c, s, 0.0], [-s, c, 0.0], [0.0, 0.0, 1.0]])

    def rot_x(angle: float) -> np.ndarray:
        c, s = math.cos(angle), math.sin(angle)
        return np.array([[1.0, 0.0, 0.0], [0.0, c, s], [0.0, -s, c]])

    body = rot_z(prime) @ rot_x(math.pi / 2 - dec_pole) @ rot_z(math.pi / 2 + ra_pole)
    phi, lam = lat_deg * D2R, lon_east_deg * D2R
    up = np.array(
        [math.cos(phi) * math.cos(lam), math.cos(phi) * math.sin(lam), math.sin(phi)]
    )
    east = np.array([-math.sin(lam), math.cos(lam), 0.0])
    north = np.array(
        [-math.sin(phi) * math.cos(lam), -math.sin(phi) * math.sin(lam), math.cos(phi)]
    )
    return np.vstack([east, north, up]) @ body


def main() -> int:
    hdr_path = Path(sys.argv[1])
    meta_path = Path(sys.argv[2])
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    sky = read_hdr(hdr_path)
    src_h, src_w = sky.shape[:2]
    matrix = icrf_to_enu(meta["utc"], meta["lat_deg"], meta["lon_deg"])

    ra = (np.arange(OUT_W) + 0.5) / OUT_W * 2 * math.pi
    dec = math.pi / 2 - (np.arange(OUT_H) + 0.5) / OUT_H * math.pi
    ra_grid, dec_grid = np.meshgrid(ra, dec)
    vec = np.stack(
        [
            np.cos(dec_grid) * np.cos(ra_grid),
            np.cos(dec_grid) * np.sin(ra_grid),
            np.sin(dec_grid),
        ],
        axis=-1,
    )
    enu = vec @ matrix.T
    alt = np.arcsin(np.clip(enu[..., 2], -1.0, 1.0))
    az = np.degrees(np.arctan2(enu[..., 0], enu[..., 1])) % 360
    src_u = ((az + 90.0) % 360.0) / 360.0 * src_w
    src_v = (0.5 - alt / math.pi) * src_h
    xi = np.clip(src_u.astype(np.int64), 0, src_w - 1)
    yi = np.clip(src_v.astype(np.int64), 0, src_h - 1)
    sample = sky[yi, xi]
    for dy in (0, 1):
        for dx in (0, 1):
            if dy == 0 and dx == 0:
                continue
            sample = np.maximum(sample, sky[np.clip(yi + dy, 0, src_h - 1), (xi + dx) % src_w])

    peak = float(np.percentile(sample, 99.98))
    encoded = np.clip(sample / max(peak, 1e-9), 0.0, 1.0) ** (1.0 / GAMMA)
    image = Image.fromarray((encoded * 255.0 + 0.5).astype(np.uint8), mode="RGB")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUT_DIR / "milkyway_icrf.webp", quality=92, method=6)

    band = float(np.median(sample.mean(axis=2)))
    (OUT_DIR / "sky.json").write_text(
        json.dumps(
            {
                "file": "milkyway_icrf.webp",
                "width": OUT_W,
                "height": OUT_H,
                "frame": (
                    "ICRF, экваториальные J2000: столбец 0 — прямое восхождение 0h, "
                    "строка 0 — склонение +90 градусов"
                ),
                "encoding": f"яркость = (значение/255)^{GAMMA} * peak_radiance",
                "gamma": GAMMA,
                "peak_radiance": peak,
                "median_radiance": band,
                "derived_from": {
                    "file": hdr_path.name,
                    "site": meta.get("name"),
                    "lat_deg": meta["lat_deg"],
                    "lon_east_deg": meta["lon_deg"],
                    "utc": meta["utc"],
                    "source_frame": "горизонтальные координаты участка, азимут = 360*u - 90",
                },
                "status": (
                    "производная текстура: исходная панорама предоставлена командой, "
                    "перепроецирована в ICRF"
                ),
                "credit": "исходную панораму неба и её источник указывает команда проекта",
                "rotation": (
                    "направление в небе участка пересчитывается матрицей ICRF->ENU "
                    "по модели вращения Марса IAU"
                ),
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"готово: {OUT_DIR / 'milkyway_icrf.webp'} (пик {peak:.4g}, медиана полосы {band:.4g})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

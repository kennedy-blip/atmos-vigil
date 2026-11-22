#!/usr/bin/env python3
"""
ATMOS-VIGIL — Barometric Cyclogenesis Engine (Python 3.12)
=========================================================
Storm-cell pressure tendency, bombogenesis & microburst classification.

Mirrors src/lib/engines/meteoEngine.js (zero-TypeScript browser stack).

Physics (K-B bombogenesis criteria; ISA height estimate):
  * Bombogenesis: ≥24 hPa/24 h with central pressure ≤ 1000 hPa.
  * Microburst: rapid descent (≤ -4 hPa/3 h) with pressure ≥ affection threshold.
  * Barometric altitude: hypsometric, ISA lapse rate.

CLI (JSON on stdout):
  python3 barometric_cyclogenesis.py classify 1002 -3.8
  python3 barometric_cyclogenesis.py classify 978 -8.5
  python3 barometric_cyclogenesis.py altitude 718
  python3 barometric_cyclogenesis.py presets
"""
from __future__ import annotations

import argparse
import json
import sys

SEA_LEVEL_HPA = 1013.25
LAPSE_RATE = 0.0065  # K/m (ISA)

SYNOPTIC_PRESETS = [
    {"id": "ridge", "label": "Stable High-Pressure Ridge", "pressure": 1024.2, "ten3h": 0.2,
     "detail": "Excellent flying weather · sinking air"},
    {"id": "front", "label": "Approaching Cold-Front Squall", "pressure": 1006.1, "ten3h": -3.8,
     "detail": "Rapid descent · gust front likely"},
    {"id": "bombogenesis", "label": "Explosive Bombogenesis Cyclone", "pressure": 978.4, "ten3h": -8.5,
     "detail": "≥24 hPa/24 h with P≤1000 hPa · K-B criteria"},
    {"id": "microburst", "label": "Thunderstorm Microburst Downdraft", "pressure": 1010.8, "ten3h": -6.2,
     "detail": "Severe downdraft pulse · hail & 80 mph gusts"},
    {"id": "ascent", "label": "High-Altitude Mountain Ascent", "pressure": 718.6, "ten3h": 0.1,
     "detail": "2,800 m · thin-air survival"},
]


def classify_tendency(ten3h: float, pressure: float) -> dict:
    """Classify ΔP/3 h + absolute pressure into cyclogenesis severity."""
    ten3h = float(ten3h)
    pressure = float(pressure)
    per_day = ten3h * 8  # 3 h segments per 24 h

    # Key K-B criterion: ≤ -24 hPa/24 h with P ≤ 1000 hPa
    if per_day <= -24 and pressure <= 1000.0:
        return {"level": "critical", "tag": "BOMBOGENESIS / CYCLOGENESIS", "color": "danger",
                "per_day_hpa": round(per_day, 1), "bombogenesis": True,
                "microburst": ten3h <= -4.0}
    if ten3h <= -4.0:
        return {"level": "severe", "tag": "MICROBURST / GALE-FORCE FRONT", "color": "danger",
                "per_day_hpa": round(per_day, 1), "bombogenesis": False,
                "microburst": True}
    if ten3h <= -2.0:
        return {"level": "warn", "tag": "FRONT APPROACHING", "color": "warn",
                "per_day_hpa": round(per_day, 1), "bombogenesis": False,
                "microburst": False}
    if ten3h <= 0.0:
        return {"level": "watch", "tag": "FALLING · MONITOR", "color": "warn",
                "per_day_hpa": round(per_day, 1), "bombogenesis": False,
                "microburst": False}
    return {"level": "stable", "tag": "HIGH-PRESSURE RIDGE", "color": "ok",
            "per_day_hpa": round(per_day, 1), "bombogenesis": False,
            "microburst": False}


def altitude_from_pressure(hpa: float, sea_level_hpa: float = SEA_LEVEL_HPA) -> int:
    """Hypsometric altitude [m AGL] from barometric pressure."""
    hpa = float(hpa)
    if hpa <= 0:
        return 0
    scale = (hpa / sea_level_hpa) ** (1.0 / 5.255)
    return int(round((1.0 - scale) * 44330))


def full_report(pressure: float, ten3h: float) -> dict:
    cls = classify_tendency(ten3h, pressure)
    return {
        "pressure_hpa": round(float(pressure), 1),
        "pressure_in_hg": round(float(pressure) / 33.8639, 2),
        "tendency_3h_hpa": round(float(ten3h), 1),
        "tendency_24h_hpa": round(float(ten3h) * 8, 1),
        "altitude_m": altitude_from_pressure(pressure),
        "severity": cls,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="ATMOS-VIGIL barometric cyclogenesis engine")
    parser.add_argument("mode", choices=["classify", "altitude", "presets", "report"])
    parser.add_argument("args", nargs="*")
    ns = parser.parse_args()
    a = ns.args
    try:
        if ns.mode == "classify":
            out = classify_tendency(float(a[0]), float(a[1]))
        elif ns.mode == "altitude":
            out = {"altitude_m": altitude_from_pressure(float(a[0]))}
        elif ns.mode == "presets":
            out = {"presets": SYNOPTIC_PRESETS}
        else:
            out = full_report(float(a[0]), float(a[1]))
    except (IndexError, ValueError) as err:
        print(json.dumps({"error": str(err)}))
        return 2
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

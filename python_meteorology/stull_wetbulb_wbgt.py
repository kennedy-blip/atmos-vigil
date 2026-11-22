#!/usr/bin/env python3
"""
ATMOS-VIGIL — Stull Wet-Bulb & ISO 7243 WBGT Engine (Python 3.12)
==================================================================
Real-world psychrometrics for storm-cell heatstroke and frostbite survival.

Modules mirrored in src/lib/engines/meteoEngine.js (zero-TypeScript browser stack).
Keep the two in sync — they are 100% interchangeable offline.

Physics:
  * Stull (2011) wet-bulb temperature via arctan identity (RH in %).
  * ISO 7243 Wet-Bulb Globe Temperature (WBGT): 0.7·Twb + 0.2·Tg + 0.1·Tdb
    with an estimated globe temperature Tg (+8 °C under clear sun, +1 °C in shade).
  * Osczevski–Bluestein wind-chill equivalent temperature.
  * Espy (1841) linear Lifting Condensation Level: z ≈ 125 m per °C of dew-point spread.
  * Osczevski–Gallagher frostbite time table & hydration intake estimate.

CLI (JSON on stdout):
  python3 stull_wetbulb_wbgt.py wetbulb 22 55
  python3 stull_wetbulb_wbgt.py wbgt     22 55 22 true
  python3 stull_wetbulb_wbgt.py lcl      30 18
  python3 stull_wetbulb_wbgt.py windchill -10 22
  python3 stull_wetbulb_wbgt.py all      22 55 22 true 5 14
"""
from __future__ import annotations

import argparse
import json
import math
import sys

# Simple synthetic globe-temperature offset under clear sky (°C)
GLOBE_OFFSET_CLEAR = 8.0
GLOBE_OFFSET_SHADE = 1.0

M_PER_MPH = 0.44704
KMH_PER_MPH = 1.609344
FT_PER_M = 3.28084


def stull_wet_bulb_celsius(t_c: float, rel_hum: float) -> float:
    """Stull (2011) arctan wet-bulb temperature [°C] — RH in percent."""
    rh = max(0.5, min(100.0, float(rel_hum)))
    t = float(t_c)
    a1 = t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
    a2 = math.atan(t + rh)
    a3 = math.atan(rh - 1.676331)
    a4 = 0.00391838 * (rh ** 1.5) * math.atan(0.023101 * rh)
    return a1 + a2 - a3 + a4 - 4.686035


def compute_wbgt(t_c: float, rel_hum: float, wind_mph: float, solar_clear: bool = True) -> dict:
    """ISO 7243 WBGT + wet bulb + flag zone + hydration + work/rest."""
    tdb = float(t_c)
    rh = float(rel_hum)
    tw = stull_wet_bulb_celsius(tdb, rh)
    globe = tdb + (GLOBE_OFFSET_CLEAR if solar_clear else GLOBE_OFFSET_SHADE)
    if solar_clear:
        wbgt = 0.7 * tw + 0.2 * globe + 0.1 * tdb
    else:
        wbgt = 0.7 * tw + 0.3 * tdb
    wbgt = round(wbgt, 1)
    return {
        "wet_bulb_c": round(tw, 1),
        "globe_estimate_c": round(globe, 1),
        "dry_bulb_c": round(tdb, 1),
        "wbgt_c": wbgt,
        "solar_clear": bool(solar_clear),
        "wind_mph": round(float(wind_mph), 1),
        "flag": wbgt_flag(wbgt),
        "hydration_ml_per_hr": hydration_ml_per_hr(wbgt),
        "work_rest": wbgt_flag(wbgt)["work_rest"],
    }


WBGT_FLAGS = [
    {"id": "white", "label": "White", "max": 20, "work_rest": "Full work", "color": "#e5e7eb"},
    {"id": "green", "label": "Green", "max": 25, "work_rest": "Full work · normal caution", "color": "#22c55e"},
    {"id": "yellow", "label": "Yellow", "max": 28, "work_rest": "30 min work : 15 min rest", "color": "#eab308"},
    {"id": "red", "label": "Red", "max": 32, "work_rest": "15 min work : 45 min rest", "color": "#f97316"},
    {"id": "black", "label": "Black", "max": float("inf"), "work_rest": "No exertion · seek shade", "color": "#111111"},
]


def wbgt_flag(wbgt_c: float) -> dict:
    for f in WBGT_FLAGS:
        if wbgt_c < f["max"]:
            return f
    return WBGT_FLAGS[-1]


def hydration_ml_per_hr(wbgt_c: float) -> int:
    return int(max(600, min(2600, 600 + 55 * (wbgt_c - 21))))


def osczevski_wind_chill_celsius(t_c: float, wind_mph: float) -> float:
    """Osczevski & Bluestein (2005) equivalent temperature [°C]."""
    v_kmh = max(0.4, float(wind_mph) * KMH_PER_MPH)
    return 13.12 + 0.6215 * float(t_c) - 11.37 * (v_kmh ** 0.16) + 0.3965 * float(t_c) * (v_kmh ** 0.16)


FROSTBITE_TABLE = [
    {"max": -46, "minutes": 5},
    {"max": -41, "minutes": 10},
    {"max": -37, "minutes": 15},
    {"max": -32, "minutes": 30},
    {"max": -27, "minutes": 45},
    {"max": -22, "minutes": 60},
    {"max": -18, "minutes": 120},
    {"max": -10, "minutes": 180},
]


def frostbite_minutes(wc_c: float):
    for r in FROSTBITE_TABLE:
        if wc_c <= r["max"]:
            return r["minutes"]
    return None


def cloud_base_m(t_c: float, dew_point_c: float) -> int:
    """Espy (1841) linear LCL approximation [m AGL]: 125 m per °C of dew-point spread."""
    spread = max(0.0, float(t_c) - float(dew_point_c))
    return int(round(125 * spread))


def freezing_level_m(t_c: float) -> int:
    """ISA 0 °C isotherm height from surface temperature (°C) [m AGL]."""
    if float(t_c) <= 0:
        return 0
    return int(round(float(t_c) / 0.0065))


def dew_form_countdown_min(t_c: float, dew_point_c: float) -> int:
    spread = float(t_c) - float(dew_point_c)
    if spread <= 0:
        return 0
    return int(round((spread / 1.2) * 60))


def full_report(t_c: float, rel_hum: float, wind_mph: float, solar_clear: bool,
                dew_point_c: float) -> dict:
    tw = stull_wet_bulb_celsius(t_c, rel_hum)
    w = compute_wbgt(t_c, rel_hum, wind_mph, solar_clear)
    wc = osczevski_wind_chill_celsius(t_c, wind_mph)
    return {
        "temperature_c": round(float(t_c), 1),
        "relative_humidity_pct": round(float(rel_hum), 1),
        "wind_mph": round(float(wind_mph), 1),
        "wet_bulb_c": tw,
        "wbgt_c": w["wbgt_c"],
        "wbgt_flag": w["flag"]["id"],
        "wbgt_flag_label": w["flag"]["label"],
        "hydration_ml_per_hr": w["hydration_ml_per_hr"],
        "work_rest": w["work_rest"],
        "osczevski_wind_chill_c": round(wc, 1),
        "frostbite_minutes": frostbite_minutes(wc),
        "lcl_base_m": cloud_base_m(t_c, dew_point_c),
        "freezing_level_m": freezing_level_m(t_c),
        "dew_countdown_min": dew_form_countdown_min(t_c, dew_point_c),
        "formula": {
            "wet_bulb": "Stull (2011): Tw = atan(0.151977*sqrt(RH+8.313659)) + atan(T+RH) - atan(RH-1.676331) + 0.00391838*RH^1.5*atan(0.023101*RH) - 4.686035",
            "wbgt": "ISO 7243: 0.7*Tw + 0.2*Tg + 0.1*Tdb (globe +8°C clear / +1°C shade)",
            "wind_chill": "Osczevski-Bluestein: Twc = 13.12 + 0.6215*T - 11.37*V^0.16 + 0.3965*T*V^0.16",
            "lcl": "Espy (1841): LCL ≈ 125 m per °C of spread (T - Td)",
        }
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="ATMOS-VIGIL wet-bulb & WBGT engine")
    parser.add_argument("mode", choices=["wetbulb", "wbgt", "lcl", "windchill", "all"])
    parser.add_argument("args", nargs="*", help="parameters per mode")
    ns = parser.parse_args()
    a = ns.args
    try:
        if ns.mode == "wetbulb":
            out = {"wet_bulb_c": stull_wet_bulb_celsius(float(a[0]), float(a[1]))}
        elif ns.mode == "wbgt":
            out = compute_wbgt(float(a[0]), float(a[1]), float(a[2]), solar_clear=(a[3].lower() != "false" if len(a) > 3 else True))
        elif ns.mode == "lcl":
            t, td = float(a[0]), float(a[1])
            out = {"lcl_m": cloud_base_m(t, td), "freezing_level_m": freezing_level_m(t), "dew_countdown_min": dew_form_countdown_min(t, td)}
        elif ns.mode == "windchill":
            wc = osczevski_wind_chill_celsius(float(a[0]), float(a[1]))
            out = {"osczevski_wind_chill_c": round(wc, 1), "frostbite_minutes": frostbite_minutes(wc)}
        else:
            out = full_report(float(a[0]), float(a[1]), float(a[2]), (a[3].lower() != "false" if len(a) > 3 else True), float(a[4]) if len(a) > 4 else 14.0)
    except (IndexError, ValueError) as err:
        print(json.dumps({"error": str(err)}))
        return 2
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

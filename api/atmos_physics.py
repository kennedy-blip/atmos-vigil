#!/usr/bin/env python3
"""
ATMOS-VIGIL — Vercel Python 3.12 Serverless Endpoint
===================================================
Self-contained meteorological compute backend. Every endpoint also exists as a
zero-dependency JS mirror (src/lib/engines/meteoEngine.js) so the station works
100% offline on the self-hosted Android .APK.

Vercel Python runtime (see vercel docs):
  * files under /api are detected as serverless functions
  * the function must export `handler(request)`
  * it must return {statusCode: int, headers: dict, body: str}

Supported routes (GET or POST, JSON body):
  ?route=wetbulb   &t=22&rh=55
  ?route=wbgt      &t=22&rh=55&wind=22&solar=true
  ?route=windchill &t=0&wind=20
  ?route=lcl       &t=30&td=18
  ?route=tendency  &ten3h=-3.8&pressure=1006.1
  ?route=report    &t=22&rh=55&wind=22&td=14&solar=true
  ?route=presets
  ?route=health

Python 3.12 syntax compatible. No third-party runtime dependencies.
"""
from __future__ import annotations

import json
import math

# ---------- import from python_meteorology (bundled in repo) ----------
try:
    from python_meteorology.stull_wetbulb_wbgt import (
        stull_wet_bulb_celsius, compute_wbgt, osczevski_wind_chill_celsius,
        frostbite_minutes, cloud_base_m, freezing_level_m,
        dew_form_countdown_min, hydration_ml_per_hr, wbgt_flag
    )
    from python_meteorology.barometric_cyclogenesis import (
        classify_tendency, altitude_from_pressure, SYNOPTIC_PRESETS
    )
    IMPORT_OK = True
except Exception:  # pragma: no cover - fallback for isolated deployments
    IMPORT_OK = False

    def stull_wet_bulb_celsius(t_c, rh):
        rh = max(0.5, min(100.0, float(rh))); t = float(t_c)
        a1 = t * math.atan(0.151977 * math.sqrt(rh + 8.313659))
        a2 = math.atan(t + rh); a3 = math.atan(rh - 1.676331)
        a4 = 0.00391838 * (rh ** 1.5) * math.atan(0.023101 * rh)
        return a1 + a2 - a3 + a4 - 4.686035

    def compute_wbgt(t_c, rh, wind, solar=True):
        tw = stull_wet_bulb_celsius(t_c, rh)
        globe = float(t_c) + (8.0 if solar else 1.0)
        w = (0.7 * tw + 0.2 * globe + 0.1 * float(t_c)) if solar else (0.7 * tw + 0.3 * float(t_c))
        return {"wet_bulb_c": round(tw, 1), "globe_estimate_c": round(globe, 1),
                "dry_bulb_c": round(float(t_c), 1), "wbgt_c": round(w, 1),
                "solar_clear": bool(solar), "wind_mph": round(float(wind), 1),
                "flag": wbgt_flag(round(w, 1)),
                "hydration_ml_per_hr": hydration_ml_per_hr(round(w, 1)),
                "work_rest": wbgt_flag(round(w, 1))["work_rest"]}

    def wbgt_flag(w):
        for f in [
            {"id": "white", "label": "White", "max": 20, "work_rest": "Full work", "color": "#e5e7eb"},
            {"id": "green", "label": "Green", "max": 25, "work_rest": "Full work · normal caution", "color": "#22c55e"},
            {"id": "yellow", "label": "Yellow", "max": 28, "work_rest": "30 min work : 15 min rest", "color": "#eab308"},
            {"id": "red", "label": "Red", "max": 32, "work_rest": "15 min work : 45 min rest", "color": "#f97316"},
            {"id": "black", "label": "Black", "max": 1e18, "work_rest": "No exertion · seek shade", "color": "#111111"},
        ]:
            if w < f["max"]:
                return f
        return {"id": "black", "label": "Black", "color": "#111111", "work_rest": "No exertion · seek shade"}

    def hydration_ml_per_hr(w):
        return int(max(600, min(2600, 600 + 55 * (float(w) - 21))))

    def osczevski_wind_chill_celsius(t_c, wind):
        v = max(0.4, float(wind) * 1.609344)
        return 13.12 + 0.6215 * float(t_c) - 11.37 * (v ** 0.16) + 0.3965 * float(t_c) * (v ** 0.16)

    def frostbite_minutes(wc):
        for r in [{"max": -46, "minutes": 5}, {"max": -41, "minutes": 10}, {"max": -37, "minutes": 15},
                  {"max": -32, "minutes": 30}, {"max": -27, "minutes": 45}, {"max": -22, "minutes": 60},
                  {"max": -18, "minutes": 120}, {"max": -10, "minutes": 180}]:
            if wc <= r["max"]:
                return r["minutes"]
        return None

    def cloud_base_m(t_c, dew_point_c):
        return int(round(125 * max(0.0, float(t_c) - float(dew_point_c))))

    def freezing_level_m(t_c):
        return 0 if float(t_c) <= 0 else int(round(float(t_c) / 0.0065))

    def dew_form_countdown_min(t_c, dew_point_c):
        spread = float(t_c) - float(dew_point_c)
        return 0 if spread <= 0 else int(round((spread / 1.2) * 60))

    def classify_tendency(ten3h, pressure):
        per_day = float(ten3h) * 8
        if per_day <= -24 and float(pressure) <= 1000.0:
            return {"level": "critical", "tag": "BOMBOGENESIS / CYCLOGENESIS", "color": "danger",
                    "per_day_hpa": round(per_day, 1), "bombogenesis": True,
                    "microburst": float(ten3h) <= -4.0}
        if float(ten3h) <= -4.0:
            return {"level": "severe", "tag": "MICROBURST / GALE-FORCE FRONT", "color": "danger",
                    "per_day_hpa": round(per_day, 1), "bombogenesis": False, "microburst": True}
        if float(ten3h) <= -2.0:
            return {"level": "warn", "tag": "FRONT APPROACHING", "color": "warn",
                    "per_day_hpa": round(per_day, 1), "bombogenesis": False, "microburst": False}
        if float(ten3h) <= 0.0:
            return {"level": "watch", "tag": "FALLING · MONITOR", "color": "warn",
                    "per_day_hpa": round(per_day, 1), "bombogenesis": False, "microburst": False}
        return {"level": "stable", "tag": "HIGH-PRESSURE RIDGE", "color": "ok",
                "per_day_hpa": round(per_day, 1), "bombogenesis": False, "microburst": False}

    def altitude_from_pressure(hpa, sea_level_hpa=1013.25):
        if hpa <= 0:
            return 0
        scale = (hpa / sea_level_hpa) ** (1.0 / 5.255)
        return int(round((1.0 - scale) * 44330))

    SYNOPTIC_PRESETS = [
        {"id": "ridge", "label": "Stable High-Pressure Ridge", "pressure": 1024.2, "ten3h": 0.2},
        {"id": "front", "label": "Approaching Cold-Front Squall", "pressure": 1006.1, "ten3h": -3.8},
        {"id": "bombogenesis", "label": "Explosive Bombogenesis Cyclone", "pressure": 978.4, "ten3h": -8.5},
        {"id": "microburst", "label": "Thunderstorm Microburst Downdraft", "pressure": 1010.8, "ten3h": -6.2},
        {"id": "ascent", "label": "High-Altitude Mountain Ascent", "pressure": 718.6, "ten3h": 0.1},
    ]


def _parse_req(request) -> dict:
    """Vercel passes a dict with method/query/body; also handles plain strings."""
    if isinstance(request, dict):
        query = request.get("query") or {}
        body = request.get("body") or {}
        if isinstance(body, str):
            try:
                body = json.loads(body) if body.strip().startswith("{") else {}
            except json.JSONDecodeError:
                body = {}
        return {"method": (request.get("method") or "GET").upper(), "query": query, "body": body}
    if hasattr(request, "query") and hasattr(request, "method"):
        return {"method": getattr(request, "method", "GET").upper(),
                "query": getattr(request, "query", {}) or {},
                "body": getattr(request, "body", {}) or {}}
    return {"method": "GET", "query": {}, "body": {}}


def _get_param(params: dict, key: str, default=None):
    v = params.get(key, default)
    if v is None:
        return default
    if isinstance(v, list):
        v = v[0]
    return v


def _route(params: dict) -> tuple:
    route = _get_param(params, "route", "health")
    return route, params


def handler(request):
    try:
        req = _parse_req(request)
        params = {**(req["query"] or {}), **(req["body"] or {})}
        route, _ = _route(params)

        def num(key, default=None, coerce=float):
            v = _get_param(params, key, default)
            try:
                return coerce(v)
            except (TypeError, ValueError):
                return default

        def bool_(key, default=True):
            v = _get_param(params, key, default)
            if isinstance(v, bool):
                return v
            if isinstance(v, str):
                return v.strip().lower() not in ("false", "0", "no", "off")
            return bool(v)

        if route == "health":
            payload = {
                "status": "ok",
                "engine": "api/atmos_physics.py",
                "python": "3.12",
                "imports_python_meteorology": IMPORT_OK,
                "routes": ["wetbulb", "wbgt", "windchill", "lcl", "tendency", "report", "presets"],
            }
        elif route == "presets":
            payload = {"presets": SYNOPTIC_PRESETS}
        elif route == "wetbulb":
            t, rh = num("t", 22), num("rh", 55)
            payload = {"temperature_c": t, "relative_humidity_pct": rh,
                       "wet_bulb_c": round(stull_wet_bulb_celsius(t, rh), 2)}
        elif route == "wbgt":
            t, rh, wind, solar = num("t", 22), num("rh", 55), num("wind", 22), bool_("solar", True)
            payload = compute_wbgt(t, rh, wind, solar)
        elif route == "windchill":
            t, wind = num("t", 0), num("wind", 20)
            wc = osczevski_wind_chill_celsius(t, wind)
            payload = {"temperature_c": t, "wind_mph": wind,
                       "osczevski_wind_chill_c": round(wc, 1),
                       "frostbite_minutes": frostbite_minutes(wc)}
        elif route == "lcl":
            t, td = num("t", 30), num("td", 18)
            payload = {"temperature_c": t, "dew_point_c": td,
                       "lcl_base_m": cloud_base_m(t, td),
                       "freezing_level_m": freezing_level_m(t),
                       "dew_countdown_min": dew_form_countdown_min(t, td)}
        elif route == "tendency":
            ten3h, pressure = num("ten3h", 0), num("pressure", 1013.25)
            cls = classify_tendency(ten3h, pressure)
            payload = {
                "pressure_hpa": pressure,
                "pressure_in_hg": round(pressure / 33.8639, 2),
                "tendency_3h_hpa": ten3h,
                "tendency_24h_hpa": round(ten3h * 8, 1),
                "altitude_m": altitude_from_pressure(pressure),
                "severity": cls,
            }
        elif route == "report":
            t, rh, wind = num("t", 22), num("rh", 55), num("wind", 22)
            td, solar = num("td", 14), bool_("solar", True)
            wet = compute_wbgt(t, rh, wind, solar)
            wc = osczevski_wind_chill_celsius(t, wind)
            payload = {
                "temperature_c": t, "relative_humidity_pct": rh, "wind_mph": wind,
                "wet_bulb_c": wet["wet_bulb_c"],
                "wbgt_c": wet["wbgt_c"], "wbgt_flag": wet["flag"],
                "hydration_ml_per_hr": wet["hydration_ml_per_hr"],
                "work_rest": wet["work_rest"],
                "osczevski_wind_chill_c": round(wc, 1),
                "frostbite_minutes": frostbite_minutes(wc),
                "lcl_base_m": cloud_base_m(t, td),
                "freezing_level_m": freezing_level_m(t),
                "dew_countdown_min": dew_form_countdown_min(t, td),
            }
        else:
            return {
                "statusCode": 404,
                "headers": {"content-type": "application/json"},
                "body": json.dumps({"error": "unknown route", "route": route,
                                    "routes": ["health", "presets", "wetbulb", "wbgt", "windchill", "lcl", "tendency", "report"]}),
            }

        return {
            "statusCode": 200,
            "headers": {"content-type": "application/json", "cache-control": "s-maxage=60, stale-while-revalidate=300"},
            "body": json.dumps(payload),
        }
    except Exception as err:
        return {
            "statusCode": 500,
            "headers": {"content-type": "application/json"},
            "body": json.dumps({"error": str(err), "type": type(err).__name__}),
        }

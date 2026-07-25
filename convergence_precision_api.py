# convergence_precision_api.py
# Drop-in backend for Convergence. Two endpoints:
#
#   /api/convergence/geocode    -> resolves ANY place name to lat/lon + timezone
#   /api/convergence/positions  -> Swiss Ephemeris positions, houses, angles
#
# The geocode endpoint is the one that removes any need to type coordinates.
# It's the same approach Three Skies One Self used: let the server resolve the
# place, because the server can reach a real geocoder and a real historical
# timezone database, and a browser can't.
#
# Install on PythonAnywhere:
#   pip install --user pyswisseph flask flask-cors geonamescache timezonefinder pytz requests
#
# Wire into your existing Flask app:
#   from convergence_precision_api import convergence_bp
#   app.register_blueprint(convergence_bp)
#
# NOTE for PythonAnywhere free accounts: outbound internet is whitelisted and
# Nominatim is generally NOT on that list. That's why the offline geocoder
# (geonamescache, ~25k cities, no internet needed) is tried FIRST. It will
# work on a free account. The online fallback only matters for tiny hamlets.

import datetime

import swisseph as swe
from flask import Blueprint, request, jsonify
from flask_cors import cross_origin

convergence_bp = Blueprint("convergence", __name__)

# ---------------------------------------------------------------------------
# GEOCODING
# ---------------------------------------------------------------------------

try:
    from geonamescache import GeonamesCache
    _gc = GeonamesCache()
    _CITIES = list(_gc.get_cities().values())
except Exception:
    _CITIES = []

try:
    from timezonefinder import TimezoneFinder
    _tf = TimezoneFinder()
except Exception:
    _tf = None

try:
    import pytz
except Exception:
    pytz = None

try:
    import requests
except Exception:
    requests = None

US_STATE_ABBR = {
    "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas", "ca": "california",
    "co": "colorado", "ct": "connecticut", "de": "delaware", "fl": "florida", "ga": "georgia",
    "hi": "hawaii", "id": "idaho", "il": "illinois", "in": "indiana", "ia": "iowa",
    "ks": "kansas", "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
    "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
    "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada", "nh": "new hampshire",
    "nj": "new jersey", "nm": "new mexico", "ny": "new york", "nc": "north carolina",
    "nd": "north dakota", "oh": "ohio", "ok": "oklahoma", "or": "oregon", "pa": "pennsylvania",
    "ri": "rhode island", "sc": "south carolina", "sd": "south dakota", "tn": "tennessee",
    "tx": "texas", "ut": "utah", "vt": "vermont", "va": "virginia", "wa": "washington",
    "wv": "west virginia", "wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia",
}


def _offline_geocode(query):
    """Resolve a place name using the bundled offline city database."""
    if not _CITIES:
        return None
    q = query.lower().strip()
    parts = [p.strip() for p in q.split(",")]
    city_part = parts[0]
    region_hint = parts[1] if len(parts) > 1 else ""
    if region_hint in US_STATE_ABBR:
        region_hint = US_STATE_ABBR[region_hint]

    exact = [c for c in _CITIES if c["name"].lower() == city_part]
    partial = [c for c in _CITIES if city_part and city_part in c["name"].lower()]
    candidates = exact or partial
    if not candidates:
        return None

    if region_hint:
        narrowed = [
            c for c in candidates
            if region_hint in str(c.get("admin1code", "")).lower()
            or region_hint in str(c.get("countrycode", "")).lower()
        ]
        if narrowed:
            candidates = narrowed

    best = max(candidates, key=lambda c: c.get("population", 0))
    label = f"{best['name']}, {best.get('admin1code', '')} {best.get('countrycode', '')}"
    return {
        "lat": float(best["latitude"]),
        "lon": float(best["longitude"]),
        "label": " ".join(label.split()),
        "source": "offline",
    }


def _online_geocode(query):
    """Fallback to Nominatim. Needs unrestricted outbound internet."""
    if requests is None:
        return None
    try:
        res = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1},
            headers={"User-Agent": "Convergence/1.0 (contact: your-email@example.com)"},
            timeout=6,
        )
        if res.status_code != 200:
            return None
        data = res.json()
        if not data:
            return None
        return {
            "lat": float(data[0]["lat"]),
            "lon": float(data[0]["lon"]),
            "label": data[0].get("display_name", query),
            "source": "nominatim",
        }
    except Exception:
        return None


def _historical_utc_offset(lat, lon, date_str, time_str):
    """
    The ACTUAL utc offset at that place on that date, including whatever DST
    rule was in force that year in that country. pytz carries the full
    historical timezone database, so 1996 US rules, EU rules, and
    southern-hemisphere DST all resolve correctly. This is the piece a
    browser genuinely cannot do.
    """
    if _tf is None or pytz is None:
        return None, None
    tzname = _tf.timezone_at(lat=lat, lng=lon)
    if not tzname:
        return None, None
    tz = pytz.timezone(tzname)
    try:
        y, m, d = [int(x) for x in date_str.split("-")]
        hh, mm = [int(x) for x in (time_str or "12:00").split(":")]
        naive = datetime.datetime(y, m, d, hh, mm)
    except Exception:
        return None, tzname
    try:
        localized = tz.localize(naive, is_dst=None)
    except Exception:
        # Ambiguous or nonexistent local time (the DST changeover hour).
        localized = tz.localize(naive)
    return localized.utcoffset().total_seconds() / 3600.0, tzname


@convergence_bp.route("/api/convergence/geocode", methods=["GET"])
@cross_origin(origins="*")
def geocode():
    """
    GET /api/convergence/geocode?q=Nyack,NY&date=1996-10-25&time=20:47

    Returns lat, lon, resolved label, and the true historical UTC offset for
    that date at that place. The frontend needs nothing else from the user.
    """
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"error": "missing q"}), 400

    place = _offline_geocode(query) or _online_geocode(query)
    if not place:
        return jsonify({"found": False, "query": query}), 200

    date_str = request.args.get("date")
    time_str = request.args.get("time")
    offset, tzname = (None, None)
    if date_str:
        offset, tzname = _historical_utc_offset(place["lat"], place["lon"], date_str, time_str)

    return jsonify({
        "found": True,
        "lat": place["lat"],
        "lon": place["lon"],
        "label": place["label"],
        "source": place["source"],
        "utc_offset": offset,
        "timezone": tzname,
    })


# ---------------------------------------------------------------------------
# SWISS EPHEMERIS POSITIONS
# ---------------------------------------------------------------------------

PLANETS = {
    "Sun": swe.SUN,
    "Moon": swe.MOON,
    "Mercury": swe.MERCURY,
    "Venus": swe.VENUS,
    "Mars": swe.MARS,
    "Jupiter": swe.JUPITER,
    "Saturn": swe.SATURN,
    "Uranus": swe.URANUS,
    "Neptune": swe.NEPTUNE,
    "Pluto": swe.PLUTO,
    "NorthNode": swe.TRUE_NODE,
    "Chiron": swe.CHIRON,
    "Lilith": swe.MEAN_APOG,
}


@convergence_bp.route("/api/convergence/positions", methods=["GET"])
@cross_origin(origins="*")
def positions():
    try:
        year = int(request.args["year"])
        month = int(request.args["month"])
        day = int(request.args["day"])
        ut_hours = float(request.args["ut_hours"])  # decimal UT hours
        lat = float(request.args["lat"])
        lon = float(request.args["lon"])
    except (KeyError, ValueError) as exc:
        return jsonify({"error": f"bad or missing parameter: {exc}"}), 400

    jd = swe.julday(year, month, day, ut_hours)

    out = {"planets": {}, "jd": jd}
    for name, body in PLANETS.items():
        try:
            result, _flags = swe.calc_ut(jd, body)
            out["planets"][name] = {"lon": result[0]}
        except Exception:
            # Chiron needs the asteroid ephemeris file; skip if absent.
            continue

    # True Placidus cusps plus the angles.
    # swe.houses returns (cusps[1..12], ascmc), ascmc = [ASC, MC, ARMC, Vertex, ...]
    cusps, ascmc = swe.houses(jd, lat, lon, b"P")
    out["houses"] = {"cusps": list(cusps), "system": "Placidus"}
    out["ascendant"] = ascmc[0]
    out["midheaven"] = ascmc[1]
    out["vertex"] = ascmc[3]

    return jsonify(out)

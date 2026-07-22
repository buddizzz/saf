#!/usr/bin/env python3
"""إعادة توليد seed/ksa_locations.sql من مستودع homaily.

المصدر:
  https://github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts/master/json"
OUT = Path(__file__).resolve().parent / "ksa_locations.sql"


def fetch(name: str):
    with urllib.request.urlopen(f"{BASE}/{name}") as res:
        return json.load(res)


def esc(s: object) -> str:
    return str(s).replace("'", "''")


def centroid(boundaries):
    if not boundaries:
        return None, None
    ring = boundaries[0]
    if not ring:
        return None, None
    if ring and isinstance(ring[0][0], (list, tuple)):
        ring = ring[0]
    pts = [
        p
        for p in ring
        if isinstance(p, (list, tuple))
        and len(p) >= 2
        and isinstance(p[0], (int, float))
    ]
    if not pts:
        return None, None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def main() -> None:
    regions = fetch("regions.json")
    cities = fetch("cities.json")
    districts = fetch("districts.json")

    out: list[str] = [
        "-- السعودية: مناطق ومدن وأحياء بإحداثيات المركز",
        "-- المصدر: https://github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts",
        "-- البيانات الأصلية من https://maps.address.gov.sa/ — رخصة GPL-2.0",
        "",
        "INSERT OR IGNORE INTO countries (code, name_ar, name_en) VALUES",
        "  ('SA', 'السعودية', 'Saudi Arabia'),",
        "  ('AE', 'الإمارات', 'United Arab Emirates'),",
        "  ('KW', 'الكويت', 'Kuwait');",
        "",
        "PRAGMA foreign_keys = OFF;",
        "UPDATE shops SET city_id = NULL, district_id = NULL",
        "  WHERE city_id LIKE 'sa-%' OR district_id LIKE 'sa-%' OR city_id LIKE 'riyadh-%' OR city_id IN ('sa-riyadh','sa-jeddah','sa-dammam','sa-makkah','sa-madinah');",
        "UPDATE customers SET last_city_id = NULL, last_district_id = NULL",
        "  WHERE last_city_id LIKE 'sa-%' OR last_district_id LIKE 'sa-%' OR last_city_id IN ('sa-riyadh','sa-jeddah','sa-dammam','sa-makkah','sa-madinah');",
        "DELETE FROM districts;",
        "DELETE FROM cities WHERE country_code = 'SA';",
        "DELETE FROM regions;",
        "PRAGMA foreign_keys = ON;",
        "",
    ]

    vals = []
    for r in regions:
        lat, lng = r["center"]
        pop = r.get("population")
        pop_sql = "NULL" if pop is None else str(int(pop))
        vals.append(
            f"('sa-r-{r['region_id']}','{esc(r['code'])}','{esc(r['name_ar'])}','{esc(r['name_en'])}','sa-c-{r['capital_city_id']}',{pop_sql},{lat},{lng},'homaily')"
        )
    out.append(
        "INSERT INTO regions (id, code, name_ar, name_en, capital_city_id, population, lat, lng, source) VALUES\n"
        + ",\n".join(vals)
        + ";\n"
    )

    chunk = 300
    for i in range(0, len(cities), chunk):
        part = cities[i : i + chunk]
        vals = []
        for c in part:
            lat, lng = c["center"]
            vals.append(
                f"('sa-c-{c['city_id']}','SA','sa-r-{c['region_id']}','{esc(c['name_ar'])}','{esc(c['name_en'])}',{lat},{lng},'homaily',{c['city_id']})"
            )
        out.append(
            "INSERT INTO cities (id, country_code, region_id, name_ar, name_en, lat, lng, source, source_id) VALUES\n"
            + ",\n".join(vals)
            + ";\n"
        )

    for i in range(0, len(districts), chunk):
        part = districts[i : i + chunk]
        vals = []
        for d in part:
            lat, lng = centroid(d.get("boundaries"))
            if lat is None:
                continue
            vals.append(
                f"('sa-d-{d['district_id']}','sa-c-{d['city_id']}','sa-r-{d['region_id']}','{esc(d['name_ar'])}','{esc(d['name_en'])}',{lat},{lng},'homaily','{d['district_id']}')"
            )
        if vals:
            out.append(
                "INSERT INTO districts (id, city_id, region_id, name_ar, name_en, lat, lng, source, source_id) VALUES\n"
                + ",\n".join(vals)
                + ";\n"
            )

    OUT.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

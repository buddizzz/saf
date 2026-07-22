import { FormEvent, useCallback, useEffect, useState } from "react";
import { adminFetch } from "../lib/api";
import { formatTs } from "../lib/format";
import { generateId } from "./id";

interface City {
  id: string;
  name_ar: string;
  name_en: string;
  country_code: string;
}

interface District {
  id: string;
  city_id: string;
  name_ar: string;
  name_en: string;
}

interface ReservedSlug {
  slug: string;
  reason: string | null;
  created_at: number;
}

interface BannedWord {
  word: string;
  created_at: number;
}

export function PlatformTab({ isSuper }: { isSuper: boolean }) {
  const [section, setSection] = useState<"locations" | "slugs" | "banned">(
    "locations",
  );
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [districts, setDistricts] = useState<District[]>([]);
  const [slugs, setSlugs] = useState<ReservedSlug[]>([]);
  const [words, setWords] = useState<BannedWord[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [cityAr, setCityAr] = useState("");
  const [cityEn, setCityEn] = useState("");
  const [distAr, setDistAr] = useState("");
  const [distEn, setDistEn] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugReason, setSlugReason] = useState("");
  const [newWord, setNewWord] = useState("");

  const loadCities = useCallback(async () => {
    const res = await adminFetch<{ cities: City[] }>("/admin/locations/cities");
    setCities(res.cities);
    if (!selectedCity && res.cities[0]) setSelectedCity(res.cities[0].id);
  }, [selectedCity]);

  const loadDistricts = useCallback(async () => {
    if (!selectedCity) return;
    const res = await adminFetch<{ districts: District[] }>(
      `/admin/locations/districts?city_id=${encodeURIComponent(selectedCity)}`,
    );
    setDistricts(res.districts);
  }, [selectedCity]);

  const loadSlugs = useCallback(async () => {
    const res = await adminFetch<{ slugs: ReservedSlug[] }>(
      "/admin/reserved-slugs",
    );
    setSlugs(res.slugs);
  }, []);

  const loadWords = useCallback(async () => {
    const res = await adminFetch<{ words: BannedWord[] }>("/admin/banned-words");
    setWords(res.words);
  }, []);

  useEffect(() => {
    void loadCities();
    void loadSlugs();
    void loadWords();
  }, [loadCities, loadSlugs, loadWords]);

  useEffect(() => {
    void loadDistricts();
  }, [loadDistricts]);

  const addCity = async (e: FormEvent) => {
    e.preventDefault();
    const id = cityEn
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || generateId("city");
    await adminFetch("/admin/locations/cities", {
      method: "POST",
      body: JSON.stringify({
        id,
        country_code: "SA",
        name_ar: cityAr.trim(),
        name_en: cityEn.trim(),
      }),
    });
    setCityAr("");
    setCityEn("");
    setMessage("تمت إضافة المدينة");
    await loadCities();
  };

  const addDistrict = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCity) return;
    const id = generateId("dst");
    await adminFetch("/admin/locations/districts", {
      method: "POST",
      body: JSON.stringify({
        id,
        city_id: selectedCity,
        name_ar: distAr.trim(),
        name_en: distEn.trim(),
      }),
    });
    setDistAr("");
    setDistEn("");
    setMessage("تمت إضافة الحي");
    await loadDistricts();
  };

  const addSlug = async (e: FormEvent) => {
    e.preventDefault();
    await adminFetch("/admin/reserved-slugs", {
      method: "POST",
      body: JSON.stringify({ slug: newSlug.trim(), reason: slugReason.trim() }),
    });
    setNewSlug("");
    setSlugReason("");
    setMessage("تم حجز الـ slug");
    await loadSlugs();
  };

  const removeSlug = async (slug: string) => {
    await adminFetch(`/admin/reserved-slugs/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    setMessage("تم إلغاء الحجز");
    await loadSlugs();
  };

  const addWord = async (e: FormEvent) => {
    e.preventDefault();
    await adminFetch("/admin/banned-words", {
      method: "POST",
      body: JSON.stringify({ word: newWord.trim() }),
    });
    setNewWord("");
    setMessage("تمت إضافة الكلمة المحظورة");
    await loadWords();
  };

  const removeWord = async (word: string) => {
    await adminFetch(`/admin/banned-words/${encodeURIComponent(word)}`, {
      method: "DELETE",
    });
    setMessage("تم حذف الكلمة");
    await loadWords();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["locations", "المدن والأحياء"],
            ["slugs", "كلمات محجوزة للروابط"],
            ["banned", "كلمات محظورة للحملات"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={section === id ? "btn-primary" : "btn-ghost"}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {section === "locations" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel space-y-3">
            <h3 className="font-bold">المدن ({cities.length})</h3>
            <form onSubmit={addCity} className="flex flex-wrap gap-2">
              <input
                className="field min-w-[120px] flex-1"
                placeholder="الاسم بالعربي"
                value={cityAr}
                onChange={(e) => setCityAr(e.target.value)}
                required
              />
              <input
                className="field min-w-[120px] flex-1"
                placeholder="English name"
                value={cityEn}
                onChange={(e) => setCityEn(e.target.value)}
                required
                dir="ltr"
              />
              <button className="btn-primary">إضافة</button>
            </form>
            <select
              className="field"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_ar} ({c.name_en})
                </option>
              ))}
            </select>
          </div>

          <div className="panel space-y-3">
            <h3 className="font-bold">أحياء المدينة ({districts.length})</h3>
            <form onSubmit={addDistrict} className="flex flex-wrap gap-2">
              <input
                className="field min-w-[120px] flex-1"
                placeholder="اسم الحي"
                value={distAr}
                onChange={(e) => setDistAr(e.target.value)}
                required
              />
              <input
                className="field min-w-[120px] flex-1"
                placeholder="District EN"
                value={distEn}
                onChange={(e) => setDistEn(e.target.value)}
                required
                dir="ltr"
              />
              <button className="btn-primary">إضافة</button>
            </form>
            <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {districts.map((d) => (
                <li key={d.id} className="flex justify-between gap-2 border-b border-ink-50 py-1">
                  <span>{d.name_ar}</span>
                  <span className="text-ink-700/50" dir="ltr">
                    {d.name_en}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {section === "slugs" && (
        <div className="panel space-y-3">
          {isSuper ? (
            <form onSubmit={addSlug} className="flex flex-wrap gap-2">
              <input
                className="field max-w-[160px]"
                placeholder="slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                required
                dir="ltr"
              />
              <input
                className="field min-w-[160px] flex-1"
                placeholder="السبب"
                value={slugReason}
                onChange={(e) => setSlugReason(e.target.value)}
              />
              <button className="btn-primary">حجز</button>
            </form>
          ) : (
            <p className="text-sm text-ink-700/60">الحجز يتطلب صلاحية Super Admin</p>
          )}
          <ul className="space-y-1 text-sm">
            {slugs.map((s) => (
              <li
                key={s.slug}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-50 py-1.5"
              >
                <div>
                  <span className="font-mono font-semibold" dir="ltr">
                    {s.slug}
                  </span>
                  <span className="ms-2 text-ink-700/60">{s.reason ?? ""}</span>
                  <span className="ms-2 text-[11px] text-ink-700/40">
                    {formatTs(s.created_at)}
                  </span>
                </div>
                {isSuper && (
                  <button
                    className="btn-danger !px-2 !py-1 text-xs"
                    onClick={() => void removeSlug(s.slug)}
                  >
                    حذف
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {section === "banned" && (
        <div className="panel space-y-3">
          <form onSubmit={addWord} className="flex flex-wrap gap-2">
            <input
              className="field min-w-[180px] flex-1"
              placeholder="كلمة محظورة"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              required
            />
            <button className="btn-primary">إضافة</button>
          </form>
          <ul className="flex flex-wrap gap-2">
            {words.map((w) => (
              <li
                key={w.word}
                className="flex items-center gap-2 rounded-lg bg-ink-50 px-2 py-1 text-sm"
              >
                <span>{w.word}</span>
                <button
                  className="text-xs text-rose-600"
                  onClick={() => void removeWord(w.word)}
                  type="button"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

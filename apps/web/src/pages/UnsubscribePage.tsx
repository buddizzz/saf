import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { Logo } from "../components/Logo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

export function UnsubscribePage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    void apiFetch<{ name: string | null; opted_out: boolean }>(
      `/unsubscribe/${token}`,
    )
      .then((res) => {
        setName(res.name);
        setOptedOut(res.opted_out);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  const unsubscribe = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/unsubscribe/${token}`, { method: "POST" });
      setOptedOut(true);
    } finally {
      setBusy(false);
    }
  };

  const deleteData = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/unsubscribe/${token}/data`, { method: "DELETE" });
      setDeleted(true);
      setOptedOut(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="mx-auto flex max-w-lg items-center justify-between px-6 py-5">
        <Logo />
        <LanguageSwitcher />
      </header>
      <main className="mx-auto max-w-lg px-6 pb-16">
        <div className="card space-y-4">
          <h1 className="text-2xl font-black tracking-tight text-brand-950">
            {t("unsubscribe.title")}
          </h1>
          {loading ? (
            <p className="text-slate-500">{t("common.loading")}</p>
          ) : invalid ? (
            <p className="text-rose-600">{t("unsubscribe.invalid")}</p>
          ) : deleted ? (
            <p className="text-emerald-700">{t("unsubscribe.deleted")}</p>
          ) : (
            <>
              {name && <p className="text-sm text-slate-500">{name}</p>}
              {optedOut ? (
                <p className="text-emerald-700">{t("unsubscribe.done")}</p>
              ) : (
                <button
                  className="btn-primary w-full"
                  disabled={busy}
                  onClick={unsubscribe}
                >
                  {t("unsubscribe.confirm")}
                </button>
              )}
              <button
                className="btn-ghost w-full text-rose-600"
                disabled={busy}
                onClick={deleteData}
              >
                {t("unsubscribe.deleteData")}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

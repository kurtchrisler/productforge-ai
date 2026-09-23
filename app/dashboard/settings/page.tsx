"use client";

import { useEffect, useState } from "react";

type MembershipLevel = "none" | "standard" | "pro";

type LicenseStatus = {
  membershipLevel: MembershipLevel;
  licenseEmail: string;
  licenseCheckedAt: string | null;
  licenseMessage: string | null;
  kdpAccelerator: boolean;
};

const TIER_LABEL: Record<MembershipLevel, string> = {
  none: "No active license",
  standard: "Standard",
  pro: "Pro",
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [licenseEmailInput, setLicenseEmailInput] = useState("");
  const [licenseLoading, setLicenseLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [licenseSuccess, setLicenseSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/openai-key")
      .then((res) => res.json())
      .then((data) => {
        setHasKey(Boolean(data.hasKey));
        setMasked(data.masked ?? null);
      })
      .finally(() => setLoading(false));

    fetch("/api/license")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;
        setLicense(data);
        setLicenseEmailInput(data.licenseEmail || "");
      })
      .finally(() => setLicenseLoading(false));
  }, []);

  async function handleRefreshLicense(e: React.FormEvent) {
    e.preventDefault();
    setLicenseError(null);
    setLicenseSuccess(null);
    setRefreshing(true);
    try {
      const res = await fetch("/api/license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseEmail: licenseEmailInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLicenseError(data.error || "Couldn't check your license. Please try again.");
        return;
      }
      setLicense(data);
      if (data.ok) {
        setLicenseSuccess(
          `You're on the ${TIER_LABEL[data.membershipLevel as MembershipLevel]} plan.` +
            (data.kdpAccelerator ? " KDP Accelerator is active." : "")
        );
      } else if (data.reachable) {
        setLicenseError(
          data.licenseMessage || "No license found for that email."
        );
      } else {
        setLicenseError(
          data.licenseMessage || "Couldn't reach the license server. Please try again in a moment."
        );
      }
    } catch {
      setLicenseError("Network error. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/openai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save that key. Please try again.");
        return;
      }
      setHasKey(true);
      setMasked(data.masked);
      setApiKey("");
      setSuccess("Your API key was saved.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setSuccess(null);
    setRemoving(true);
    try {
      const res = await fetch("/api/settings/openai-key", {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Couldn't remove the key. Please try again.");
        return;
      }
      setHasKey(false);
      setMasked(null);
      setSuccess("Your API key was removed.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
      <p className="text-zinc-500 text-sm mt-1 mb-8">
        Manage the OpenAI API key ProductGenie AI uses to generate your
        content.
      </p>

      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-zinc-900">Membership</h2>
          {!licenseLoading && license && (
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                  license.membershipLevel === "pro"
                    ? "bg-indigo-100 text-indigo-700"
                    : license.membershipLevel === "standard"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {TIER_LABEL[license.membershipLevel]}
              </span>
              {license.kdpAccelerator && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                  KDP Accelerator
                </span>
              )}
            </div>
          )}
        </div>
        <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
          Your license is checked against the email you purchased
          ProductGenie AI Standard or Pro with. If you just bought or
          upgraded — including the KDP Accelerator add-on — enter that email
          below and click &quot;Refresh my license&quot; to unlock it.
        </p>

        {licenseLoading ? (
          <p className="text-sm text-zinc-400 mt-6">Loading…</p>
        ) : (
          <form onSubmit={handleRefreshLicense} className="flex flex-col gap-3 mt-6">
            <label className="text-sm font-semibold text-zinc-800">
              Purchase email
            </label>
            <input
              type="email"
              required
              value={licenseEmailInput}
              onChange={(e) => setLicenseEmailInput(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {licenseError && <p className="text-sm text-red-600">{licenseError}</p>}
            {licenseSuccess && (
              <p className="text-sm text-emerald-600">{licenseSuccess}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={refreshing}
                className="self-start px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {refreshing ? "Checking…" : "Refresh my license"}
              </button>
              {license?.licenseCheckedAt && (
                <span className="text-xs text-zinc-400">
                  Last checked {new Date(license.licenseCheckedAt + "Z").toLocaleString()}
                </span>
              )}
            </div>
            {license?.membershipLevel === "standard" && (
              <p className="text-xs text-zinc-500 mt-1">
                Want crossword puzzles, word search puzzles, coloring books,
                the 75/100/150-page tiers, and a one-click sales page +
                download page for every product? Upgrade to Pro, then come
                back and click &quot;Refresh my license&quot;.
              </p>
            )}
            {license && !license.kdpAccelerator && (
              <p className="text-xs text-zinc-500 mt-1">
                Publishing to Amazon KDP? The{" "}
                <strong>KDP Accelerator</strong> add-on unlocks the
                Kindle-ready (.epub) download and a Kindle cover (.jpg)
                download for every product — available on top of either
                Standard or Pro. Purchase it, then come back and click
                &quot;Refresh my license&quot;.
              </p>
            )}
          </form>
        )}
      </div>

      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <h2 className="font-semibold text-zinc-900">OpenAI API key</h2>
        <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
          ProductGenie AI generates content using the OpenAI API. You can
          create a key at{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            platform.openai.com/api-keys
          </a>
          . Without a key saved, new products are generated as placeholder
          demo content so you can still try the product.
        </p>

        {loading ? (
          <p className="text-sm text-zinc-400 mt-6">Loading…</p>
        ) : (
          <div className="mt-6">
            {hasKey && (
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 mb-5">
                <div className="text-sm text-emerald-800">
                  <span className="font-semibold">Key saved:</span>{" "}
                  {masked}
                </div>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
              </div>
            )}

            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <label className="text-sm font-semibold text-zinc-800">
                {hasKey ? "Replace your API key" : "Add your API key"}
              </label>
              <input
                type="password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              {success && (
                <p className="text-sm text-emerald-600">{success}</p>
              )}
              <button
                type="submit"
                disabled={saving}
                className="self-start px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50"
              >
                {saving ? "Verifying…" : hasKey ? "Update key" : "Save key"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

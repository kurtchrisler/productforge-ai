"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/openai-key")
      .then((res) => res.json())
      .then((data) => {
        setHasKey(Boolean(data.hasKey));
        setMasked(data.masked ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

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

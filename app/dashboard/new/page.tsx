"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PRODUCT_TYPE_LIST,
  ProductTypeId,
  PRODUCT_LENGTH_LIST,
  ProductLength,
} from "@/lib/productTypes";

export default function NewProductPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [productType, setProductType] = useState<ProductTypeId>("ebook");
  const [length, setLength] = useState<ProductLength>("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/settings/openai-key")
      .then((res) => res.json())
      .then((data) => setHasKey(Boolean(data.hasKey)))
      .catch(() => setHasKey(null));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, productType, length }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed. Please try again.");
        setLoading(false);
        return;
      }
      router.push(`/dashboard/product/${data.productId}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">
        Create a new product
      </h1>
      <p className="text-zinc-500 text-sm mt-1 mb-8">
        Describe your idea, choose a format, and ProductGenie AI will write
        and typeset a complete, downloadable product.
      </p>

      {hasKey === false && (
        <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-4">
          <span>
            You haven&apos;t added an OpenAI API key yet, so products will be
            generated as placeholder demo content.
          </span>
          <Link
            href="/dashboard/settings"
            className="whitespace-nowrap font-semibold hover:underline"
          >
            Add your key →
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        <div>
          <label className="text-sm font-semibold text-zinc-800">
            Your idea
          </label>
          <textarea
            required
            minLength={5}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={4}
            placeholder="e.g. A 30-day meal-prep plan for busy parents who want to eat healthier without spending hours cooking"
            className="mt-2 w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <p className="text-xs text-zinc-400 mt-1">
            The more specific you are — audience, outcome, angle — the better
            the result.
          </p>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-800">
            Product type
          </label>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PRODUCT_TYPE_LIST.map((pt) => {
              const selected = productType === pt.id;
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setProductType(pt.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <div className="text-xl">{pt.emoji}</div>
                  <div className="text-sm font-semibold text-zinc-900 mt-1">
                    {pt.label}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 leading-snug">
                    {pt.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-800">
            Length
          </label>
          <div className="mt-2 grid grid-cols-3 gap-3">
            {PRODUCT_LENGTH_LIST.map((l) => {
              const selected = length === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLength(l.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <div className="text-sm font-semibold text-zinc-900">
                    {l.label}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 leading-snug">
                    {l.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto self-start px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          {loading && (
            <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Generating your product…" : "Generate product"}
        </button>
        {loading && (
          <p className="text-xs text-zinc-400 -mt-4">
            This writes the content and typesets a PDF, usually well under a
            minute.
          </p>
        )}
      </form>
    </div>
  );
}

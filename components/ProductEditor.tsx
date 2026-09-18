"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProductContent, ProductSection } from "@/lib/productTypes";

function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function arrayToLines(arr: string[] | undefined): string {
  return (arr ?? []).join("\n");
}

export default function ProductEditor({
  productId,
  initialContent,
  worksheetHint,
  sectionNoun,
}: {
  productId: number;
  initialContent: ProductContent;
  worksheetHint: boolean;
  sectionNoun: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ProductContent>(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof ProductContent>(
    field: K,
    value: ProductContent[K]
  ) {
    setContent((c) => ({ ...c, [field]: value }));
  }

  function updateSection(index: number, patch: Partial<ProductSection>) {
    setContent((c) => ({
      ...c,
      sections: c.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  function addSection() {
    setContent((c) => ({
      ...c,
      sections: [
        ...c.sections,
        { heading: "New section", body: "", bullets: [], worksheet: worksheetHint ? [] : undefined },
      ],
    }));
  }

  function removeSection(index: number) {
    setContent((c) => ({
      ...c,
      sections: c.sections.filter((_, i) => i !== index),
    }));
  }

  function moveSection(index: number, dir: -1 | 1) {
    setContent((c) => {
      const target = index + dir;
      if (target < 0 || target >= c.sections.length) return c;
      const sections = [...c.sections];
      [sections[index], sections[target]] = [sections[target], sections[index]];
      return { ...c, sections };
    });
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);
    if (!content.title.trim()) {
      setError("Give the product a title.");
      return;
    }
    if (content.sections.length === 0) {
      setError("Add at least one section.");
      return;
    }
    if (content.sections.some((s) => !s.heading.trim() || !s.body.trim())) {
      setError("Every section needs a heading and body.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save your changes.");
        return;
      }
      setSuccess("Saved — the PDF has been regenerated.");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2.5 rounded-lg border border-zinc-300 text-zinc-700 font-semibold text-sm hover:bg-zinc-50 transition"
      >
        Edit content
      </button>
    );
  }

  return (
    <div className="mt-8 border border-zinc-200 rounded-xl bg-white p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-semibold text-zinc-900">Edit content</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-zinc-500 hover:text-zinc-800"
        >
          Close
        </button>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <label className="text-sm font-semibold text-zinc-800">Title</label>
          <input
            value={content.title}
            onChange={(e) => updateField("title", e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-zinc-800">Subtitle</label>
          <input
            value={content.subtitle}
            onChange={(e) => updateField("subtitle", e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-zinc-800">Tagline</label>
          <input
            value={content.tagline}
            onChange={(e) => updateField("tagline", e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-zinc-800">Introduction</label>
          <textarea
            value={content.introduction}
            onChange={(e) => updateField("introduction", e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="border-t border-zinc-200 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-800">Sections</h3>
            <button
              type="button"
              onClick={addSection}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              + Add {sectionNoun}
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {content.sections.map((section, i) => (
              <div key={i} className="border border-zinc-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {sectionNoun} {i + 1}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => moveSection(i, -1)}
                      disabled={i === 0}
                      className="text-zinc-500 hover:text-zinc-800 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(i, 1)}
                      disabled={i === content.sections.length - 1}
                      className="text-zinc-500 hover:text-zinc-800 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSection(i)}
                      className="text-red-600 hover:text-red-700 font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <label className="text-xs font-semibold text-zinc-600">Heading</label>
                <input
                  value={section.heading}
                  onChange={(e) => updateSection(i, { heading: e.target.value })}
                  className="mt-1 mb-3 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <label className="text-xs font-semibold text-zinc-600">Body</label>
                <textarea
                  value={section.body}
                  onChange={(e) => updateSection(i, { body: e.target.value })}
                  rows={4}
                  className="mt-1 mb-3 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <label className="text-xs font-semibold text-zinc-600">
                  Bullets (one per line)
                </label>
                <textarea
                  value={arrayToLines(section.bullets)}
                  onChange={(e) =>
                    updateSection(i, { bullets: linesToArray(e.target.value) })
                  }
                  rows={3}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                {worksheetHint && (
                  <>
                    <label className="text-xs font-semibold text-zinc-600 mt-3 block">
                      Worksheet lines (one per line)
                    </label>
                    <textarea
                      value={arrayToLines(section.worksheet)}
                      onChange={(e) =>
                        updateSection(i, { worksheet: linesToArray(e.target.value) })
                      }
                      rows={3}
                      className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-800">Conclusion</label>
          <textarea
            value={content.conclusion}
            onChange={(e) => updateField("conclusion", e.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-zinc-800">Call to action</label>
          <input
            value={content.callToAction}
            onChange={(e) => updateField("callToAction", e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {saving && (
              <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {saving ? "Saving & regenerating PDF…" : "Save & regenerate PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

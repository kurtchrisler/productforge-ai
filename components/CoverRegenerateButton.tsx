"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CoverRegenerateButton({
  productId,
  hasCover,
}: {
  productId: number;
  hasCover: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/cover`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "Couldn't generate cover art.");
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-5 py-2.5 rounded-lg border border-zinc-300 text-zinc-700 font-semibold text-sm hover:bg-zinc-50 transition disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
      >
        {loading && (
          <span className="h-4 w-4 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
        )}
        {loading
          ? "Generating cover art…"
          : hasCover
            ? "Regenerate cover"
            : "Generate cover art"}
      </button>
      {error && (
        <p className="text-xs text-red-600 max-w-xs text-right">{error}</p>
      )}
    </div>
  );
}

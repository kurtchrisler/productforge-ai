"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteProductButton({
  productId,
}: {
  productId: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this product? This can't be undone.")) return;
    setLoading(true);
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-3 py-2 rounded-md border border-zinc-300 text-zinc-500 text-sm hover:bg-zinc-50 hover:text-red-600 hover:border-red-200 transition disabled:opacity-50"
      title="Delete"
    >
      {loading ? "…" : "Delete"}
    </button>
  );
}

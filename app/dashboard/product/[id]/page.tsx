import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb, Product } from "@/lib/db";
import {
  PRODUCT_TYPES,
  ProductTypeId,
  ProductContent,
  PRODUCT_LENGTHS,
  ProductLength,
} from "@/lib/productTypes";
import ProductEditor from "@/components/ProductEditor";
import CoverRegenerateButton from "@/components/CoverRegenerateButton";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const product = db
    .prepare("SELECT * FROM products WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Product | undefined;

  if (!product) notFound();

  const meta = PRODUCT_TYPES[product.product_type as ProductTypeId];
  const lengthMeta = PRODUCT_LENGTHS[(product.length as ProductLength) || "medium"];

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-500 hover:text-zinc-800 transition"
      >
        ← Back to dashboard
      </Link>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {meta?.emoji} {meta?.label ?? product.product_type}
            {lengthMeta ? ` · ${lengthMeta.label}` : ""}
          </span>
          <h1 className="text-2xl font-bold text-zinc-900 mt-1">
            {product.title || product.idea}
          </h1>
        </div>

        {product.status === "ready" && product.content_json && (
          <div className="flex items-center gap-3">
            <a
              href={`/api/products/${product.id}/pdf`}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition shadow-sm whitespace-nowrap"
            >
              Download PDF
            </a>
            <ProductEditor
              productId={product.id}
              initialContent={JSON.parse(product.content_json) as ProductContent}
              worksheetHint={meta?.worksheetHint ?? false}
              sectionNoun={meta?.sectionNoun ?? "section"}
            />
            <CoverRegenerateButton
              productId={product.id}
              hasCover={Boolean(product.cover_image_path)}
            />
          </div>
        )}
      </div>

      {product.status === "ready" &&
        !product.cover_image_path &&
        product.cover_error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="font-semibold">No cover art yet:</span>{" "}
            {product.cover_error}
          </div>
        )}

      {product.status === "generating" && (
        <div className="mt-10 border border-dashed border-zinc-300 rounded-xl p-12 text-center bg-white">
          <div className="h-8 w-8 mx-auto border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-zinc-500 mt-4">Still generating — refresh in a moment.</p>
        </div>
      )}

      {product.status === "error" && (
        <div className="mt-10 border border-red-200 bg-red-50 rounded-xl p-8 text-center">
          <p className="text-red-700 font-medium">Generation failed.</p>
          {product.error && (
            <p className="text-red-500 text-sm mt-2">{product.error}</p>
          )}
        </div>
      )}

      {product.status === "ready" && product.html && (
        <div className="mt-8 border border-zinc-200 rounded-xl overflow-hidden bg-zinc-100">
          <div className="bg-white border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            Preview
          </div>
          <iframe
            srcDoc={product.html}
            className="w-full bg-white"
            style={{ height: "80vh", border: "none" }}
            title="Product preview"
          />
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb, Product } from "@/lib/db";
import { PRODUCT_TYPES, ProductTypeId } from "@/lib/productTypes";
import DeleteProductButton from "@/components/DeleteProductButton";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: Product["status"] }) {
  const styles: Record<Product["status"], string> = {
    pending: "bg-zinc-100 text-zinc-600",
    generating: "bg-amber-100 text-amber-700",
    ready: "bg-emerald-100 text-emerald-700",
    error: "bg-red-100 text-red-700",
  };
  const labels: Record<Product["status"], string> = {
    pending: "Pending",
    generating: "Generating…",
    ready: "Ready",
    error: "Failed",
  };
  return (
    <span
      className={`text-xs font-medium px-2 py-1 rounded-full ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export default async function DashboardPage() {
  const db = getDb();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const products = db
    .prepare(
      "SELECT * FROM products WHERE user_id = ? ORDER BY id DESC"
    )
    .all(user.id) as Product[];

  return (
    <div className="max-w-5xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Your products
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            {user.name ? `Welcome back, ${user.name}.` : "Welcome back."}{" "}
            {products.length === 0
              ? "Create your first digital product below."
              : `You've created ${products.length} product${
                  products.length === 1 ? "" : "s"
                }.`}
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition shadow-sm"
        >
          + New product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="border border-dashed border-zinc-300 rounded-xl p-12 text-center bg-white">
          <div className="text-4xl mb-3">✨</div>
          <p className="text-zinc-600">
            No products yet. Describe an idea and get a ready-to-sell PDF in
            minutes.
          </p>
          <Link
            href="/dashboard/new"
            className="inline-block mt-5 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition"
          >
            Create your first product
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((p) => {
            const meta = PRODUCT_TYPES[p.product_type as ProductTypeId];
            return (
              <div
                key={p.id}
                className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col gap-3 hover:shadow-md transition"
                style={{ borderTopColor: meta?.accent, borderTopWidth: 3 }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {meta?.emoji} {meta?.label ?? p.product_type}
                  </span>
                  <StatusBadge status={p.status} />
                </div>
                <div className="font-semibold text-zinc-900 line-clamp-2">
                  {p.title || p.idea}
                </div>
                <div className="text-xs text-zinc-400">
                  {new Date(p.created_at).toLocaleString()}
                </div>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <Link
                    href={`/dashboard/product/${p.id}`}
                    className="flex-1 text-center px-3 py-2 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition"
                  >
                    View
                  </Link>
                  <DeleteProductButton productId={p.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

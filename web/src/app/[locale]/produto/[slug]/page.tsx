import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ProductDetail from "@/components/ProductDetail";
import Footer from "@/components/Footer";

export const dynamic = "force-dynamic";

export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("product");

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link
            href="/"
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {t("backToCatalog")}
          </Link>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <ProductDetail slug={slug} />
      </div>

      <Footer />
    </div>
  );
}

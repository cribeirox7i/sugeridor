import { getTranslations } from "next-intl/server";
import InstitutionalPage from "@/components/InstitutionalPage";

export default async function TermosPage() {
  const [t, tProduct] = await Promise.all([
    getTranslations("termsPage"),
    getTranslations("product"),
  ]);

  return <InstitutionalPage title={t("title")} body={t("body")} backLabel={tProduct("backToCatalog")} />;
}

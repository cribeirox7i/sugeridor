import { revalidatePath } from "next/cache";
import { routing } from "@/i18n/routing";

// Com rotas prefixadas por locale (/pt/..., /en/..., /es/...), cada idioma é
// uma entrada de cache separada — revalida todas de uma vez.
export function revalidateAllLocales(path: string) {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}${path}`);
  }
}

import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Link/usePathname/useRouter cientes de locale — trocar de idioma preserva a
// página atual. Ver web/src/components/LanguageSwitcher.tsx.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

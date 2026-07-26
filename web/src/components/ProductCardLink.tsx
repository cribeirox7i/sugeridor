"use client";

import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { MODAL_FROM_GRID_KEY } from "@/lib/modalNav";

// Abre o produto no popup (?produto=slug) preservando os filtros ativos da
// home, em vez de navegar pra /produto/slug. Usado tanto na imagem quanto no
// nome do produto no card — o card inteiro leva ao mesmo lugar.
export default function ProductCardLink({
  slug,
  className,
  children,
}: {
  slug: string;
  className?: string;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set("produto", slug);

  return (
    <Link
      href={`/?${params.toString()}`}
      className={className}
      onClick={() => sessionStorage.setItem(MODAL_FROM_GRID_KEY, "1")}
    >
      {children}
    </Link>
  );
}

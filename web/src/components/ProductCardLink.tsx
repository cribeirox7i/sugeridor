"use client";

import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";

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
    <Link href={`/?${params.toString()}`} className={className}>
      {children}
    </Link>
  );
}

"use client";

import ProductImage from "@/components/ProductImage";

export default function ProductDetailImage({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  return (
    <div className="h-full w-full p-4">
      <ProductImage
        src={src}
        alt={alt}
        fallback={<span className="text-6xl">🍺</span>}
      />
    </div>
  );
}

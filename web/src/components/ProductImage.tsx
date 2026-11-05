"use client";

import { useState, useEffect, useRef } from "react";

export default function ProductImage({
  src,
  alt,
  onFailed,
}: {
  src: string;
  alt: string;
  onFailed?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // O erro pode ter disparado antes do React hidratar e anexar o onError
    // sintético. naturalWidth === 0 detecta o caso "carregou mas está quebrado".
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailed(true);
      onFailed?.();
    }
  }, [onFailed]);

  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className="h-full w-full object-contain"
      onError={() => {
        setFailed(true);
        onFailed?.();
      }}
    />
  );
}

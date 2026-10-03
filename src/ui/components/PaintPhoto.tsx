import { useState } from "react";

import type { Paint } from "../../domain/types";
import { PaintSwatch } from "./PaintSwatch";

interface PaintPhotoProps {
  paint: Paint;
  /** La da el puerto `PaintImages`; `null` = no hay foto de esta referencia. */
  url: string | null;
}

/**
 * La foto del bote si hay una, y si no el swatch de color de siempre. No
 * decide si hay foto: eso lo responde el puerto, y aquí solo se pinta.
 */
export function PaintPhoto({ paint, url }: PaintPhotoProps) {
  // El manifiesto puede quedarse atrás (una foto borrada a mano): si la carga
  // falla, se vuelve al swatch en vez de dejar un hueco roto.
  const [failed, setFailed] = useState(false);

  if (url === null || failed) {
    return <PaintSwatch hex={paint.hex} label={paint.hex} size="lg" title={paint.name} />;
  }

  return (
    <img
      src={url}
      alt={`Bote de ${paint.name} (${paint.code})`}
      // 286 tarjetas en el catálogo: solo se pide lo que llega a verse.
      loading="lazy"
      decoding="async"
      // El tamaño de la miniatura: reserva el hueco y la cuadrícula no salta.
      width={320}
      height={320}
      className="h-40 w-full rounded-md object-contain"
      onError={() => setFailed(true)}
    />
  );
}

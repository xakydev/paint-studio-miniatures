import { createContext, use } from "react";

import type { PaintImages } from "../../data/ports/PaintImages";

/**
 * Sin proveedor no hay fotos: así una tarjeta montada en un test, en una
 * historia aislada o en un despliegue se ve exactamente como antes de que
 * existieran. Solo `main.tsx` decide qué adaptador va detrás.
 */
const NO_PAINT_IMAGES: PaintImages = { photoUrl: () => null };

export const PaintImagesContext = createContext<PaintImages>(NO_PAINT_IMAGES);

export function usePaintImages(): PaintImages {
  return use(PaintImagesContext);
}

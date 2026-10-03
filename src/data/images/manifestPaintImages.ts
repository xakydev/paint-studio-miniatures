import { paintImageUrls } from "virtual:paint-images";

import type { PaintImages } from "../ports/PaintImages";
import { PAINT_BY_CODE } from "../static/catalogSource";

/**
 * La misma lista blanca que el middleware de `vite/paintImagesPlugin.ts`: una
 * URL que no case con ella sería un 404 seguro, así que ni se ofrece. También
 * descarta, por construcción, cualquier URL externa.
 */
function isServableUrl(code: string, url: string): boolean {
  return url === `/paints/${code}.webp`;
}

/**
 * Adaptador sobre el manifiesto de fotos locales. Solo reconoce códigos del
 * catálogo: un manifiesto viejo o editado a mano no puede colar una foto de
 * una referencia que la app no conoce.
 */
export function createManifestPaintImages(urls: Readonly<Record<string, string>>): PaintImages {
  const byCode = new Map<string, string>();
  for (const [code, url] of Object.entries(urls)) {
    if (PAINT_BY_CODE.has(code) && isServableUrl(code, url)) byCode.set(code, url);
  }
  // Un Map y no el objeto: `photoUrl("toString")` no puede devolver nada heredado.
  return { photoUrl: (code) => byCode.get(code) ?? null };
}

/**
 * El adaptador de la app. En producción el módulo virtual es siempre `{}`, así
 * que nunca hay foto y la tarjeta se ve como siempre.
 */
export const manifestPaintImages: PaintImages = createManifestPaintImages(paintImageUrls);

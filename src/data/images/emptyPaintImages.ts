/**
 * Sustituto de `virtual:paint-images` en Vitest, que no carga el plugin de
 * Vite: igual que un clon sin fotos o un build de producción, no hay ninguna.
 * Los tests que necesitan fotos construyen su propio adaptador con
 * `createManifestPaintImages`.
 */
export const paintImageUrls: Readonly<Record<string, string>> = {};

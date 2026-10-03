/**
 * Tipos del módulo virtual que genera `vite/paintImagesPlugin.ts`: código →
 * URL de la miniatura local. En `npm run dev` refleja las fotos de
 * `local-assets/paints/`; en el build es SIEMPRE un objeto vacío, de modo que
 * producción no puede referenciar ninguna foto. En Vitest lo sustituye un
 * alias (`src/data/images/emptyPaintImages.ts`).
 *
 * Sin import/export de nivel superior: así el fichero es ambiental y el
 * `declare module` declara el módulo en vez de aumentar uno existente.
 */
declare module "virtual:paint-images" {
  export const paintImageUrls: Readonly<Record<string, string>>;
}

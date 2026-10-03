/**
 * ¿Hay foto local de esta referencia? La UI solo pregunta; de dónde sale la
 * respuesta (el manifiesto de `local-assets/` en desarrollo, nada en
 * producción) es cosa del adaptador. Así la tarjeta no sabe que existe Vite,
 * ni el script de descarga, ni la carpeta privada.
 */
export interface PaintImages {
  /** URL de la miniatura, o `null` si no hay foto de ese código. */
  photoUrl(code: string): string | null;
}

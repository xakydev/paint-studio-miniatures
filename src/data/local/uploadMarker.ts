import type { UploadMarker } from "../ports/UploadMarker";

const KEY_PREFIX = "paint-studio-miniatures:uploaded:v1:";

// La marca es por dispositivo: cada `userId` tiene su propia clave en este
// navegador, así que un segundo dispositivo también vuelca lo suyo (la
// guardia LWW del servidor lo hace seguro).

/**
 * Crea la marca de un usuario concreto. Toda lectura va en try/catch: un
 * fallo (ventana privada, cookies bloqueadas) cuenta como "no hecho", igual
 * que el resto de accesos a localStorage del proyecto.
 */
export function createUploadMarker(userId: string): UploadMarker {
  const key = `${KEY_PREFIX}${userId}`;

  return {
    isDone(): boolean {
      try {
        return localStorage.getItem(key) !== null;
      } catch {
        return false;
      }
    },
    markDone(): void {
      try {
        localStorage.setItem(key, "1");
      } catch (error) {
        // Los datos ya se subieron: repetir el volcado en el siguiente
        // login es seguro gracias a la guardia LWW. No se registra el
        // userId ni ningún otro dato personal.
        console.error("No se pudo guardar la marca de volcado completado.", error);
      }
    },
  };
}

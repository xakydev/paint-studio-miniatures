/**
 * Constancia de que el volcado del primer login ya se hizo. Es un puerto: el
 * caso de uso (`data/uploadLocalSnapshot.ts`) depende de este contrato y la
 * implementación concreta (`data/local/uploadMarker.ts`) lo cumple, sin que
 * ninguno de los dos conozca al otro.
 */
export interface UploadMarker {
  isDone(): boolean;
  markDone(): void;
}

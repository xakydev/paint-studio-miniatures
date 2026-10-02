import { useEffect, useState } from "react";

import {
  localCollectionRepository,
  localRecipeRepository,
} from "../../data/local/localRepositories";
import { createUploadMarker } from "../../data/local/uploadMarker";
import type { Backend, RepositoryPair } from "../../data/ports/Backend";
import type { UploadMarker } from "../../data/ports/UploadMarker";
import { uploadLocalSnapshotOnce } from "../../data/uploadLocalSnapshot";
import { SESSION_STATUS, type SessionApi } from "./sessionContext";

/**
 * De dónde salen los datos que se muestran:
 * - `RESOLVING`: aún no se sabe si hay sesión. No se muestra nada, para no
 *   enseñar lo local un instante y cambiarlo después por lo remoto.
 * - `UPLOADING`: hay sesión y se está volcando la copia local.
 * - `FAILED`: el volcado falló. La sesión sigue abierta y no se cae a lo
 *   local: «sesión abierta con datos locales» sería un estado ambiguo.
 * - `READY`: `repositories` es el origen bueno, local o remoto.
 */
export const SOURCE_STATUS = {
  RESOLVING: "resolving",
  UPLOADING: "uploading",
  FAILED: "failed",
  READY: "ready",
} as const;

export type SourceStatus = (typeof SOURCE_STATUS)[keyof typeof SOURCE_STATUS];

export interface LibrarySource {
  status: SourceStatus;
  /** Lo local en todo estado que no sea `READY` con sesión: solo vale en `READY`. */
  repositories: RepositoryPair;
  /** El motivo del fallo en `FAILED`; `null` en el resto. */
  error: string | null;
  /** Entradas que el volcado no subió por violar un límite de dominio. 0 = sin aviso. */
  skipped: number;
  /** En `FAILED`, repite el volcado completo. */
  retry(): void;
  dismissSkipped(): void;
}

/**
 * `local` y `markerFor` tienen que ser estables entre renders (constantes de
 * módulo o creadas una vez): si cambiaran de identidad, el efecto del volcado
 * se relanzaría en cada render.
 */
export interface LibrarySourceOptions {
  backend: Backend | null;
  session: Pick<SessionApi, "status" | "user">;
  /** Por defecto, localStorage. Los tests pasan repositorios en memoria. */
  local?: RepositoryPair;
  /** Por defecto, la marca de localStorage por usuario. */
  markerFor?: (userId: string) => UploadMarker;
}

/** Cómo terminó el último volcado del usuario actual. */
interface UploadOutcome {
  status: typeof SOURCE_STATUS.READY | typeof SOURCE_STATUS.FAILED;
  error: string | null;
  skipped: number;
}

const LOCAL_REPOSITORIES: RepositoryPair = {
  collection: localCollectionRepository,
  recipes: localRecipeRepository,
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido.";
}

export function useLibrarySource({
  backend,
  session,
  local = LOCAL_REPOSITORIES,
  markerFor = createUploadMarker,
}: LibrarySourceOptions): LibrarySource {
  const userId =
    backend !== null && session.status === SESSION_STATUS.SIGNED_IN
      ? (session.user?.id ?? null)
      : null;

  const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
  // Cada «Reintentar» lo incrementa y relanza el efecto del volcado.
  const [attempt, setAttempt] = useState(0);
  const [trackedUserId, setTrackedUserId] = useState(userId);

  // Si cambia el usuario (o se cierra sesión), el resultado del volcado
  // anterior no vale: se descarta durante el render, igual que el reseteo de
  // LibraryProvider, para no pintar ni un frame con un FAILED o un READY viejo.
  if (trackedUserId !== userId) {
    setTrackedUserId(userId);
    setOutcome(null);
  }

  useEffect(() => {
    if (backend === null || userId === null) return;
    // Si el usuario cambia o cierra sesión con el volcado en marcha, el efecto
    // se limpia y su resultado se ignora: un volcado viejo no puede poner
    // READY con los repositorios de otro usuario. Con StrictMode corren dos
    // volcados a la vez; es inofensivo (la guardia LWW descarta el no-op) y
    // solo cuenta el segundo.
    let cancelled = false;
    uploadLocalSnapshotOnce(local, backend.repositoriesFor(userId), markerFor(userId)).then(
      ({ skipped }) => {
        if (!cancelled) setOutcome({ status: SOURCE_STATUS.READY, error: null, skipped });
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error("No se pudieron subir los datos locales.", error);
        setOutcome({ status: SOURCE_STATUS.FAILED, error: messageOf(error), skipped: 0 });
      },
    );
    return () => {
      cancelled = true;
    };
    // `attempt` no se lee dentro: está para que «Reintentar» relance el efecto.
  }, [backend, userId, attempt, local, markerFor]);

  const retry = () => {
    setOutcome(null);
    setAttempt((current) => current + 1);
  };
  const dismissSkipped = () => {
    setOutcome((current) => (current === null ? null : { ...current, skipped: 0 }));
  };
  const base = { error: null, skipped: 0, retry, dismissSkipped };

  if (backend !== null && session.status === SESSION_STATUS.RESOLVING) {
    return { ...base, status: SOURCE_STATUS.RESOLVING, repositories: local };
  }
  if (backend === null || userId === null) {
    return { ...base, status: SOURCE_STATUS.READY, repositories: local };
  }
  if (outcome === null) {
    return { ...base, status: SOURCE_STATUS.UPLOADING, repositories: local };
  }
  if (outcome.status === SOURCE_STATUS.FAILED) {
    return { ...base, ...outcome, repositories: local };
  }
  return { ...base, ...outcome, repositories: backend.repositoriesFor(userId) };
}

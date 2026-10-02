import type { AuthGateway, SessionUser, SessionUserListener } from "../ports/AuthGateway";
import type { Backend } from "../ports/Backend";
import {
  createInMemoryCollectionRepository,
  createInMemoryRecipeRepository,
} from "./inMemoryRepositories";

export interface MagicLinkRequest {
  email: string;
  redirectTo: string;
}

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * `AuthGateway` falso para los tests de la UI: no hay SDK ni red, y el test
 * decide cuándo llega la sesión (`emit`) y cuándo termina cada petición.
 */
export interface FakeAuthGateway extends AuthGateway {
  /** Avisa a los suscriptores, como el `INITIAL_SESSION` o un cambio de usuario. */
  emit(user: SessionUser | null): void;
  /** Cada petición de enlace recibida, en orden. */
  readonly magicLinkRequests: readonly MagicLinkRequest[];
  /** Deja pendientes las siguientes peticiones de enlace hasta `settleMagicLink`. */
  holdMagicLinks(): void;
  /** Termina la petición de enlace pendiente: sin error, resuelve; con error, rechaza. */
  settleMagicLink(error?: Error): void;
  /** Hace que los siguientes `signOut` rechacen con este error, sin cerrar la sesión. */
  failSignOut(error: Error | null): void;
  readonly signOutCount: number;
  readonly listenerCount: number;
}

export function createFakeAuthGateway(): FakeAuthGateway {
  const listeners = new Set<SessionUserListener>();
  const magicLinkRequests: MagicLinkRequest[] = [];
  let holding = false;
  let pending: PendingRequest | undefined;
  let signOutError: Error | null = null;
  let signOutCount = 0;

  const emit = (user: SessionUser | null) => {
    for (const listener of listeners) listener(user);
  };

  return {
    onUserChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    requestMagicLink(email, redirectTo) {
      magicLinkRequests.push({ email, redirectTo });
      if (!holding) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
    async signOut() {
      signOutCount += 1;
      if (signOutError) throw signOutError;
      // Como supabase-js: cerrar sesión avisa a los suscriptores con null.
      emit(null);
    },
    emit,
    magicLinkRequests,
    holdMagicLinks: () => {
      holding = true;
    },
    settleMagicLink: (error) => {
      const current = pending;
      pending = undefined;
      if (error) current?.reject(error);
      else current?.resolve();
    },
    failSignOut: (error) => {
      signOutError = error;
    },
    get signOutCount() {
      return signOutCount;
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

export interface InMemoryPair {
  collection: ReturnType<typeof createInMemoryCollectionRepository>;
  recipes: ReturnType<typeof createInMemoryRecipeRepository>;
}

/** Backend falso: el `AuthGateway` de arriba más repositorios en memoria por usuario. */
export interface InMemoryBackend extends Backend {
  auth: FakeAuthGateway;
  repositoriesFor(userId: string): InMemoryPair;
}

export function createInMemoryBackend(): InMemoryBackend {
  const pairs = new Map<string, InMemoryPair>();
  return {
    auth: createFakeAuthGateway(),
    // Misma instancia para el mismo usuario, igual que el backend real: si no,
    // el LibraryProvider lo leería como un cambio de origen en cada render.
    repositoriesFor(userId) {
      let pair = pairs.get(userId);
      if (pair === undefined) {
        pair = {
          collection: createInMemoryCollectionRepository(),
          recipes: createInMemoryRecipeRepository(),
        };
        pairs.set(userId, pair);
      }
      return pair;
    },
  };
}

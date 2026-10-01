import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryBackend,
  type InMemoryBackend,
  type InMemoryPair,
} from "../../data/memory/inMemoryBackend";
import {
  createInMemoryCollectionRepository,
  createInMemoryRecipeRepository,
} from "../../data/memory/inMemoryRepositories";
import type { SessionUser } from "../../data/ports/AuthGateway";
import type { Backend } from "../../data/ports/Backend";
import type { UploadMarker } from "../../data/ports/UploadMarker";
import { OWNERSHIP, type CollectionEntry } from "../../domain/types";
import { SESSION_STATUS, type SessionStatus } from "./sessionContext";
import { SOURCE_STATUS, useLibrarySource, type LibrarySource } from "./useLibrarySource";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ANA: SessionUser = { id: "user-ana", email: "ana@example.com" };
const BEA: SessionUser = { id: "user-bea", email: "bea@example.com" };

const VALID: CollectionEntry = {
  code: "AK11179",
  status: OWNERSHIP.OWNED,
  level: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const OUT_OF_RANGE: CollectionEntry = { ...VALID, code: "AK11181", level: 5 };

interface FakeMarker extends UploadMarker {
  done: boolean;
}

let container: HTMLDivElement;
let root: Root;
let backend: InMemoryBackend;
let local: InMemoryPair;
let markers: Map<string, FakeMarker>;
let source: LibrarySource | undefined;

/**
 * Se crea una vez por test y no en cada render: si `markerFor` cambiara de
 * identidad, el efecto del volcado se relanzaría en cada render.
 */
function markerFor(userId: string): FakeMarker {
  let marker = markers.get(userId);
  if (marker === undefined) {
    const created: FakeMarker = {
      done: false,
      isDone: () => created.done,
      markDone: () => {
        created.done = true;
      },
    };
    marker = created;
    markers.set(userId, marker);
  }
  return marker;
}

interface ProbeProps {
  backend: Backend | null;
  status: SessionStatus;
  user: SessionUser | null;
}

function Probe({ backend: currentBackend, status, user }: ProbeProps) {
  const current = useLibrarySource({
    backend: currentBackend,
    session: { status, user },
    local,
    markerFor,
  });
  useEffect(() => {
    source = current;
  });
  return <p>{current.status}</p>;
}

async function render(status: SessionStatus, user: SessionUser | null = null, strict = false) {
  const probe = <Probe backend={backend} status={status} user={user} />;
  await act(async () => {
    root.render(strict ? <StrictMode>{probe}</StrictMode> : probe);
  });
}

async function resolveLocal(entries: readonly CollectionEntry[] = [VALID]) {
  await act(async () => {
    local.collection.resolveLoad(entries);
    local.recipes.resolveLoad([]);
  });
}

function current(): LibrarySource {
  if (!source) throw new Error("El hook aún no ha renderizado.");
  return source;
}

beforeEach(() => {
  source = undefined;
  backend = createInMemoryBackend();
  local = {
    collection: createInMemoryCollectionRepository(),
    recipes: createInMemoryRecipeRepository(),
  };
  markers = new Map();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("useLibrarySource: sin sesión", () => {
  it("sin backend sirve lo local, sin volcar nada", async () => {
    await act(async () => {
      root.render(<Probe backend={null} status={SESSION_STATUS.DISABLED} user={null} />);
    });
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(local);
    expect(local.collection.loadCount).toBe(0);
  });

  it("con backend y sin sesión sirve lo local", async () => {
    await render(SESSION_STATUS.SIGNED_OUT);
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(local);
    expect(local.collection.loadCount).toBe(0);
  });

  it("mientras se resuelve la sesión no elige origen", async () => {
    await render(SESSION_STATUS.RESOLVING);
    expect(current().status).toBe(SOURCE_STATUS.RESOLVING);
  });
});

describe("useLibrarySource: volcado del primer login", () => {
  it("con sesión vuelca lo local y después sirve lo remoto", async () => {
    await render(SESSION_STATUS.SIGNED_IN, ANA);
    expect(current().status).toBe(SOURCE_STATUS.UPLOADING);

    await resolveLocal();
    const remote = backend.repositoriesFor(ANA.id);
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(remote);
    expect(remote.collection.upserts).toEqual([[VALID]]);
    expect(markerFor(ANA.id).done).toBe(true);
    // La copia local no se toca.
    expect(local.collection.upserts).toEqual([]);
  });

  it("informa de las entradas saltadas sin tratarlo como un fallo, y el aviso se puede cerrar", async () => {
    await render(SESSION_STATUS.SIGNED_IN, ANA);
    await resolveLocal([VALID, OUT_OF_RANGE]);

    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().error).toBeNull();
    expect(current().skipped).toBe(1);

    act(() => current().dismissSkipped());
    expect(current().skipped).toBe(0);
    expect(current().status).toBe(SOURCE_STATUS.READY);
  });

  it("si el volcado falla queda en FAILED, sin marcar y sin caer a lo local", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    backend.repositoriesFor(ANA.id).collection.failUpserts(new Error("sin red"));

    await render(SESSION_STATUS.SIGNED_IN, ANA);
    await resolveLocal();

    expect(current().status).toBe(SOURCE_STATUS.FAILED);
    expect(current().error).toBe("sin red");
    expect(current().repositories).not.toBe(backend.repositoriesFor(ANA.id));
    expect(markerFor(ANA.id).done).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it("retry repite el volcado completo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const remote = backend.repositoriesFor(ANA.id);
    remote.collection.failUpserts(new Error("sin red"));
    await render(SESSION_STATUS.SIGNED_IN, ANA);
    await resolveLocal();
    expect(current().status).toBe(SOURCE_STATUS.FAILED);

    remote.collection.failUpserts(null);
    await act(async () => current().retry());

    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().error).toBeNull();
    expect(current().repositories).toBe(remote);
    expect(remote.collection.upserts).toEqual([[VALID], [VALID]]);
    expect(markerFor(ANA.id).done).toBe(true);
  });

  it("cerrar sesión desde FAILED vuelve a lo local", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.repositoriesFor(ANA.id).collection.failUpserts(new Error("sin red"));
    await render(SESSION_STATUS.SIGNED_IN, ANA);
    await resolveLocal();
    expect(current().status).toBe(SOURCE_STATUS.FAILED);

    await render(SESSION_STATUS.SIGNED_OUT);
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(local);
    expect(current().error).toBeNull();
  });
});

describe("useLibrarySource: carreras", () => {
  it("cerrar sesión durante el volcado acaba en local aunque el volcado termine después", async () => {
    await render(SESSION_STATUS.SIGNED_IN, ANA);
    expect(current().status).toBe(SOURCE_STATUS.UPLOADING);

    // Se cierra sesión con la carga local aún pendiente.
    await render(SESSION_STATUS.SIGNED_OUT);
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(local);

    // El volcado viejo termina ahora: no puede poner READY con lo de Ana.
    await resolveLocal();
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(local);
  });

  it("el volcado de un usuario anterior no da por terminado el del nuevo", async () => {
    // El volcado de Bea se queda colgado en la subida; el de Ana no.
    let finishBeaUpsert = () => {};
    vi.spyOn(backend.repositoriesFor(BEA.id).collection, "upsert").mockReturnValue(
      new Promise<void>((resolve) => {
        finishBeaUpsert = resolve;
      }),
    );

    await render(SESSION_STATUS.SIGNED_IN, ANA);
    await render(SESSION_STATUS.SIGNED_OUT);
    await render(SESSION_STATUS.SIGNED_IN, BEA);
    expect(current().status).toBe(SOURCE_STATUS.UPLOADING);

    // El volcado de Ana termina ahora, con Bea aún subiendo: no cuenta.
    await resolveLocal();
    expect(backend.repositoriesFor(ANA.id).collection.upserts).toEqual([[VALID]]);
    expect(current().status).toBe(SOURCE_STATUS.UPLOADING);

    await act(async () => finishBeaUpsert());
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(backend.repositoriesFor(BEA.id));
  });

  it("volver a entrar tras un FAILED no arrastra el error viejo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const remote = backend.repositoriesFor(ANA.id);
    remote.collection.failUpserts(new Error("sin red"));
    await render(SESSION_STATUS.SIGNED_IN, ANA);
    await resolveLocal();
    expect(current().status).toBe(SOURCE_STATUS.FAILED);

    remote.collection.failUpserts(null);
    await render(SESSION_STATUS.SIGNED_OUT);
    // Al volver a entrar se ve UPLOADING en el primer render, no el FAILED de antes.
    act(() => {
      root.render(<Probe backend={backend} status={SESSION_STATUS.SIGNED_IN} user={ANA} />);
    });
    expect(container.textContent).toBe(SOURCE_STATUS.UPLOADING);

    await act(async () => {});
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(remote);
  });

  it("con StrictMode el doble efecto acaba en READY con lo remoto", async () => {
    await render(SESSION_STATUS.SIGNED_IN, ANA, true);
    expect(current().status).toBe(SOURCE_STATUS.UPLOADING);

    await resolveLocal();
    const remote = backend.repositoriesFor(ANA.id);
    expect(current().status).toBe(SOURCE_STATUS.READY);
    expect(current().repositories).toBe(remote);
    expect(markerFor(ANA.id).done).toBe(true);
    // Los dos volcados son inofensivos: el segundo sube lo mismo y la
    // guardia LWW del servidor descarta el no-op.
    for (const batch of remote.collection.upserts) expect(batch).toEqual([VALID]);
  });
});

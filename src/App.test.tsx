import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { createInMemoryBackend, type InMemoryBackend } from "./data/memory/inMemoryBackend";
import { OWNERSHIP, type CollectionEntry } from "./domain/types";

// Sin esto React avisa de que el entorno no espera llamadas a act().
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Humo, no cobertura: comprueba que el árbol entero monta —proveedor, router y
 * las cuatro páginas— con datos reales. El build y los tests de lógica no
 * detectan un contexto mal enchufado o una ruta rota.
 */
let container: HTMLDivElement;
let root: Root;

function navigate(path: string) {
  window.history.pushState({}, "", path);
}

beforeEach(() => {
  localStorage.clear();
  navigate("/");
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

/** Async: el `act` asíncrono vacía la microtarea del `load` de los repositorios. */
async function render() {
  await act(async () => {
    root.render(<App />);
  });
}

describe("App", () => {
  it("monta el catálogo en la ruta raíz", async () => {
    await render();
    expect(container.textContent).toContain("Catálogo AK Interactive");
    expect(container.textContent).toContain("287 referencias");
  });

  it("monta la lista de recetas", async () => {
    navigate("/recetas");
    await render();
    expect(container.textContent).toContain("Marine espacial azul");
  });

  it("monta el detalle de una receta con sus zonas", async () => {
    navigate("/recetas/space-marine-azul");
    await render();
    expect(container.textContent).toContain("Armadura");
    expect(container.textContent).toContain("Ultramarine");
    expect(container.textContent).toContain("Te faltan");
  });

  it("monta el buscador por color con su mejor coincidencia", async () => {
    navigate("/matcher");
    await render();
    expect(container.textContent).toContain("Buscar pintura por color");
    // El color inicial es exactamente el hex de AK11434 Red Brown.
    expect(container.textContent).toContain("AK11434");
  });

  it("monta la colección vacía con su mensaje de ayuda", async () => {
    navigate("/coleccion");
    await render();
    expect(container.textContent).toContain("0 en el armario");
    expect(container.textContent).toContain("Todavía no has marcado ninguna");
  });

  it("sin backend no ofrece iniciar sesión", async () => {
    await render();
    expect(container.textContent).not.toContain("Entrar");
    expect(container.textContent).not.toContain("Cerrar sesión");
  });

  it("recupera de localStorage lo que ya estaba guardado", async () => {
    localStorage.setItem(
      "paint-studio-miniatures:collection:v1",
      JSON.stringify([
        {
          code: "AK11179",
          status: "owned",
          level: 3,
          updatedAt: new Date().toISOString(),
        },
      ]),
    );

    navigate("/coleccion");
    await render();
    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).toContain("Ultramarine");
  });
});

const COLLECTION_KEY = "paint-studio-miniatures:collection:v1";
const ANA = { id: "user-ana", email: "ana@example.com" };

/** AK11179 (Ultramarine), guardada en este dispositivo antes de iniciar sesión. */
const LOCAL_ENTRY: CollectionEntry = {
  code: "AK11179",
  status: OWNERSHIP.OWNED,
  level: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};
/** AK11181, que solo existe en la cuenta remota. */
const REMOTE_ENTRY: CollectionEntry = { ...LOCAL_ENTRY, code: "AK11181" };

describe("App con backend", () => {
  let backend: InMemoryBackend;

  beforeEach(() => {
    backend = createInMemoryBackend();
    localStorage.setItem(COLLECTION_KEY, JSON.stringify([LOCAL_ENTRY]));
  });

  async function renderWithBackend() {
    await act(async () => {
      root.render(<App backend={backend} />);
    });
  }

  async function signIn() {
    await act(async () => backend.auth.emit(ANA));
  }

  /** Resuelve la carga remota de Ana con su colección y sin recetas. */
  async function resolveRemote(entries: readonly CollectionEntry[] = [REMOTE_ENTRY]) {
    const remote = backend.repositoriesFor(ANA.id);
    await act(async () => {
      remote.collection.resolveLoad(entries);
      remote.recipes.resolveLoad([]);
    });
  }

  async function click(el: Element) {
    await act(async () => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }

  function buttonWith(text: string): HTMLButtonElement {
    const found = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes(text),
    );
    if (!found) throw new Error(`No hay botón con el texto "${text}"`);
    return found;
  }

  const statusText = () => container.querySelector('[role="status"]')?.textContent;
  const alertText = () => container.querySelector('[role="alert"]')?.textContent;

  it("mientras se resuelve la sesión no muestra datos de ningún origen", async () => {
    await renderWithBackend();
    expect(statusText()).toBe("Comprobando tu sesión…");
    expect(container.textContent).not.toContain("Catálogo AK Interactive");
  });

  it("sin sesión sirve lo local y ofrece «Entrar»", async () => {
    navigate("/coleccion");
    await renderWithBackend();
    await act(async () => backend.auth.emit(null));

    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).toContain("Ultramarine");
    expect(buttonWith("Entrar")).toBeTruthy();
  });

  it("al entrar vuelca lo local y después muestra lo remoto", async () => {
    const remote = backend.repositoriesFor(ANA.id);
    let finishUpload = () => {};
    vi.spyOn(remote.collection, "upsert").mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishUpload = resolve;
      }),
    );

    navigate("/coleccion");
    await renderWithBackend();
    await signIn();
    expect(statusText()).toBe("Subiendo tus datos locales…");
    expect(remote.collection.upsert).toHaveBeenCalledWith([LOCAL_ENTRY]);

    await act(async () => finishUpload());
    await resolveRemote();

    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).toContain("AK11181");
    expect(container.textContent).not.toContain("Ultramarine");
    expect(container.textContent).toContain("ana@example.com");
    expect(container.textContent).not.toContain("Entrar");
  });

  it("con la sesión ya iniciada al volver del enlace no muestra el formulario", async () => {
    // Vuelta del enlace mágico: el hash lo recoge supabase-js, no el router.
    navigate("/#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer");
    await renderWithBackend();
    await signIn();
    await resolveRemote();

    expect(container.textContent).not.toContain("Esa página no existe");
    expect(container.textContent).toContain("Catálogo AK Interactive");
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(container.textContent).not.toContain("Entrar");
  });

  it("un enlace caducado vuelve con un hash de error y la app sigue en el catálogo", async () => {
    navigate("/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
    await renderWithBackend();
    await act(async () => backend.auth.emit(null));

    expect(container.textContent).not.toContain("Esa página no existe");
    expect(container.textContent).toContain("Catálogo AK Interactive");
  });

  it("cerrar sesión vuelve a mostrar lo local, intacto", async () => {
    const before = localStorage.getItem(COLLECTION_KEY);
    navigate("/coleccion");
    await renderWithBackend();
    await signIn();
    await resolveRemote();
    expect(container.textContent).toContain("AK11181");

    await click(buttonWith("Cerrar sesión"));

    expect(backend.auth.signOutCount).toBe(1);
    expect(container.textContent).toContain("Ultramarine");
    expect(container.textContent).not.toContain("AK11181");
    expect(buttonWith("Entrar")).toBeTruthy();
    expect(localStorage.getItem(COLLECTION_KEY)).toBe(before);
  });

  it("si el volcado falla, muestra el error con «Reintentar» y «Cerrar sesión» y ningún dato", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const remote = backend.repositoriesFor(ANA.id);
    remote.collection.failUpserts(new Error("No se pudo guardar la colección en Supabase."));

    await renderWithBackend();
    await signIn();

    expect(alertText()).toContain("No se pudieron subir tus datos locales a tu cuenta.");
    expect(alertText()).toContain("No se pudo guardar la colección en Supabase.");
    expect(buttonWith("Reintentar")).toBeTruthy();
    expect(buttonWith("Cerrar sesión")).toBeTruthy();
    expect(container.textContent).not.toContain("Catálogo AK Interactive");

    // Reintentar repite el volcado completo y, si sale bien, entra.
    remote.collection.failUpserts(null);
    await click(buttonWith("Reintentar"));
    await resolveRemote();

    expect(remote.collection.upserts).toEqual([[LOCAL_ENTRY], [LOCAL_ENTRY]]);
    expect(container.textContent).toContain("Catálogo AK Interactive");
    expect(container.textContent).toContain("ana@example.com");
  });

  it("«Cerrar sesión» desde el volcado fallido vuelve a lo local", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    backend.repositoriesFor(ANA.id).collection.failUpserts(new Error("sin red"));
    navigate("/coleccion");
    await renderWithBackend();
    await signIn();

    await click(buttonWith("Cerrar sesión"));

    expect(backend.auth.signOutCount).toBe(1);
    expect(container.textContent).toContain("Ultramarine");
    expect(buttonWith("Entrar")).toBeTruthy();
  });

  it("si el volcado se salta entradas, lo avisa sin bloquear y el aviso se puede cerrar", async () => {
    localStorage.setItem(
      COLLECTION_KEY,
      JSON.stringify([LOCAL_ENTRY, { ...LOCAL_ENTRY, code: "AK11181", level: 5 }]),
    );
    await renderWithBackend();
    await signIn();
    await resolveRemote();

    expect(statusText()).toBe(
      "1 entrada de este dispositivo no se ha subido a tu cuenta porque tiene datos fuera de rango. Sigue guardada aquí.",
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("Catálogo AK Interactive");

    await click(buttonWith("Cerrar aviso"));
    expect(container.textContent).not.toContain("no se ha subido a tu cuenta");
    expect(container.textContent).toContain("Catálogo AK Interactive");
  });

  it("un guardado remoto que falla muestra el aviso sin revertir el cambio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renderWithBackend();
    await signIn();
    await resolveRemote([]);
    backend.repositoriesFor(ANA.id).collection.failUpserts(new Error("sin red"));
    expect(container.textContent).toContain("0 en armario");

    await click(buttonWith("La tengo"));

    expect(alertText()).toContain("No se ha podido guardar el último cambio.");
    expect(container.textContent).toContain("1 en armario");

    await click(buttonWith("Cerrar aviso"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("1 en armario");
  });

  it("un fallo al cargar lo remoto muestra el aviso de carga", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renderWithBackend();
    await signIn();
    const remote = backend.repositoriesFor(ANA.id);
    await act(async () => {
      remote.collection.rejectLoad(new Error("sin red"));
      remote.recipes.resolveLoad([]);
    });

    expect(alertText()).toContain("No se pudieron cargar tus datos");
  });
});

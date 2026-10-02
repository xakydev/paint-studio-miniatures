import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryCollectionRepository,
  createInMemoryRecipeRepository,
} from "../../data/memory/inMemoryRepositories";
import { OWNERSHIP } from "../../domain/types";
import { useLibrary } from "../hooks/libraryContext";
import { LibraryProvider } from "../hooks/LibraryProvider";
import { SaveErrorBanner } from "./SaveErrorBanner";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let collection: ReturnType<typeof createInMemoryCollectionRepository>;
let recipes: ReturnType<typeof createInMemoryRecipeRepository>;

/** Un botón que marca una pintura, para provocar una escritura desde la vista. */
function MarkOwned() {
  const { setStatus, statusOf } = useLibrary();
  return (
    <button type="button" onClick={() => setStatus("AK11179", OWNERSHIP.OWNED)}>
      Marcar ({statusOf("AK11179") ?? "sin marcar"})
    </button>
  );
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/** Como `click`, pero espera a que se rechace el `upsert` y llegue el aviso. */
async function clickAndSettle(el: Element) {
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

async function mountLoaded() {
  await act(async () => {
    root.render(
      <LibraryProvider collectionRepository={collection} recipeRepository={recipes}>
        <SaveErrorBanner />
        <MarkOwned />
      </LibraryProvider>,
    );
  });
  await act(async () => {
    collection.resolveLoad([]);
    recipes.resolveLoad([]);
  });
}

beforeEach(() => {
  collection = createInMemoryCollectionRepository();
  recipes = createInMemoryRecipeRepository();
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

describe("SaveErrorBanner", () => {
  it("sin error no pinta nada", async () => {
    await mountLoaded();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("un guardado fallido muestra la alerta y el cambio sigue en pantalla", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mountLoaded();
    collection.failUpserts(new Error("sin red"));

    await clickAndSettle(buttonWith("Marcar"));

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      "No se ha podido guardar el último cambio. Lo ves en pantalla, pero no está guardado: recarga para ver lo que hay guardado.",
    );
    expect(buttonWith("Marcar").textContent).toContain("owned");
  });

  it("«Cerrar aviso» lo retira sin deshacer el cambio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mountLoaded();
    collection.failUpserts(new Error("sin red"));
    await clickAndSettle(buttonWith("Marcar"));

    click(buttonWith("Cerrar aviso"));

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(buttonWith("Marcar").textContent).toContain("owned");
    expect(collection.upserts).toHaveLength(1);
  });
});

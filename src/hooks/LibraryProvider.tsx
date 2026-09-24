import { useEffect, useState, type ReactNode } from "react";

import { RECIPES } from "../lib/catalog";
import {
  loadCollection,
  loadCustomRecipes,
  makeEntry,
  saveCollection,
  saveCustomRecipes,
} from "../lib/storage";
import { OWNERSHIP, type CollectionEntry, type Ownership, type Recipe } from "../types";
import { LibraryContext, type LibraryApi } from "./libraryContext";

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CollectionEntry[]>(loadCollection);
  const [customRecipes, setCustomRecipes] = useState<Recipe[]>(loadCustomRecipes);

  useEffect(() => {
    saveCollection(entries);
  }, [entries]);

  useEffect(() => {
    saveCustomRecipes(customRecipes);
  }, [customRecipes]);

  const byCode = new Map(entries.map((entry) => [entry.code, entry]));

  const ownedCodes = new Set(
    entries.filter((e) => e.status === OWNERSHIP.OWNED).map((e) => e.code),
  );
  const wishlistCodes = new Set(
    entries.filter((e) => e.status === OWNERSHIP.WISHLIST).map((e) => e.code),
  );

  const patch = (code: string, changes: Partial<CollectionEntry>) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.code === code
          ? { ...entry, ...changes, updatedAt: new Date().toISOString() }
          : entry,
      ),
    );
  };

  const setStatus = (code: string, status: Ownership | null) => {
    if (status === null) {
      setEntries((current) => current.filter((entry) => entry.code !== code));
      return;
    }

    setEntries((current) =>
      current.some((entry) => entry.code === code)
        ? current.map((entry) =>
            entry.code === code
              ? { ...entry, status, updatedAt: new Date().toISOString() }
              : entry,
          )
        : [...current, makeEntry(code, status)],
    );
  };

  const api: LibraryApi = {
    entries,
    ownedCodes,
    wishlistCodes,
    statusOf: (code) => byCode.get(code)?.status ?? null,
    entryOf: (code) => byCode.get(code),
    setStatus,
    setLevel: (code, level) => patch(code, { level }),
    setNote: (code, note) => patch(code, { note }),
    addManyToWishlist: (codes) => {
      setEntries((current) => {
        const known = new Set(current.map((entry) => entry.code));
        const additions = codes
          .filter((code) => !known.has(code))
          .map((code) => makeEntry(code, OWNERSHIP.WISHLIST));
        return additions.length === 0 ? current : [...current, ...additions];
      });
    },
    replaceCollection: setEntries,
    clearCollection: () => setEntries([]),

    // Una receta propia con el mismo id que una de semilla la reemplaza: así se
    // puede corregir el esquema que viene de fábrica sin tocar el JSON.
    recipes: [
      ...customRecipes,
      ...RECIPES.filter((seed) => !customRecipes.some((r) => r.id === seed.id)),
    ],
    customRecipes,
    saveRecipe: (recipe) => {
      setCustomRecipes((current) => {
        const exists = current.some((r) => r.id === recipe.id);
        return exists
          ? current.map((r) => (r.id === recipe.id ? recipe : r))
          : [...current, recipe];
      });
    },
    deleteRecipe: (id) => {
      setCustomRecipes((current) => current.filter((recipe) => recipe.id !== id));
    },
  };

  return <LibraryContext value={api}>{children}</LibraryContext>;
}

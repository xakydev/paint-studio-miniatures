import { useEffect, useState, type ReactNode } from "react";

import {
  localCollectionRepository,
  localRecipeRepository,
} from "../../data/local/localRepositories";
import type { CollectionRepository } from "../../data/ports/CollectionRepository";
import type { RecipeRepository } from "../../data/ports/RecipeRepository";
import { RECIPES } from "../../data/static/catalogSource";
import { buildBackup } from "../../domain/backup";
import { markStatus, removeEntry, restoreCollection, upsertByKey } from "../../domain/collection";
import { mergeRecipes, type RecipeRecord } from "../../domain/recipes";
import { activeOnly } from "../../domain/tombstone";
import { OWNERSHIP, type CollectionEntry, type Recipe } from "../../domain/types";
import {
  LOAD_ERROR_MESSAGE,
  LOAD_STATUS,
  LibraryContext,
  SAVE_ERROR_MESSAGE,
  type LibraryApi,
  type LoadStatus,
} from "./libraryContext";

export interface LibraryProviderProps {
  children: ReactNode;
  /** Por defecto, localStorage. Los tests pasan uno en memoria. */
  collectionRepository?: CollectionRepository;
  recipeRepository?: RecipeRepository;
}

/** Los repositorios de los que salen los datos que hay en el estado. */
interface RepositorySource {
  collectionRepository: CollectionRepository;
  recipeRepository: RecipeRepository;
}

const entryKey = (entry: CollectionEntry) => entry.code;
const recipeKey = (recipe: RecipeRecord) => recipe.id;

/**
 * Al guardar, los metadatos de persistencia se rehacen: si llega un
 * `RecipeRecord` con `deletedAt`, guardarlo lo restaura.
 */
function toRecipeRecord(recipe: Recipe, now: string): RecipeRecord {
  const { updatedAt: _updatedAt, deletedAt: _deletedAt, ...fields } = recipe as RecipeRecord;
  return { ...fields, updatedAt: now };
}

/**
 * Los defaults son las constantes de módulo del adaptador local, no
 * instancias creadas en la firma: una instancia nueva por render cambiaría
 * las dependencias del efecto de carga y lo relanzaría en bucle.
 */
export function LibraryProvider({
  children,
  collectionRepository = localCollectionRepository,
  recipeRepository = localRecipeRepository,
}: LibraryProviderProps) {
  // Se guardan TODOS los registros, también los borrados: la exportación los
  // necesita y reactivar una pintura parte de su entrada borrada.
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [recipeRecords, setRecipeRecords] = useState<RecipeRecord[]>([]);
  // Arranca en LOADING, no en IDLE: el efecto de carga corre justo después
  // del primer render, y fijar el estado dentro de él provocaría un render
  // en cascada sin ninguna diferencia visible.
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(LOAD_STATUS.LOADING);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [source, setSource] = useState<RepositorySource>({
    collectionRepository,
    recipeRepository,
  });

  // Si cambia el origen de datos, lo del anterior no vale y hay que volver a
  // cargar antes de escribir nada. Se ajusta durante el render (el patrón que
  // documenta React para derivar estado de una prop), no en el efecto, para
  // no llegar a pintar ni a escribir con los datos del repositorio viejo.
  if (
    source.collectionRepository !== collectionRepository ||
    source.recipeRepository !== recipeRepository
  ) {
    setSource({ collectionRepository, recipeRepository });
    setEntries([]);
    setRecipeRecords([]);
    setLoadStatus(LOAD_STATUS.LOADING);
    // El aviso hablaba del origen anterior: con el nuevo no tiene sentido.
    setSaveError(null);
  }

  useEffect(() => {
    // Con StrictMode el efecto corre dos veces: la primera carga queda
    // cancelada y solo cuenta la segunda.
    let cancelled = false;

    // Suscritos antes de cargar, para no perder lo que llegue entretanto.
    const unsubscribeCollection = collectionRepository.subscribe((changed) => {
      setEntries((current) => upsertByKey(current, changed, entryKey));
    });
    const unsubscribeRecipes = recipeRepository.subscribe((changed) => {
      setRecipeRecords((current) => upsertByKey(current, changed, recipeKey));
    });

    void Promise.allSettled([collectionRepository.load(), recipeRepository.load()]).then(
      ([loadedEntries, loadedRecipes]) => {
        if (cancelled) return;

        // Si un repositorio falla se arranca con él vacío: es seguro, porque
        // `upsert` nunca borra lo que no se llegó a cargar.
        if (loadedEntries.status === "fulfilled") {
          // Lo cargado va debajo: un cambio llegado durante la carga es más nuevo.
          setEntries((current) => upsertByKey(loadedEntries.value, current, entryKey));
        } else {
          console.error("No se pudo cargar la colección.", loadedEntries.reason);
          setSaveError(LOAD_ERROR_MESSAGE);
        }
        if (loadedRecipes.status === "fulfilled") {
          setRecipeRecords((current) => upsertByKey(loadedRecipes.value, current, recipeKey));
        } else {
          console.error("No se pudieron cargar las recetas.", loadedRecipes.reason);
          setSaveError(LOAD_ERROR_MESSAGE);
        }
        setLoadStatus(LOAD_STATUS.READY);
      },
    );

    return () => {
      cancelled = true;
      unsubscribeCollection();
      unsubscribeRecipes();
    };
  }, [collectionRepository, recipeRepository]);

  // Único punto de escritura. Los registros cambiados se calculan fuera, con
  // las funciones puras de domain: el updater solo funde (StrictMode lo
  // ejecuta dos veces) y la escritura va después, fuera de él. Antes de
  // READY no se escribe nada, para no pisar lo guardado con un estado vacío.
  // Si la escritura falla no hay rollback: el cambio sigue en pantalla y el
  // aviso dice que no está guardado. El reintento llega con el sync.
  const reportSaveError = (error: unknown) => {
    console.error("No se pudo guardar el último cambio.", error);
    setSaveError(SAVE_ERROR_MESSAGE);
  };

  const commitEntries = (changed: CollectionEntry[]) => {
    if (loadStatus !== LOAD_STATUS.READY || changed.length === 0) return;
    setEntries((current) => upsertByKey(current, changed, entryKey));
    void collectionRepository.upsert(changed).catch(reportSaveError);
  };

  const commitRecipes = (changed: RecipeRecord[]) => {
    if (loadStatus !== LOAD_STATUS.READY || changed.length === 0) return;
    setRecipeRecords((current) => upsertByKey(current, changed, recipeKey));
    void recipeRepository.upsert(changed).catch(reportSaveError);
  };

  const now = () => new Date().toISOString();

  // La regla de "activo" se aplica aquí, una sola vez: nada de lo que sigue
  // (ni las vistas) ve un registro borrado.
  const activeEntries = activeOnly(entries);
  const activeByCode = new Map(activeEntries.map((entry) => [entry.code, entry]));
  const anyByCode = new Map(entries.map((entry) => [entry.code, entry]));
  const activeRecipes = activeOnly(recipeRecords);

  const ownedCodes = new Set(
    activeEntries.filter((e) => e.status === OWNERSHIP.OWNED).map((e) => e.code),
  );
  const wishlistCodes = new Set(
    activeEntries.filter((e) => e.status === OWNERSHIP.WISHLIST).map((e) => e.code),
  );

  const patch = (code: string, changes: Partial<CollectionEntry>) => {
    const entry = activeByCode.get(code);
    if (!entry) return;
    commitEntries([{ ...entry, ...changes, updatedAt: now() }]);
  };

  const api: LibraryApi = {
    status: loadStatus,
    entries: activeEntries,
    ownedCodes,
    wishlistCodes,
    statusOf: (code) => activeByCode.get(code)?.status ?? null,
    entryOf: (code) => activeByCode.get(code),
    setStatus: (code, status) => {
      if (status === null) {
        const entry = activeByCode.get(code);
        if (entry) commitEntries([removeEntry(entry, now())]);
        return;
      }
      // Se pasa la entrada aunque esté borrada: markStatus decide si la reactiva.
      commitEntries([markStatus(code, status, now(), anyByCode.get(code))]);
    },
    setLevel: (code, level) => patch(code, { level }),
    setNote: (code, note) => patch(code, { note }),
    addManyToWishlist: (codes) => {
      const timestamp = now();
      const missing = [...new Set(codes)].filter((code) => !activeByCode.has(code));
      commitEntries(
        missing.map((code) =>
          markStatus(code, OWNERSHIP.WISHLIST, timestamp, anyByCode.get(code)),
        ),
      );
    },
    replaceCollection: (imported) => {
      // Restaurar, no sustituir: lo que no viene en el fichero se marca como
      // borrado, porque escribir solo lo importado no quitaría nada.
      commitEntries(restoreCollection(entries, imported, now()));
    },
    clearCollection: () => {
      const timestamp = now();
      commitEntries(activeEntries.map((entry) => removeEntry(entry, timestamp)));
    },
    exportBackup: () => buildBackup(entries, recipeRecords, now()),

    // Una receta propia con el mismo id que una de semilla la reemplaza: así se
    // puede corregir el esquema que viene de fábrica sin tocar el JSON.
    recipes: mergeRecipes(recipeRecords, RECIPES),
    customRecipes: activeRecipes,
    saveRecipe: (recipe) => {
      commitRecipes([toRecipeRecord(recipe, now())]);
    },
    deleteRecipe: (id) => {
      const record = activeRecipes.find((recipe) => recipe.id === id);
      if (!record) return;
      const timestamp = now();
      commitRecipes([{ ...record, deletedAt: timestamp, updatedAt: timestamp }]);
    },

    saveError,
    dismissSaveError: () => setSaveError(null),
  };

  // Los consumidores nunca ven un estado a medias: hasta READY no se pintan.
  if (loadStatus !== LOAD_STATUS.READY) {
    return <p role="status">Cargando tu colección…</p>;
  }

  return <LibraryContext value={api}>{children}</LibraryContext>;
}

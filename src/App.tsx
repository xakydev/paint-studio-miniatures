import { BrowserRouter, Route, Routes } from "react-router-dom";

import type { Backend } from "./data/ports/Backend";
import type { PaintImages } from "./data/ports/PaintImages";
import { Layout } from "./ui/components/Layout";
import { UploadFailed, UploadSkippedNotice } from "./ui/components/UploadNotices";
import { LibraryProvider } from "./ui/hooks/LibraryProvider";
import { PaintImagesContext } from "./ui/hooks/paintImagesContext";
import { useSession } from "./ui/hooks/sessionContext";
import { SessionProvider } from "./ui/hooks/SessionProvider";
import { SOURCE_STATUS, useLibrarySource } from "./ui/hooks/useLibrarySource";
import { CatalogPage } from "./ui/routes/CatalogPage";
import { CollectionPage } from "./ui/routes/CollectionPage";
import { MatcherPage } from "./ui/routes/MatcherPage";
import { RecipeDetailPage } from "./ui/routes/RecipeDetailPage";
import { RecipesPage } from "./ui/routes/RecipesPage";

export interface AppProps {
  /**
   * Lo construye `main.tsx` a partir de las variables de entorno. `null` (el
   * valor por defecto) = sin backend: la app es local y no ofrece login. Así
   * ni App ni sus tests leen el entorno ni tocan la red.
   */
  backend?: Backend | null;
  /**
   * Fotos locales de los botes. Sin ella no hay fotos y las tarjetas muestran
   * el swatch de color, que es lo que pasa en los tests y en producción.
   */
  paintImages?: PaintImages;
}

export function App({ backend = null, paintImages }: AppProps) {
  const library = (
    <SessionProvider auth={backend?.auth ?? null}>
      <LibraryRoot backend={backend} />
    </SessionProvider>
  );
  // Sin adaptador no se monta el proveedor: rige el valor por defecto del
  // contexto (sin fotos), en vez de inventar uno aquí.
  return paintImages === undefined ? (
    library
  ) : (
    <PaintImagesContext value={paintImages}>{library}</PaintImagesContext>
  );
}

interface LibraryRootProps {
  backend: Backend | null;
}

/** Elige de dónde salen los datos según la sesión, y solo entonces monta la app. */
function LibraryRoot({ backend }: LibraryRootProps) {
  const session = useSession();
  const source = useLibrarySource({ backend, session });

  // Mientras no se sabe el origen no se monta LibraryProvider: mostraría lo
  // local un instante y luego lo cambiaría por lo remoto.
  if (source.status === SOURCE_STATUS.RESOLVING) {
    return <p role="status">Comprobando tu sesión…</p>;
  }
  if (source.status === SOURCE_STATUS.UPLOADING) {
    return <p role="status">Subiendo tus datos locales…</p>;
  }
  if (source.status === SOURCE_STATUS.FAILED) {
    return <UploadFailed error={source.error} onRetry={source.retry} />;
  }

  const notice =
    source.skipped > 0 ? (
      <UploadSkippedNotice count={source.skipped} onDismiss={source.dismissSkipped} />
    ) : null;

  // Al cambiar de origen (entrar o cerrar sesión) cambian los repositorios, y
  // LibraryProvider se resetea y recarga desde el nuevo.
  return (
    <LibraryProvider
      collectionRepository={source.repositories.collection}
      recipeRepository={source.repositories.recipes}
    >
      <BrowserRouter>
        <Routes>
          <Route element={<Layout notice={notice} />}>
            <Route index element={<CatalogPage />} />
            <Route path="recetas" element={<RecipesPage />} />
            <Route path="recetas/:id" element={<RecipeDetailPage />} />
            <Route path="matcher" element={<MatcherPage />} />
            <Route path="coleccion" element={<CollectionPage />} />
            <Route
              path="*"
              element={
                <p className="text-neutral-400">Esa página no existe.</p>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </LibraryProvider>
  );
}

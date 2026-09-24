import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { LibraryProvider } from "./hooks/LibraryProvider";
import { CatalogPage } from "./routes/CatalogPage";
import { CollectionPage } from "./routes/CollectionPage";
import { MatcherPage } from "./routes/MatcherPage";
import { RecipeDetailPage } from "./routes/RecipeDetailPage";
import { RecipesPage } from "./routes/RecipesPage";

export function App() {
  return (
    <LibraryProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
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

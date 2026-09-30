import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Layout } from "./ui/components/Layout";
import { LibraryProvider } from "./ui/hooks/LibraryProvider";
import { CatalogPage } from "./ui/routes/CatalogPage";
import { CollectionPage } from "./ui/routes/CollectionPage";
import { MatcherPage } from "./ui/routes/MatcherPage";
import { RecipeDetailPage } from "./ui/routes/RecipeDetailPage";
import { RecipesPage } from "./ui/routes/RecipesPage";

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

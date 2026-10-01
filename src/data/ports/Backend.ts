import type { AuthGateway } from "./AuthGateway";
import type { CollectionRepository } from "./CollectionRepository";
import type { RecipeRepository } from "./RecipeRepository";

/** Los dos repositorios de un mismo origen de datos, que siempre viajan juntos. */
export interface RepositoryPair {
  collection: CollectionRepository;
  recipes: RecipeRepository;
}

/**
 * Un backend remoto visto desde fuera: autenticación más los repositorios de
 * cada usuario. Vive en `ports` y no junto al adaptador para que el volcado y
 * la UI dependan del contrato, no de Supabase: solo la raíz de composición
 * (`main.tsx`) sabe qué implementación hay detrás.
 */
export interface Backend {
  auth: AuthGateway;
  /** Siempre la misma instancia para el mismo `userId`. */
  repositoriesFor(userId: string): RepositoryPair;
}

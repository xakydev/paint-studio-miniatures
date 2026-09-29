/**
 * Lo mínimo que necesita un registro para saber si está borrado
 * lógicamente. `CollectionEntry` y `RecipeRecord` lo cumplen por estructura.
 */
export interface Tombstoned {
  updatedAt: string;
  deletedAt?: string;
}

/** Un registro es activo si no tiene `deletedAt`: los puertos nunca borran. */
export function isActive(record: Tombstoned): boolean {
  return record.deletedAt === undefined;
}

/** Filtra los registros borrados. Es el único punto donde se aplica la regla. */
export function activeOnly<T extends Tombstoned>(records: readonly T[]): T[] {
  return records.filter(isActive);
}

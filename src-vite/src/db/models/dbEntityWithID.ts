import { SetOptional } from 'type-fest';

/** Function to generate IDs in the database and other parts of the app */
export const generateID = () => crypto.randomUUID();

type IfEquals<X, Y, A = X, B = never> =
  (<G>() => G extends X ? 1 : 2) extends <G>() => G extends Y ? 1 : 2 ? A : B;

type WritableKeys<T> = {
  [K in keyof T]-?: IfEquals<{ [Q in K]: T[K] }, { -readonly [Q in K]: T[K] }, K>;
}[keyof T];

/**
 * Utility type for constructor input.
 *
 * It keeps writable data properties from `T` while removing methods/getters.
 */
export type ModelInit<T> = {
  [K in WritableKeys<T> as T[K] extends (...args: never[]) => unknown ? never : K]: T[K];
};

/**
 * Base class for client-side models backed by an `id`.
 *
 * Conversions should happen at model boundaries:
 * - `static fromDB(...)` for deserialization from SQLite row shapes.
 * - `toDB()` for serialization back to SQLite row shapes.
 * - constructors should receive `ModelInit<YourClass>` whenever possible.
 */
export abstract class DbEntityWithID {
  id: string;

  constructor(id?: string) {
    this.id = id ?? generateID();
  }
}

export type WithOptionalID<T extends { id: string }> = SetOptional<T, 'id'>;

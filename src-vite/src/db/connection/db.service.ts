import { join } from '@tauri-apps/api/path';
import Database from '@tauri-apps/plugin-sql';
import {
  DeleteQueryBuilder,
  DeleteResult,
  InferResult,
  Insertable,
  InsertQueryBuilder,
  InsertResult,
  SelectQueryBuilder,
  UpdateQueryBuilder,
  UpdateResult,
} from 'kysely';
import { notifyTableUpdate } from '../api/tableObservables.ts';
import { SqliteDbStructure } from '../models/SqliteDbStructure.ts';
import { getAppDB } from './dbInstance.ts';
import { kyselyDB } from './kysely.ts';
import { getLibraryDataDir } from './libraryDataDir.ts';

export const getDbDir = getLibraryDataDir;
export const dbName = 'photokin.db';

export const getDbFullPath = async () => join(await getDbDir(), dbName);

export async function selectFromDB<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  db?: Database,
) {
  db ??= await getAppDB();

  const compiledQuery = query.compile();

  return db.select<InferResult<typeof compiledQuery>>(compiledQuery.sql, [...compiledQuery.parameters]);
}

export async function selectFirstFromDB<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  db?: Database,
) {
  const result = await selectFromDB(query, db);

  if (!Array.isArray(result)) {
    throw Error(
      'The result of this query did not return an array. Try executing the query from the `selectFromDB` function instead',
    );
  }

  return result.at(0);
}

export async function executeInDB<TB extends keyof SqliteDbStructure>(
  statement:
    | UpdateQueryBuilder<SqliteDbStructure, keyof SqliteDbStructure, TB, UpdateResult>
    | InsertQueryBuilder<SqliteDbStructure, TB, InsertResult>
    | DeleteQueryBuilder<SqliteDbStructure, TB, DeleteResult>,
  updatedTables: keyof SqliteDbStructure | (keyof SqliteDbStructure)[],
  db?: Database,
) {
  db ??= await getAppDB();

  const compiledQuery = statement.compile();

  const result = await db.execute(compiledQuery.sql, [...compiledQuery.parameters]);

  if (Array.isArray(updatedTables)) {
    // Notify the corresponding observables
    updatedTables.forEach((tableName) => {
      notifyTableUpdate(tableName);
    });
  } else {
    notifyTableUpdate(updatedTables);
  }

  return result;
}

/**
 * Inserts many rows into a single table as one multi-row statement, only
 * splitting into several statements when a single insert would exceed SQLite's
 * bound-parameter limit.
 *
 * This should be used only when we suspect that a single bulk insert will exceed the limits
 * of the SQLite database. If we are sure that the insert will not exceed the limits, we should use
 * the regular `executeInDB(kyselyDB.insertInto(table).values(rows))` method.
 */
export async function safelyExecuteBatchInsert<TB extends keyof SqliteDbStructure>(
  table: TB,
  rows: Insertable<SqliteDbStructure[TB]>[],
  db?: Database,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  // Modern SQLite (>= 3.32) allows 32766 bound variables per statement; staying
  // well below that leaves room for the binding overhead and any future schema
  // growth.
  const MAX_SQL_BIND_PARAMS = 18000;

  // Sample up to 3 random rows and use the largest key count among them, since
  // rows may have differing shapes (e.g. optional columns) and the first row
  // alone might undercount the real binding budget.
  const maxKeys = Math.max(
    ...Array.from({ length: Math.min(3, rows.length) }, () => {
      const randomRow = rows[Math.floor(Math.random() * rows.length)];
      return Object.keys(randomRow).length;
    }),
  );

  const columnsPerRow = Math.max(1, maxKeys * 2); // Multiplied by 2 just to be safer
  const rowsPerChunk = Math.max(1, Math.floor(MAX_SQL_BIND_PARAMS / columnsPerRow));

  for (let index = 0; index < rows.length; index += rowsPerChunk) {
    await executeInDB(kyselyDB.insertInto(table).values(rows.slice(index, index + rowsPerChunk)), table, db);
  }
}

// Initialize kysely just for using it as a query builder.
// See more at: https://kysely.dev/docs/recipes/splitting-query-building-and-execution

import {
  DummyDriver,
  Kysely,
  ParseJSONResultsPlugin,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from 'kysely';
import { SqliteDbStructure } from '../models/SqliteDbStructure.ts';

export const kyselyDB = new Kysely<SqliteDbStructure>({
  dialect: {
    createAdapter() {
      return new SqliteAdapter();
    },
    createDriver() {
      return new DummyDriver();
    },
    createIntrospector(db: Kysely<unknown>) {
      return new SqliteIntrospector(db);
    },
    createQueryCompiler() {
      return new SqliteQueryCompiler();
    },
  },
  plugins: [new ParseJSONResultsPlugin()],
});

import { debugLog, errorLog, warningLog } from '@/system/devLogger';
import { mkdir } from '@tauri-apps/plugin-fs';
import Database from '@tauri-apps/plugin-sql';
import { getDbDir, getDbFullPath, selectFirstFromDB } from './db.service';
import { kyselyDB } from './kysely';

// Every file in src/db/migrations; the leading number is its version (0002_add_x.sql → 2).
const migrations = Object.entries(
  import.meta.glob<string>('../migrations/*.sql', { query: '?raw', import: 'default', eager: true }),
)
  .map(([path, sql]) => ({ version: parseInt(path.split('/').pop()!), sql }))
  .sort((a, b) => a.version - b.version);

class DatabaseSingleton {
  private static instance: Database | undefined;
  private static initializing = false;
  private static wiping = false;

  private constructor() {}

  public static suspend(): void {
    this.wiping = true;
  }

  public static resume(): void {
    this.wiping = false;
  }

  public static async getInstance(): Promise<Database> {
    if (this.wiping) {
      // While a data wipe is in progress the database file is being deleted, so
      // refuse to (re)open a connection that would re-lock the file.
      throw new Error('The database is currently being reset.');
    }

    if (!this.instance && !this.initializing) {
      this.initializing = true;

      try {
        // The SQL plugin only creates its default (roaming) folder, so ours must exist first.
        await mkdir(await getDbDir(), { recursive: true });
        this.instance = await Database.load(`sqlite:${await getDbFullPath()}`);

        await _applyPragmas(this.instance);

        debugLog('db', 'connected', { path: this.instance.path });

        await _migrate(this.instance);
      } catch (error) {
        // Closing also rolls back a migration that failed halfway, and lets the
        // next call retry instead of using a database without schema.
        await this.instance?.close();
        this.instance = undefined;
        throw error;
      } finally {
        this.initializing = false;
      }
    } else if (this.initializing) {
      while (this.initializing) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!this.instance) throw new Error('The database could not be opened.');
    }

    return this.instance!;
  }

  public static async close(): Promise<void> {
    if (this.instance) {
      await this.instance.close();
      this.instance = undefined;
    }
  }
}

export async function getAppDB() {
  return await DatabaseSingleton.getInstance();
}

/** Close the active database connection and reset the singleton so it can be reopened. */
export async function closeAppDB() {
  await DatabaseSingleton.close();
}

/**
 * Block any new database connection from being opened. Used while wiping the
 * database file so live queries cannot re-lock it. Pair with {@link resumeAppDB}.
 */
export function suspendAppDB() {
  DatabaseSingleton.suspend();
}

/** Allow database connections to be opened again after a {@link suspendAppDB}. */
export function resumeAppDB() {
  DatabaseSingleton.resume();
}

/**
 * WAL keeps the gallery's reads from blocking on the import's writes. `synchronous`
 * only applies to this connection, not to the rest of the plugin's pool.
 */
async function _applyPragmas(db: Database) {
  try {
    await db.execute('PRAGMA journal_mode=WAL');
    await db.execute('PRAGMA synchronous=NORMAL');
  } catch (error) {
    warningLog('db', 'pragmas-failed', { detail: String(error) });
  }
}

async function _migrate(db: Database) {
  const currentVersion = await _readDbVersion(db);

  for (const { version, sql } of migrations) {
    if (version <= currentVersion) continue;

    try {
      // One `execute` so the whole transaction runs on the same pooled connection.
      await db.execute(`
        BEGIN;
        ${sql}
        INSERT OR REPLACE INTO appData (id, value) VALUES ('dbVersion', '${version}');
        COMMIT;
      `);
      debugLog('db', 'migrated', { version });
    } catch (error) {
      errorLog('db', 'migration-failed', error);
      throw new Error(`Could not update the database to version ${version}: ${String(error)}`);
    }
  }
}

async function _readDbVersion(db: Database): Promise<number> {
  try {
    const row = await selectFirstFromDB(
      kyselyDB.selectFrom('appData').where('id', '=', 'dbVersion').select('value'),
      db,
    );
    return Number(row?.value ?? 0);
  } catch {
    // No `appData` table yet: this is a fresh (or wiped) database file.
    return 0;
  }
}

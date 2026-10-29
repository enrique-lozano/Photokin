import { executeInDB, selectFirstFromDB } from '@/db/connection/db.service';
import { kyselyDB } from '@/db/connection/kysely';

/**
 * Known keys of the key/value `appData` table. Reads and writes go exclusively
 * through {@link AppDataService}, so this enum is the single source of truth for
 * what may live in that table.
 */
export enum AppDataKey {
  /** Number of the last file in `src/db/migrations/` applied to this database. */
  DbVersion = 'dbVersion',
  /** Whether the user has gone through (or skipped) the intro screen. */
  OnboardingCompleted = 'onboardingCompleted',
  /**
   * Epoch millis of the last disk scan that covered the *whole* library: a full
   * sync, a complete startup folder check, or an import of every root there is.
   * Partial scans (one album, one added folder) must leave this untouched.
   */
  LastSyncedAt = 'lastSyncedAt',
  /** JSON list of exact face-group memberships the user chose to break up. */
  DismissedFaceClusters = 'dismissedFaceClusters',
  /** CLIP model id the rows in `smartSearch` were indexed with. */
  SmartSearchModel = 'smartSearchModel',
}

/**
 * Thin, key-safe accessor over the key/value `appData` table. Values live inside
 * the SQLite database, so they are wiped (and re-created empty) together with it
 * — unlike browser-local stores, which survive a database reset. Use this for
 * state that describes *this* library rather than global user preferences.
 */
export const AppDataService = {
  /** Read a value from `appData`, or `null` when the key is absent. */
  async get(key: AppDataKey): Promise<string | null> {
    const row = await selectFirstFromDB(kyselyDB.selectFrom('appData').where('id', '=', key).select('value'));
    return row?.value ?? null;
  },

  /** Upsert a value into `appData`. */
  async set(key: AppDataKey, value: string): Promise<void> {
    await executeInDB(
      kyselyDB
        .insertInto('appData')
        .values({ id: key, value })
        .onConflict((oc) => oc.column('id').doUpdateSet({ value })),
      'appData',
    );
  },

  /** Record that a scan just brought the whole library in step with disk. */
  async markLastSynced(): Promise<void> {
    await this.set(AppDataKey.LastSyncedAt, String(Date.now()));
  },
};

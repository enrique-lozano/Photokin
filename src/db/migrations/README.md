# Database migrations

Every `.sql` file in this folder changes the database schema. When the app
opens the database, it runs the files it hasn't run yet, in order.

## Adding a migration

1. Create a file starting with the next number:

   ```
   0001_initial.sql
   0002_add_album_cover.sql   <- new
   ```

   The leading number is the version. The rest of the name is just for humans.

2. Write plain SQL. No `BEGIN`/`COMMIT` needed: each file runs in its own
   transaction, so if any statement fails, the whole file is rolled back and
   the app shows the error on startup.

   ```sql
   ALTER TABLE albums ADD COLUMN coverAssetId TEXT;
   ```

3. Update the matching types in `src/db/models/`.

That's it. Run the app and the migration is applied.

## Rules

- **Never edit a migration that has shipped.** Users who already ran it won't
  run it again. Fix mistakes with a new migration instead.
- Before the first release it is fine to edit `0001_initial.sql` directly.
  Existing libraries need a new migration or an explicit, backed-up local
  schema update to receive those changes; never delete a library that needs
  to be preserved.
- Use `TEXT` for strings: SQLite ignores the length in `VARCHAR(n)`.
- Only constrain fields with a known closed set of values. Changing a stored
  enum's values requires a new migration and matching TypeScript enum changes.

## How it works

The initial schema uses `TEXT` and enforces the existing `PersonSex`,
`AssetOrientation`, `AssetMeteringMode`, `MetadataStage`, `LocationSource`, and `FaceStatus`
enums. Nullable fields still accept `NULL`; free-form metadata has no length
or value limits. These enum values are covered by the schema tests.

`src/db/connection/dbInstance.ts` loads every file here and runs the ones with
a number above the `dbVersion` stored in the `appData` table, then updates
`dbVersion`.

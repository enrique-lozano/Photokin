import { Subject } from 'rxjs';
import { SqliteDbStructure } from '../models/SqliteDbStructure.ts';

type TableUpdateSubjects = Partial<Record<keyof SqliteDbStructure, Subject<void>>>;

const tableUpdateSubjects: TableUpdateSubjects = {};

/** Every emission re-runs each subscribed live query, so a burst of writes emits once. */
const NOTIFY_WINDOW_MS = 250;

const pendingTables = new Set<keyof SqliteDbStructure>();
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

function _subjectFor(tableName: keyof SqliteDbStructure): Subject<void> {
  const existing = tableUpdateSubjects[tableName];
  if (existing) return existing;

  const created = new Subject<void>();
  tableUpdateSubjects[tableName] = created;
  return created;
}

export function getTableObservable(tableName: keyof SqliteDbStructure) {
  return _subjectFor(tableName).asObservable();
}

export function notifyTableUpdate(tableName: keyof SqliteDbStructure) {
  _subjectFor(tableName);
  pendingTables.add(tableName);
  flushTimeout ??= setTimeout(_flushTableUpdates, NOTIFY_WINDOW_MS);
}

/** Emits every table written to during the window, once. */
function _flushTableUpdates() {
  flushTimeout = null;

  const tables = [...pendingTables];
  pendingTables.clear();

  for (const tableName of tables) {
    tableUpdateSubjects[tableName]?.next();
  }
}

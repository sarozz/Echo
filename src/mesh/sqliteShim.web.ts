// Web stub — persistence.ts never reaches into this because it gates on
// Platform.OS === 'web'. We export the same shape with a null default so
// TypeScript stays happy and the SQLite types still resolve via the
// native sibling file.
import type * as SQLite from 'expo-sqlite';

export default null as unknown as typeof SQLite;
export type SQLiteModule = typeof SQLite;
export type SQLiteDatabase = ReturnType<SQLiteModule['openDatabaseSync']>;

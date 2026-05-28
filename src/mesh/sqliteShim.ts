// Native sqlite shim. Metro picks this on iOS / Android. The matching
// `.web.ts` exports null so the web bundle never tries to include
// expo-sqlite's wasm worker (which Metro can't transform).
import * as SQLite from 'expo-sqlite';

export default SQLite;
export type SQLiteModule = typeof SQLite;
export type SQLiteDatabase = ReturnType<typeof SQLite.openDatabaseSync>;

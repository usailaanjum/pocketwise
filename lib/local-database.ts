const DATABASE_NAME = "pocketwise";
const DATABASE_VERSION = 1;
const WORKSPACE_STORE = "workspace";
const STATEMENTS_STORE = "statements";
const STATEMENT_FILES_STORE = "statementFiles";

export type SavedStatement = {
  id: string;
  name: string;
  type: string;
  size: number;
  importedAt: string;
  transactionCount: number;
};

let databasePromise: Promise<IDBDatabase> | undefined;
let pendingWrite: Promise<unknown> = Promise.resolve();

// Open IndexedDB once and create separate stores for app data and original files.
function openDatabase(): Promise<IDBDatabase> {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(WORKSPACE_STORE)) database.createObjectStore(WORKSPACE_STORE);
        if (!database.objectStoreNames.contains(STATEMENTS_STORE)) database.createObjectStore(STATEMENTS_STORE, { keyPath: "id" });
        if (!database.objectStoreNames.contains(STATEMENT_FILES_STORE)) database.createObjectStore(STATEMENT_FILES_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
      request.onblocked = () => reject(new Error("Browser storage is blocked by another open tab. Close other Pocketwise tabs and reload."));
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise!;
}

// Wait for an IndexedDB transaction to commit or report its failure.
function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage could not save this change."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Browser storage could not save this change."));
  });
}

// Convert an IndexedDB request callback into a promise.
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read browser storage."));
  });
}

// Serialize writes so an older snapshot cannot finish after a newer one.
function queueWrite<T>(write: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(write, write);
  pendingWrite = result.catch(() => undefined);
  return result;
}

// Read the current app snapshot after pending writes finish.
export async function loadWorkspace<T>(): Promise<T | undefined> {
  await pendingWrite;
  const database = await openDatabase();
  return requestResult<T | undefined>(database.transaction(WORKSPACE_STORE, "readonly").objectStore(WORKSPACE_STORE).get("current"));
}

// Persist the editable app snapshot in its own store.
export function saveWorkspace<T>(workspace: T): Promise<void> {
  return queueWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(WORKSPACE_STORE).put(workspace, "current");
    await complete;
  });
}

// Read statement metadata, sorted from newest import to oldest.
export async function listStatements(): Promise<SavedStatement[]> {
  await pendingWrite;
  const database = await openDatabase();
  const statements = await requestResult<SavedStatement[]>(database.transaction(STATEMENTS_STORE, "readonly").objectStore(STATEMENTS_STORE).getAll());
  return statements.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

// Retrieve an untouched original statement file by its ID.
export async function getStatementFile(id: string): Promise<Blob | undefined> {
  const database = await openDatabase();
  return requestResult<Blob | undefined>(database.transaction(STATEMENT_FILES_STORE, "readonly").objectStore(STATEMENT_FILES_STORE).get(id));
}

// Atomically save an original file, its metadata, and its imported transactions.
export function saveImportedStatement<T>(file: File, statement: SavedStatement, workspace: T): Promise<void> {
  return queueWrite(async () => {
    const database = await openDatabase();
    const transaction = database.transaction([WORKSPACE_STORE, STATEMENTS_STORE, STATEMENT_FILES_STORE], "readwrite");
    const complete = transactionComplete(transaction);
    transaction.objectStore(WORKSPACE_STORE).put(workspace, "current");
    transaction.objectStore(STATEMENTS_STORE).put(statement);
    transaction.objectStore(STATEMENT_FILES_STORE).put(file, statement.id);
    await complete;
  });
}

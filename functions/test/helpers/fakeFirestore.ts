/**
 * A tiny in-memory stand-in for the Admin Firestore SDK.
 *
 * The Cloud Functions tests exercise real handler code (guards, validation,
 * create/update writes) without an emulator or credentials, so the helpers here
 * swap the module-level getFirestore()/FieldValue for this fake. It implements
 * only the surface the functions actually use:
 *   collection().doc().{get,set,update}, where/orderBy/limit queries,
 *   runTransaction() and FieldValue.increment().
 *
 * install() patches the already-required "firebase-admin/firestore" module
 * object. src/index.ts calls `(0, firestore_1.getFirestore)()` at handler time
 * (property lookup, not a captured binding), so the patch takes effect.
 */
import { createRequire } from "node:module";

const nodeRequire = createRequire(__filename);

type DocData = Record<string, unknown>;

/** Sentinel produced by the patched FieldValue.increment(). */
interface IncrementOp {
  __increment: number;
}

function isIncrement(value: unknown): value is IncrementOp {
  return (
    typeof value === "object" &&
    value !== null &&
    "__increment" in (value as Record<string, unknown>)
  );
}

/** Applies a write payload to existing data, resolving increment sentinels. */
function applyWrite(existing: DocData | undefined, payload: DocData): DocData {
  const next: DocData = {...(existing ?? {})};
  for (const [key, value] of Object.entries(payload)) {
    if (isIncrement(value)) {
      const current = next[key];
      next[key] = (typeof current === "number" ? current : 0) + value.__increment;
    } else {
      next[key] = value;
    }
  }
  return next;
}

export interface FakeDocSnapshot {
  id: string;
  exists: boolean;
  data: () => DocData | undefined;
}

export interface FakeQuerySnapshot {
  docs: FakeDocSnapshot[];
  empty: boolean;
  size: number;
}

type WhereOp = "==" | ">=" | "<=" | ">" | "<";

interface Filter {
  field: string;
  op: WhereOp;
  value: unknown;
}

interface Order {
  field: string;
  dir: "asc" | "desc";
}

function comparable(value: unknown): number | string {
  return value instanceof Date ? value.getTime() : (value as number | string);
}

function matches(data: DocData, filter: Filter): boolean {
  const left = comparable(data[filter.field]);
  const right = comparable(filter.value);
  switch (filter.op) {
  case "==":
    return left === right;
  case ">=":
    return left >= right;
  case "<=":
    return left <= right;
  case ">":
    return left > right;
  case "<":
    return left < right;
  }
}

function compareRows(
  a: DocData,
  b: DocData,
  order: Order,
): number {
  const av = comparable(a[order.field]);
  const bv = comparable(b[order.field]);
  let result: number;
  if (typeof av === "number" && typeof bv === "number") {
    result = av - bv;
  } else {
    result = String(av).localeCompare(String(bv));
  }
  return order.dir === "desc" ? -result : result;
}

export class FakeDocRef {
  constructor(
    private readonly db: FakeFirestore,
    readonly collectionName: string,
    readonly id: string,
  ) {}

  async get(): Promise<FakeDocSnapshot> {
    const data = this.db.read(this.collectionName, this.id);
    return {id: this.id, exists: data !== undefined, data: () => data};
  }

  async set(payload: DocData): Promise<void> {
    this.db.write(
      this.collectionName,
      this.id,
      applyWrite(this.db.read(this.collectionName, this.id), payload),
    );
  }

  async update(payload: DocData): Promise<void> {
    await this.set(payload);
  }
}

export class FakeTransaction {
  constructor(private readonly db: FakeFirestore) {}

  async get(ref: FakeDocRef): Promise<FakeDocSnapshot> {
    return ref.get();
  }

  set(ref: FakeDocRef, payload: DocData): void {
    this.db.write(
      ref.collectionName,
      ref.id,
      applyWrite(this.db.read(ref.collectionName, ref.id), payload),
    );
  }

  update(ref: FakeDocRef, payload: DocData): void {
    this.set(ref, payload);
  }
}

export class FakeCollection {
  constructor(
    private readonly db: FakeFirestore,
    private readonly name: string,
    private readonly filters: Filter[] = [],
    private readonly orders: Order[] = [],
    private readonly max?: number,
  ) {}

  doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.db, this.name, id ?? this.db.nextId());
  }

  where(field: string, op: WhereOp, value: unknown): FakeCollection {
    return new FakeCollection(
      this.db, this.name, [...this.filters, {field, op, value}], this.orders,
      this.max,
    );
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc"): FakeCollection {
    return new FakeCollection(
      this.db, this.name, this.filters, [...this.orders, {field, dir}], this.max,
    );
  }

  limit(max: number): FakeCollection {
    return new FakeCollection(
      this.db, this.name, this.filters, this.orders, max,
    );
  }

  async get(): Promise<FakeQuerySnapshot> {
    let rows = this.db.rows(this.name);
    for (const filter of this.filters) {
      rows = rows.filter((row) => matches(row[1], filter));
    }
    for (const order of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => compareRows(a[1], b[1], order));
    }
    if (this.max !== undefined) rows = rows.slice(0, this.max);
    const docs = rows.map(([id, data]) => ({
      id,
      exists: true,
      data: () => data,
    }));
    return {docs, empty: docs.length === 0, size: docs.length};
  }
}

export class FakeFirestore {
  private readonly collections = new Map<string, Map<string, DocData>>();
  private counter = 0;

  collection(name: string): FakeCollection {
    this.col(name);
    return new FakeCollection(this, name);
  }

  async runTransaction<T>(
    fn: (tx: FakeTransaction) => Promise<T>,
  ): Promise<T> {
    return fn(new FakeTransaction(this));
  }

  nextId(): string {
    this.counter += 1;
    return `auto-${this.counter}`;
  }

  /** Test helper: seed a document without going through a handler. */
  seed(collection: string, id: string, data: DocData): void {
    this.write(collection, id, data);
  }

  /** Test helper: read a document directly. */
  peek(collection: string, id: string): DocData | undefined {
    return this.read(collection, id);
  }

  read(collection: string, id: string): DocData | undefined {
    return this.col(collection).get(id);
  }

  write(collection: string, id: string, data: DocData): void {
    this.col(collection).set(id, data);
  }

  rows(collection: string): Array<[string, DocData]> {
    return [...this.col(collection).entries()];
  }

  private col(name: string): Map<string, DocData> {
    let existing = this.collections.get(name);
    if (!existing) {
      existing = new Map<string, DocData>();
      this.collections.set(name, existing);
    }
    return existing;
  }
}

/**
 * Installs a fresh FakeFirestore for the Admin SDK and returns it, so each test
 * can seed/inspect documents. getFirestore() is patched on the module object
 * every call reads at handler time; FieldValue.increment() is replaced with a
 * sentinel the fake resolves, because the real one carries no public marker.
 */
export function installFakeFirestore(): FakeFirestore {
  const db = new FakeFirestore();
  const firestore = nodeRequire("firebase-admin/firestore");
  firestore.getFirestore = () => db;
  Object.defineProperty(firestore, "FieldValue", {
    configurable: true,
    writable: true,
    value: {
      increment: (by: number): IncrementOp => ({__increment: by}),
    },
  });
  return db;
}

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA } from "./schema.js";

type Row = Record<string, unknown>;

/** Thin typed wrapper over node:sqlite with JSON column helpers. */
export class Db {
  readonly raw: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec(SCHEMA);
  }

  all<T = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.raw.prepare(sql).all(...params) as T[];
  }

  get<T = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.raw.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SQLInputValue[]) {
    return this.raw.prepare(sql).run(...params);
  }

  insert(table: string, values: Record<string, unknown>) {
    const keys = Object.keys(values);
    const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
    return this.run(sql, ...keys.map((k) => toSql(values[k])));
  }

  update(table: string, id: string, values: Record<string, unknown>, idColumn = "id") {
    const keys = Object.keys(values);
    if (keys.length === 0) return;
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE ${idColumn} = ?`;
    return this.run(sql, ...keys.map((k) => toSql(values[k])), id);
  }

  tx<T>(fn: () => T): T {
    this.raw.exec("BEGIN");
    try {
      const out = fn();
      this.raw.exec("COMMIT");
      return out;
    } catch (err) {
      this.raw.exec("ROLLBACK");
      throw err;
    }
  }

  close() {
    this.raw.close();
  }
}

function toSql(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value === "") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

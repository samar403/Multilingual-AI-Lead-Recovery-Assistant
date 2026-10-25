import { EventEmitter } from "node:events";
import { Db } from "../db/index.js";
import type { AiEngine } from "../ai/types.js";
import { createEngine } from "../ai/engine.js";
import { ChannelRegistry } from "../channels/registry.js";
import type { FetchLike } from "../channels/types.js";

export interface LiveEvent {
  type: string;
  data: unknown;
}

/** Per-tenant pub/sub that feeds the dashboard's Server-Sent Events stream. */
export class Bus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(tenantId: string, type: string, data: unknown) {
    this.emitter.emit(tenantId, { type, data } satisfies LiveEvent);
  }

  subscribe(tenantId: string, fn: (e: LiveEvent) => void): () => void {
    this.emitter.on(tenantId, fn);
    return () => this.emitter.off(tenantId, fn);
  }
}

export interface Ctx {
  db: Db;
  bus: Bus;
  engine: AiEngine;
  channels: ChannelRegistry;
  clock: () => Date;
}

export interface CtxOptions {
  databasePath: string;
  engine?: AiEngine;
  clock?: () => Date;
  http?: FetchLike;
}

export function createCtx(opts: CtxOptions): Ctx {
  const db = new Db(opts.databasePath);
  return {
    db,
    bus: new Bus(),
    engine: opts.engine ?? createEngine(),
    channels: new ChannelRegistry(db, opts.http),
    clock: opts.clock ?? (() => new Date()),
  };
}

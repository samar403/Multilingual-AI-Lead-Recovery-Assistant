import type { AiEngine } from "./types.js";
import { ClaudeEngine } from "./claude-engine.js";
import { RulesEngine } from "./rules-engine.js";
import { config } from "../config.js";

/** Claude when an API key is configured, otherwise the offline rules engine. */
export function createEngine(): AiEngine {
  return config.ai.apiKey ? new ClaudeEngine(config.ai) : new RulesEngine();
}

export type { AiEngine } from "./types.js";

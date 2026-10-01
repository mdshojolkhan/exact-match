/**
 * Provider service: resolves credentials server-side, exposes safe public
 * views, tests connections and builds ModelEngines for the existing
 * model-engine boundary.
 */
import type { ModelEngine } from "../model-engine/engine";
import { createOpenAiCompatibleEngine } from "../model-engine/openai-compatible.server";
import {
  PROVIDERS,
  getProviderDefinition,
  type ProviderDefinition,
  type ProviderId,
  type PublicProvider,
} from "./registry";
import { providerStore, type ProviderConfig } from "./store.server";

function defaultConfig(id: ProviderId): ProviderConfig {
  return {
    id,
    apiKey: null,
    model: null,
    enabled: false,
    status: "untested",
    statusMessage: null,
    testedAt: null,
  };
}

function configFor(id: ProviderId): ProviderConfig {
  return providerStore.get(id) ?? defaultConfig(id);
}

function resolveKey(def: ProviderDefinition): {
  key: string | null;
  source: PublicProvider["keySource"];
} {
  const stored = providerStore.get(def.id)?.apiKey;
  if (stored) return { key: stored, source: "settings" };
  const env = process.env[def.keyEnv];
  if (env) return { key: env, source: "secret" };
  return { key: null, source: null };
}

export function toPublicProvider(def: ProviderDefinition): PublicProvider {
  const config = configFor(def.id);
  const { key, source } = resolveKey(def);
  return {
    id: def.id,
    displayName: def.displayName,
    description: def.description,
    keyUrl: def.keyUrl,
    models: def.models,
    model: config.model ?? def.defaultModel,
    enabled: config.enabled,
    active: providerStore.getActive() === def.id,
    configured: Boolean(key),
    keySource: source,
    keyHint: key ? key.slice(-4) : null,
    status: config.status,
    statusMessage: config.statusMessage,
    testedAt: config.testedAt,
  };
}

export function listProviders(): PublicProvider[] {
  return PROVIDERS.map(toPublicProvider);
}

export type ProviderUpdate = {
  apiKey?: string | undefined;
  model?: string | undefined;
  enabled?: boolean | undefined;
  active?: boolean | undefined;
};

export function updateProvider(id: ProviderId, update: ProviderUpdate) {
  const current = configFor(id);
  const next: ProviderConfig = { ...current };
  if (update.apiKey !== undefined) {
    next.apiKey = update.apiKey.trim() || null;
    next.status = "untested";
    next.statusMessage = null;
    next.testedAt = null;
  }
  if (update.model !== undefined) next.model = update.model.trim() || null;
  if (update.enabled !== undefined) next.enabled = update.enabled;
  providerStore.set(next);
  if (update.active === true) providerStore.setActive(id);
  if (update.active === false && providerStore.getActive() === id)
    providerStore.setActive(null);
  if (!next.enabled && providerStore.getActive() === id)
    providerStore.setActive(null);
}

export function removeProvider(id: ProviderId) {
  providerStore.remove(id);
}

export async function testProvider(id: ProviderId): Promise<PublicProvider> {
  const def = getProviderDefinition(id)!;
  const { key } = resolveKey(def);
  const config = configFor(id);
  let status: ProviderConfig["status"] = "failed";
  let message: string;
  if (!key) {
    message = "No API key configured.";
  } else {
    try {
      const res = await fetch(def.modelsUrl, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        status = "connected";
        message = "Connection OK.";
      } else if (res.status === 401 || res.status === 403) {
        message = "The API key was rejected.";
      } else if (res.status === 429) {
        message = "Rate limited — the key works but try again later.";
      } else {
        message = `Provider responded with status ${res.status}.`;
      }
    } catch {
      message = "Could not reach the provider.";
    }
  }
  providerStore.set({
    ...config,
    status,
    statusMessage: message,
    testedAt: new Date().toISOString(),
  });
  return toPublicProvider(def);
}

/** Engine for the active provider, or null when none is usable. */
export function getActiveProviderEngine(): ModelEngine | null {
  const id = providerStore.getActive();
  if (!id) return null;
  return createProviderEngine(id);
}

export function createProviderEngine(id: ProviderId): ModelEngine | null {
  const def = getProviderDefinition(id);
  if (!def) return null;
  const config = configFor(id);
  if (!config.enabled) return null;
  const engine = createOpenAiCompatibleEngine({
    provider: def.displayName,
    model: config.model ?? def.defaultModel,
    url: def.chatUrl,
    apiKeyEnv: def.keyEnv,
    getApiKey: () => resolveKey(def).key ?? undefined,
  });
  return engine.isConfigured() ? engine : null;
}

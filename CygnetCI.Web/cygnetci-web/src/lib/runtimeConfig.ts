// src/lib/runtimeConfig.ts
// Runtime configuration loader - loads config from public/system.config.js

interface RuntimeConfig {
  api: {
    baseUrl: string;
  };
  app: {
    name: string;
    version: string;
    pollingInterval: number;
  };
}

// Default configuration (fallback if system.config.js fails to load)
const DEFAULT_CONFIG: RuntimeConfig = {
  api: {
    baseUrl: 'http://127.0.0.1:8000',
  },
  app: {
    name: 'CygnetCI',
    version: '1.0.0',
    pollingInterval: 30000
  }
};

// Cache for the loaded configuration
let cachedConfig: RuntimeConfig | null = null;

/**
 * Gets the runtime configuration
 * On client-side: reads from window.CYGNETCI_CONFIG (loaded by system.config.js)
 * On server-side: returns default configuration
 */
export function getRuntimeConfig(): RuntimeConfig {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  // Server-side rendering - use defaults
  if (typeof window === 'undefined') {
    return DEFAULT_CONFIG;
  }

  // Client-side - try to get config from window object
  const windowConfig = (window as any).CYGNETCI_CONFIG;

  if (windowConfig) {
    cachedConfig = {
      api: {
        baseUrl: windowConfig.api?.baseUrl || DEFAULT_CONFIG.api.baseUrl,
      },
      app: {
        name: windowConfig.app?.name || DEFAULT_CONFIG.app.name,
        version: windowConfig.app?.version || DEFAULT_CONFIG.app.version,
        pollingInterval: windowConfig.app?.pollingInterval || DEFAULT_CONFIG.app.pollingInterval,
      }
    };
  } else {
    cachedConfig = DEFAULT_CONFIG;
  }

  return cachedConfig;
}

/**
 * Gets the API base URL
 */
export function getApiBaseUrl(): string {
  return getRuntimeConfig().api.baseUrl;
}

/**
 * Gets the polling interval
 */
export function getPollingInterval(): number {
  return getRuntimeConfig().app.pollingInterval;
}

/**
 * Clears the cached configuration (useful for testing or hot-reload scenarios)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

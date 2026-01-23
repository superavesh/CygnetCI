// src/lib/config.ts

import { getApiBaseUrl, getPollingInterval, getRuntimeConfig } from './runtimeConfig';

// Dynamic CONFIG that reads from runtime configuration
// The API URL can be changed in public/system.config.js after build
export const CONFIG = {
  // API Configuration
  api: {
    get baseUrl() {
      return getApiBaseUrl();
    },

    // Endpoints - these are relative paths
    endpoints: {
      allData: '/data',
    },

    // Request headers
    headers: {
      'Content-Type': 'application/json',
    } as Record<string, string>
  },

  // App settings
  app: {
    get name() {
      return getRuntimeConfig().app.name;
    },
    get version() {
      return getRuntimeConfig().app.version;
    },
    get pollingInterval() {
      return getPollingInterval();
    }
  }
};
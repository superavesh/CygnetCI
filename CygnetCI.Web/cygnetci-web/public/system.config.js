// CygnetCI Runtime Configuration
// This file can be modified after build to change API settings without rebuilding
// Changes take effect on page refresh

window.CYGNETCI_CONFIG = {
  // API Configuration
  api: {
    baseUrl: 'http://127.0.0.1:8000',  // Change this to your API server URL
  },

  // App settings
  app: {
    name: 'CygnetCI',
    version: '1.0.0',
    pollingInterval: 30000  // 30 seconds - how often to refresh data
  }
};

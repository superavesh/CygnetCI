// src/lib/config.ts

export const CONFIG = {
  // API Configuration - Change these for your API
  api: {
    baseUrl: 'http://127.0.0.1:8000', // Your API server URL

    // Endpoints - modify these to match your API
    endpoints: {
      // For single endpoint that returns all data:
      allData: '/data',
      
      // Or for separate endpoints:
      // agents: '/agents',
      // pipelines: '/pipelines',
      // tasks: '/tasks',
      // stats: '/stats',
      // services: '/services'
    },

    // Request headers - add your auth tokens here
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': 'Bearer YOUR_TOKEN_HERE',
      // 'X-API-Key': 'your-api-key'
    }
  },

  // App settings
  app: {
    name: 'CygnetCI',
    version: '1.0.0',
    pollingInterval: 30000, // 30 seconds
    useRealAPI: false // Set to true when your API is ready
  }
};
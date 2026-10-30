import { createMockApi } from './mockApi.js';

// Dans l'app Mac : pont Electron. Dans un navigateur (aperçu / captures) : simulation.
export const api = typeof window !== 'undefined' && window.api ? window.api : createMockApi();

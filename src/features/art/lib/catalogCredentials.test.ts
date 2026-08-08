// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCatalogueCredentials, saveCatalogueCredentials, testIgdbConnection } from './catalogCredentials';

describe('catalogue credentials', () => {
  beforeEach(() => localStorage.clear());

  it('stores IGDB credentials only in the existing local configuration', () => {
    saveCatalogueCredentials({ igdbClientId: ' client-id ', igdbClientSecret: ' client-secret ' });
    expect(loadCatalogueCredentials()).toEqual({
      tmdbReadToken: undefined,
      rawgApiKey: undefined,
      igdbClientId: 'client-id',
      igdbClientSecret: 'client-secret'
    });
  });

  it('surfaces rejected IGDB credentials without exposing the IPC wrapper message', async () => {
    (window as any).electronAPI = { catalogue: { testIgdb: vi.fn().mockRejectedValue(new Error("Error invoking remote method: IGDB rejected the configured credentials.")) } };
    await expect(testIgdbConnection('id', 'secret')).rejects.toThrow('IGDB rejected the Client ID or Client Secret');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => fetchMock(...args),
}));

import { elevationRequestUrl, lookupElevations } from './elevation';

describe('elevation lookup', () => {
  beforeEach(() => fetchMock.mockReset());

  it('builds an Open-Meteo request with coordinate pairs in matching order', () => {
    const url = new URL(
      elevationRequestUrl([
        { latitude: 40.03, longitude: -3.59 },
        { latitude: 41.4, longitude: 2.17 },
      ]),
    );
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/elevation');
    expect(url.searchParams.get('latitude')).toBe('40.03,41.4');
    expect(url.searchParams.get('longitude')).toBe('-3.59,2.17');
  });

  it('rounds elevations and splits requests at the service limit', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ elevation: Array.from({ length: 100 }, (_, index) => index + 10.4) }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ elevation: [10.4] }),
      });

    const points = Array.from({ length: 101 }, (_, index) => ({
      latitude: index % 80,
      longitude: -(index % 170),
    }));
    const elevations = await lookupElevations(points);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(elevations).toHaveLength(101);
    expect(elevations[0]).toBe(10);
    expect(elevations[99]).toBe(109);
    expect(elevations[100]).toBe(10);
  });

  it('rejects service errors and malformed responses', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: true, reason: 'Invalid coordinates' }),
    });
    await expect(lookupElevations([{ latitude: 91, longitude: 0 }])).rejects.toThrow('Invalid coordinates');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ elevation: [] }),
    });
    await expect(lookupElevations([{ latitude: 40, longitude: -3 }])).rejects.toThrow('unexpected response');
  });
});

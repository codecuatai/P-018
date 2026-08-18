import { haversineKm, rankByDistance } from '../src/modules/services/location-ranking';

describe('location-aware catalog ranking', () => {
  it('ranks validated coordinates and leaves missing coordinates last', () => {
    const ranked = rankByDistance([
      { id: 'far', name: 'Far', latitude: 21.1, longitude: 105.9 },
      { id: 'missing', name: 'Missing' },
      { id: 'near', name: 'Near', latitude: 21.03, longitude: 105.81 },
    ], { latitude: 21.0285, longitude: 105.8048 });

    expect(ranked.map((item) => item.id)).toEqual(['near', 'far', 'missing']);
    expect(ranked[0].distance_km).toBeCloseTo(haversineKm(21.0285, 105.8048, 21.03, 105.81), 2);
  });

  it('does not rank suspicious default coordinates as real locations', () => {
    const ranked = rankByDistance([
      { id: 'default', coordinate_status: 'suspicious_default', latitude: 21.0285, longitude: 105.8048 },
      { id: 'validated', coordinate_status: 'validated', latitude: 21.05, longitude: 105.82 },
    ], { latitude: 21.0285, longitude: 105.8048 });

    expect(ranked.map((item) => item.id)).toEqual(['validated', 'default']);
    expect(ranked[1].distance_km).toBeUndefined();
  });
});

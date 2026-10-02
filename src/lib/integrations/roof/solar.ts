/**
 * Roof measurement via Google Maps Platform: Geocoding API (address -> lat/lng) and
 * Solar API buildingInsights:findClosest (roof segments with pitch and pitched area).
 *
 * Requires GOOGLE_SOLAR_API_KEY with the Geocoding API and Solar API enabled on a billed
 * Google Cloud project (first 10,000 building lookups per month are free).
 */

const SQFT_PER_M2 = 10.7639;

export interface RoofSegment {
  pitch: string; // rise over 12, e.g. "6/12"
  pitchDegrees: number;
  facing: string; // compass direction of the slope
  areaSqFt: number;
}

export interface RoofMeasurementResult {
  address: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  roofAreaSqFt: number; // sloped (true) roof area
  footprintSqFt: number; // ground area under the roof
  squares: number; // roofing squares = 100 sq ft
  squaresWithWaste: number; // +10% waste allowance
  predominantPitch: string;
  facets: number;
  segments: RoofSegment[];
  imageryQuality: string;
  imageryDate?: string;
  provider: 'Google Solar API';
}

export class RoofServiceError extends Error {
  constructor(message: string, public statusCode = 502, public code = 'ROOF_PROVIDER_ERROR') {
    super(message);
  }
}

export function isRoofServiceConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SOLAR_API_KEY);
}

export function degreesToPitch(degrees: number): string {
  const rise = Math.round(12 * Math.tan((Math.max(0, degrees) * Math.PI) / 180));
  return `${rise}/12`;
}

function compass(azimuth: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}

/** Turns a Solar API buildingInsights response into roofing numbers. Pure; unit tested. */
export function summarizeBuildingInsights(
  insights: any,
  location: { address: string; formattedAddress: string; latitude: number; longitude: number }
): RoofMeasurementResult {
  const potential = insights?.solarPotential;
  const rawSegments: any[] = potential?.roofSegmentStats || [];
  if (!potential || rawSegments.length === 0) {
    throw new RoofServiceError('No roof data is available for this address yet.', 404, 'NO_ROOF_DATA');
  }

  const segments: RoofSegment[] = rawSegments
    .map((s) => ({
      pitchDegrees: Number(s.pitchDegrees) || 0,
      pitch: degreesToPitch(Number(s.pitchDegrees) || 0),
      facing: compass(Number(s.azimuthDegrees) || 0),
      areaSqFt: Math.round((Number(s.stats?.areaMeters2) || 0) * SQFT_PER_M2),
    }))
    .filter((s) => s.areaSqFt > 0)
    .sort((a, b) => b.areaSqFt - a.areaSqFt);

  const roofAreaSqFt = Math.round(
    (Number(potential.wholeRoofStats?.areaMeters2) || segments.reduce((sum, s) => sum + s.areaSqFt / SQFT_PER_M2, 0)) *
      SQFT_PER_M2
  );
  const footprintSqFt = Math.round(
    (Number(potential.wholeRoofStats?.groundAreaMeters2) ||
      rawSegments.reduce((sum, s) => sum + (Number(s.stats?.groundAreaMeters2) || 0), 0)) *
      SQFT_PER_M2
  );
  const squares = Number((roofAreaSqFt / 100).toFixed(1));

  const imageryDate = insights.imageryDate
    ? `${insights.imageryDate.year}-${String(insights.imageryDate.month).padStart(2, '0')}-${String(insights.imageryDate.day).padStart(2, '0')}`
    : undefined;

  return {
    ...location,
    roofAreaSqFt,
    footprintSqFt,
    squares,
    squaresWithWaste: Number((squares * 1.1).toFixed(1)),
    predominantPitch: segments[0]?.pitch || '0/12',
    facets: segments.length,
    segments,
    imageryQuality: String(insights.imageryQuality || 'UNKNOWN'),
    imageryDate,
    provider: 'Google Solar API',
  };
}

export async function measureRoof(address: string): Promise<RoofMeasurementResult> {
  const key = process.env.GOOGLE_SOLAR_API_KEY;
  if (!key) throw new RoofServiceError('Roof measurement is not configured yet.', 503, 'NOT_CONFIGURED');

  const geoUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  geoUrl.searchParams.set('address', address);
  geoUrl.searchParams.set('key', key);
  const geo = await (await fetch(geoUrl)).json().catch(() => null);
  const match = geo?.results?.[0];
  if (!match) {
    throw new RoofServiceError(
      geo?.status === 'ZERO_RESULTS' ? 'We could not find that address.' : 'Address lookup failed.',
      geo?.status === 'ZERO_RESULTS' ? 404 : 502,
      'GEOCODE_FAILED'
    );
  }

  const location = {
    address,
    formattedAddress: match.formatted_address as string,
    latitude: match.geometry.location.lat as number,
    longitude: match.geometry.location.lng as number,
  };

  // Prefer high-quality imagery; fall back to medium where high is unavailable.
  for (const quality of ['HIGH', 'MEDIUM']) {
    const solarUrl = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest');
    solarUrl.searchParams.set('location.latitude', String(location.latitude));
    solarUrl.searchParams.set('location.longitude', String(location.longitude));
    solarUrl.searchParams.set('requiredQuality', quality);
    solarUrl.searchParams.set('key', key);
    const res = await fetch(solarUrl);
    if (res.ok) return summarizeBuildingInsights(await res.json(), location);
    if (res.status !== 404) {
      throw new RoofServiceError('The roof data service is unavailable right now.', 502);
    }
  }
  throw new RoofServiceError('No roof data is available for this address yet.', 404, 'NO_ROOF_DATA');
}

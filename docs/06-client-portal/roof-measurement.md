# Phase 6: Client Portal — Roof Measurement Tool

The Roof Measurement tool provides property footprint visualization, pitch adjustment, and roof surface area calculation through an extensible provider adapter architecture.

## 1. Provider-Independent Adapter Architecture

Because the upstream roof measurement data and imagery provider is unconfirmed, the tool implements an adapter interface:

```typescript
export interface RoofMeasurementProvider {
  id: string;
  name: string;
  isConfigured(): boolean;
  lookupProperty(address: string): Promise<RoofPropertyResult>;
}

export interface RoofPropertyResult {
  address: string;
  coordinates: { lat: number; lng: number };
  planarAreaSqFt?: number;
  suggestedPitch?: string;
  footprintPolygon?: Array<{ lat: number; lng: number }>;
  imageryUrl?: string;
  source: 'provider' | 'demo' | 'manual';
}
```

If no provider credentials are configured, the tool transitions gracefully to an explicit setup-required or demo state.

## 2. User Interface Workflow

1. Address Input: The client enters a property address or selects a lead from their GoHighLevel pipeline.
2. Provider Lookup: The system invokes the configured provider adapter.
   - If configured: loads property imagery and building footprint.
   - If not configured: displays "Integration setup required. Showing demo canvas mode."
3. Interactive Canvas: Displays satellite/aerial view with polygon tracing controls (add vertex, undo, clear, close polygon).
4. Pitch Selector: Dropdown allowing selection from 3/12 to 12/12 pitch ratios with mathematical slope adjustment:
   - Slope Factor = 1 / cos(arctan(Rise / 12))
   - True Surface Area = Planar Area * Slope Factor
   - Roofing Squares = Surface Area / 100
5. Results Summary: Cards displaying Total Area (Sq Ft), Squares, Walkability Rating, and Material Estimates.

## 3. UI States

- Loading State: Skeleton canvas with spinner during geocoding or footprint lookup.
- Result State: Interactive map, traced polygon, and calculated metric cards.
- Error State: Friendly banner if address cannot be located.
- Unconfigured State: Explicit badge noting "Provider integration not configured. Running in demo mode."

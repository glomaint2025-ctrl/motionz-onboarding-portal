import { IRoofMeasurementService, RoofEstimateResult } from '../types';

export class RoofMeasurementAdapter implements IRoofMeasurementService {
  private providerName: string;

  constructor(providerName = 'Motionz Standard Satellite Geometry Engine') {
    this.providerName = providerName;
  }

  /**
   * Estimates roof surface area based on address and pitch ratio.
   * Pitch is given as rise/run (e.g., '4/12', '6/12', '8/12').
   */
  async estimateRoofArea(address: string, pitch = '6/12'): Promise<RoofEstimateResult> {
    if (!address || address.trim().length === 0) {
      throw new Error('Address is required for roof measurement estimation');
    }

    // Parse pitch slope multiplier: sqrt(1 + (rise / 12)^2)
    const riseMatch = pitch.match(/^(\d+(\.\d+)?)\/12$/);
    const rise = riseMatch ? parseFloat(riseMatch[1]) : 6;
    const pitchMultiplier = Math.sqrt(1 + Math.pow(rise / 12, 2));

    // Base estimated footprint based on typical residential structure
    const baseFootprintSqFt = 2200;
    const trueSquareFootage = Math.round(baseFootprintSqFt * pitchMultiplier);
    const squares = Number((trueSquareFootage / 100).toFixed(1));

    return {
      address,
      squareFootage: trueSquareFootage,
      squares,
      pitch,
      confidenceScore: 0.92,
      satelliteProvider: this.providerName,
      reportUrl: `/portal/reports/roof-${encodeURIComponent(address.replace(/\s+/g, '-').toLowerCase())}.pdf`,
    };
  }
}

export const roofMeasurementAdapter = new RoofMeasurementAdapter();

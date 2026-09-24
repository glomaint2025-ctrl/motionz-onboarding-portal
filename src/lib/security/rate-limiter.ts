export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitRecord {
  timestamps: number[];
}

export class RateLimiter {
  private requests: Map<string, RateLimitRecord> = new Map();
  private defaultConfig: RateLimitConfig;

  constructor(defaultConfig: RateLimitConfig = { maxRequests: 60, windowMs: 60 * 1000 }) {
    this.defaultConfig = defaultConfig;
  }

  isAllowed(key: string, customConfig?: Partial<RateLimitConfig>): {
    allowed: boolean;
    remaining: number;
    resetMs: number;
  } {
    const config = { ...this.defaultConfig, ...customConfig };
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const record = this.requests.get(key) || { timestamps: [] };
    // Filter out timestamps older than the sliding window
    const activeTimestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (activeTimestamps.length >= config.maxRequests) {
      const oldestActive = activeTimestamps[0];
      const resetMs = oldestActive + config.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, resetMs),
      };
    }

    activeTimestamps.push(now);
    this.requests.set(key, { timestamps: activeTimestamps });

    return {
      allowed: true,
      remaining: config.maxRequests - activeTimestamps.length,
      resetMs: config.windowMs,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }
}

export const globalRateLimiter = new RateLimiter();

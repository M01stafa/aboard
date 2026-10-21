/**
 * Per-user concurrency and rate limiting.
 * Protects server resources from abuse and runaway compute (SEC-6, SEC-8).
 */

export interface LimitsOptions {
  maxUploadBytes: number;
  maxConcurrencyPerUser: number;
  rateLimitWindowMs: number;
  maxRequestsPerWindow: number;
}

export class UserLimitsManager {
  private activeConcurrency = new Map<string, number>();
  private requestTimestamps = new Map<string, number[]>();
  readonly options: LimitsOptions;

  constructor(options?: Partial<LimitsOptions>) {
    const maxMb = Number(process.env.MAX_UPLOAD_MB || "50");
    this.options = {
      maxUploadBytes: (options?.maxUploadBytes ?? maxMb) * 1024 * 1024,
      maxConcurrencyPerUser: options?.maxConcurrencyPerUser ?? 1,
      rateLimitWindowMs: options?.rateLimitWindowMs ?? 60_000,
      maxRequestsPerWindow: options?.maxRequestsPerWindow ?? 10,
    };
  }

  /**
   * Tries to acquire a concurrency slot for the given user.
   * Returns true if allowed, false if concurrency limit exceeded.
   */
  acquireConcurrency(userId: string): boolean {
    const current = this.activeConcurrency.get(userId) || 0;
    if (current >= this.options.maxConcurrencyPerUser) {
      return false;
    }
    this.activeConcurrency.set(userId, current + 1);
    return true;
  }

  /**
   * Releases a concurrency slot for the given user.
   */
  releaseConcurrency(userId: string): void {
    const current = this.activeConcurrency.get(userId) || 0;
    if (current <= 1) {
      this.activeConcurrency.delete(userId);
    } else {
      this.activeConcurrency.set(userId, current - 1);
    }
  }

  /**
   * Checks whether the user is within their allowed rate limit window.
   * Returns true if allowed, false if rate limit exceeded.
   */
  checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.options.rateLimitWindowMs;
    const history = this.requestTimestamps.get(userId) || [];

    // Filter out expired timestamps
    const activeHistory = history.filter((ts) => ts > windowStart);

    if (activeHistory.length >= this.options.maxRequestsPerWindow) {
      this.requestTimestamps.set(userId, activeHistory);
      return false;
    }

    activeHistory.push(now);
    this.requestTimestamps.set(userId, activeHistory);
    return true;
  }

  /**
   * Resets all internal stores (useful for test suites).
   */
  reset(): void {
    this.activeConcurrency.clear();
    this.requestTimestamps.clear();
  }
}

export const defaultLimitsManager = new UserLimitsManager();

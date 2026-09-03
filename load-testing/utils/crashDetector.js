const config = require('../config');

class CrashDetector {
  constructor() {
    this.thresholds = config.thresholds;
  }

  /**
   * Evaluates current system metrics against crash thresholds.
   * @param {Object} metrics 
   * @returns {Object} { isCrash: boolean, reason: string | null }
   */
  evaluate(metrics) {
    if (!metrics) return { isCrash: false, reason: null };

    if (metrics.cpu >= this.thresholds.cpuPercent) {
      return { isCrash: true, reason: `CPU Usage exceeded ${this.thresholds.cpuPercent}% (${metrics.cpu.toFixed(2)}%)` };
    }

    if (metrics.memory >= this.thresholds.memoryPercent) {
      return { isCrash: true, reason: `Memory Usage exceeded ${this.thresholds.memoryPercent}% (${metrics.memory.toFixed(2)}%)` };
    }

    const totalRequests = metrics.requestCount || 0;
    const failures = metrics.failureCount || 0;
    if (totalRequests > 100) {
      const errorRate = (failures / totalRequests) * 100;
      if (errorRate >= this.thresholds.errorRatePercent) {
        return { isCrash: true, reason: `Error rate exceeded ${this.thresholds.errorRatePercent}% (${errorRate.toFixed(2)}%)` };
      }
    }

    if (metrics.eventLoopDelay >= this.thresholds.eventLoopLagMs) {
      return { isCrash: true, reason: `Event Loop Lag exceeded ${this.thresholds.eventLoopLagMs}ms (${metrics.eventLoopDelay.toFixed(2)}ms)` };
    }

    if (metrics.dbLatency && metrics.dbLatency > 5000) {
      return { isCrash: true, reason: `Database latency critically high (> 5000ms)` };
    }

    return { isCrash: false, reason: null };
  }
}

module.exports = new CrashDetector();

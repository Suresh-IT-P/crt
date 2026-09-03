const si = require('systeminformation');
const { performance } = require('perf_hooks');
const EventEmitter = require('events');
const mysql = require('mysql2/promise');
const config = require('./config');

class Monitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      requestCount: 0,
      successCount: 0,
      failureCount: 0,
      responseTimes: [],
      activeRides: 0,
      onlineDrivers: 0,
      onlineCustomers: 0,
      cpu: 0,
      memory: 0,
      eventLoopDelay: 0,
      dbLatency: 0,
      socketConnected: 0,
      socketDisconnected: 0,
      socketErrors: 0,
      socketEventsPerSec: 0,
      peakCpu: 0,
      peakMemory: 0,
      peakDbConnections: 0,
      peakDbLatency: 0,
      maxConcurrentCustomers: 0,
      maxConcurrentDrivers: 0,
      maxActiveRides: 0,
      maxRequestsPerSecond: 0,
      maxSocketConnections: 0
    };
    this.intervalId = null;
    this.dbPool = mysql.createPool(config.db);
    this.lastRequestCount = 0;
  }

  start() {
    this.intervalId = setInterval(() => this.collectMetrics(), 2000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.dbPool.end();
  }

  recordRequest(durationMs, success) {
    this.metrics.requestCount++;
    if (success) {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
    }
    this.metrics.responseTimes.push(durationMs);
    // Keep only last 1000 for P95/P99 calculation to avoid memory bloat
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }
  }

  updateUsers(customers, drivers) {
    this.metrics.onlineCustomers = customers;
    this.metrics.onlineDrivers = drivers;
    if (customers > this.metrics.maxConcurrentCustomers) this.metrics.maxConcurrentCustomers = customers;
    if (drivers > this.metrics.maxConcurrentDrivers) this.metrics.maxConcurrentDrivers = drivers;
  }

  updateRides(activeRides) {
    this.metrics.activeRides = activeRides;
    if (activeRides > this.metrics.maxActiveRides) this.metrics.maxActiveRides = activeRides;
  }

  recordSocketEvent(type) {
    if (type === 'connect') {
      this.metrics.socketConnected++;
      const currentConns = this.metrics.socketConnected - this.metrics.socketDisconnected;
      if (currentConns > this.metrics.maxSocketConnections) this.metrics.maxSocketConnections = currentConns;
    }
    else if (type === 'disconnect') this.metrics.socketDisconnected++;
    else if (type === 'error') this.metrics.socketErrors++;
    else this.metrics.socketEventsPerSec++; // this will be reset every second or calculated
  }

  async collectMetrics() {
    try {
      // System info (Local)
      const load = await si.currentLoad();
      const mem = await si.mem();
      this.metrics.cpu = load.currentLoad;
      this.metrics.memory = (mem.active / mem.total) * 100;

      if (this.metrics.cpu > this.metrics.peakCpu) this.metrics.peakCpu = this.metrics.cpu;
      if (this.metrics.memory > this.metrics.peakMemory) this.metrics.peakMemory = this.metrics.memory;

      // Event loop delay
      const start = performance.now();
      await new Promise(resolve => setTimeout(resolve, 0));
      this.metrics.eventLoopDelay = performance.now() - start;

      // RPS
      const rps = (this.metrics.requestCount - this.lastRequestCount) / 2; // 2 seconds interval
      if (rps > this.metrics.maxRequestsPerSecond) this.metrics.maxRequestsPerSecond = rps;
      this.lastRequestCount = this.metrics.requestCount;

      // DB Latency Ping
      const dbStart = performance.now();
      await this.dbPool.query('SELECT 1');
      this.metrics.dbLatency = performance.now() - dbStart;
      if (this.metrics.dbLatency > this.metrics.peakDbLatency) this.metrics.peakDbLatency = this.metrics.dbLatency;

      this.emit('update', this.metrics);
    } catch (err) {
      console.error('Monitor Error:', err.message);
    }
  }

  calculatePercentile(percentile) {
    if (this.metrics.responseTimes.length === 0) return 0;
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  getFinalSnapshot() {
    return {
      ...this.metrics,
      averageResponseTime: this.metrics.responseTimes.reduce((a, b) => a + b, 0) / (this.metrics.responseTimes.length || 1),
      p95ResponseTime: this.calculatePercentile(95),
      p99ResponseTime: this.calculatePercentile(99),
    };
  }
}

module.exports = new Monitor();

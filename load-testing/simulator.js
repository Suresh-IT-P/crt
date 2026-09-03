const { Worker } = require('worker_threads');
const config = require('./config');
const monitor = require('./monitor');
const crashDetector = require('./utils/crashDetector');
const CustomerFlow = require('./customers/customerFlow');
const DriverFlow = require('./drivers/driverFlow');
const emailService = require('./emailService');
const reporter = require('./reporter');

class Simulator {
  constructor() {
    this.mode = process.env.TEST_MODE ? parseInt(process.env.TEST_MODE) : 1;
    this.customers = [];
    this.drivers = [];
    this.isRunning = false;
    this.autoScaleInterval = null;
    this.startTime = null;
    this.dashboardWorker = null;
  }

  async start() {
    console.log(`Starting CityRide Load Testing Framework - Mode ${this.mode}`);
    this.startTime = Date.now();
    this.isRunning = true;
    
    // Start Dashboard in a separate worker thread
    this.startDashboard();

    monitor.start();
    
    monitor.on('update', async (metrics) => {
      // Send metrics to dashboard worker
      if (this.dashboardWorker) {
        this.dashboardWorker.postMessage({ type: 'metrics', data: metrics });
      }

      // Check for crash
      const crashStatus = crashDetector.evaluate(metrics);
      if (crashStatus.isCrash && this.isRunning) {
        console.error(`\nCRITICAL CRASH DETECTED: ${crashStatus.reason}`);
        await this.handleCrash(crashStatus.reason, metrics);
      }
    });

    const modeConfig = config.modes[this.mode];
    if (!modeConfig) {
      console.error('Invalid mode selected');
      process.exit(1);
    }

    if (this.mode === 7) {
      this.startAutoScaling();
    } else {
      this.spawnUsers(modeConfig.customers, modeConfig.drivers);
    }
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Manual stop triggered.');
      await this.stop('Manual Stop');
    });
  }

  startDashboard() {
    this.dashboardWorker = new Worker('./dashboardWorker.js');
    this.dashboardWorker.on('error', (err) => console.error('Dashboard Error:', err));
  }

  spawnUsers(numCustomers, numDrivers) {
    console.log(`Spawning ${numCustomers} customers and ${numDrivers} drivers...`);
    
    for (let i = 0; i < numCustomers; i++) {
      const customer = new CustomerFlow(this.customers.length + 1, monitor);
      customer.runFlow();
      this.customers.push(customer);
    }

    for (let i = 0; i < numDrivers; i++) {
      const driver = new DriverFlow(this.drivers.length + 1, monitor);
      driver.runFlow();
      this.drivers.push(driver);
    }

    monitor.updateUsers(this.customers.length, this.drivers.length);
  }

  startAutoScaling() {
    const startConfig = { customers: 10, drivers: 10 };
    this.spawnUsers(startConfig.customers, startConfig.drivers);

    this.autoScaleInterval = setInterval(() => {
      if (!this.isRunning) return;
      console.log('\n--- AUTO SCALING: Increasing Load ---');
      this.spawnUsers(10, 10);
    }, config.modes[7].intervalMs);
  }

  async handleCrash(reason, metrics) {
    this.isRunning = false;
    if (this.autoScaleInterval) clearInterval(this.autoScaleInterval);
    
    this.customers.forEach(c => c.stop());
    this.drivers.forEach(d => d.stop());
    monitor.stop();

    const snapshot = monitor.getFinalSnapshot();
    snapshot.failureCause = reason;
    snapshot.testDurationSec = (Date.now() - this.startTime) / 1000;

    console.log('\nGenerating Crash Reports...');
    const reportPaths = await reporter.generateReports(snapshot, true);
    
    console.log('Sending Email Notification...');
    await emailService.sendCrashEmail(snapshot, reportPaths);

    if (this.dashboardWorker) this.dashboardWorker.terminate();
    console.log('Test Stopped Gracefully after Crash.');
    process.exit(1);
  }

  async stop(reason = 'Completed') {
    this.isRunning = false;
    if (this.autoScaleInterval) clearInterval(this.autoScaleInterval);
    
    this.customers.forEach(c => c.stop());
    this.drivers.forEach(d => d.stop());
    monitor.stop();

    const snapshot = monitor.getFinalSnapshot();
    snapshot.failureCause = reason;
    snapshot.testDurationSec = (Date.now() - this.startTime) / 1000;

    console.log('\nGenerating Reports...');
    const reportPaths = await reporter.generateReports(snapshot, false);
    
    console.log('Sending Email Notification...');
    await emailService.sendCompletionEmail(snapshot, reportPaths);

    if (this.dashboardWorker) this.dashboardWorker.terminate();
    console.log('Test Stopped.');
    process.exit(0);
  }
}

// Handle unhandled exceptions as a crash
process.on('uncaughtException', async (err) => {
  console.error('Uncaught Exception:', err);
  // Ideally trigger crash report here too
  process.exit(1);
});

if (require.main === module) {
  const sim = new Simulator();
  sim.start();
}

module.exports = Simulator;

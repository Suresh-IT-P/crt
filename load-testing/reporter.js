const fs = require('fs').promises;
const { createWriteStream } = require('fs');
const path = require('path');
const archiver = require('archiver');

class Reporter {
  constructor() {
    this.reportsDir = path.join(__dirname, 'reports');
  }

  async ensureDir() {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
    } catch (e) {}
  }

  async generateReports(snapshot, isCrash = false) {
    await this.ensureDir();
    
    const prefix = isCrash ? 'crash-' : '';
    const reportHtmlPath = path.join(this.reportsDir, `${prefix}report.html`);
    const reportJsonPath = path.join(this.reportsDir, `${prefix}report.json`);
    const metricsJsonPath = path.join(this.reportsDir, 'metrics.json');
    const logsZipPath = path.join(this.reportsDir, 'logs.zip');

    // Generate JSONs
    await fs.writeFile(reportJsonPath, JSON.stringify(snapshot, null, 2));
    await fs.writeFile(metricsJsonPath, JSON.stringify({
      timestamp: Date.now(),
      metrics: snapshot
    }, null, 2));

    // Generate HTML
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>CityRide Load Test ${isCrash ? 'Crash ' : ''}Report</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f7f6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 900px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: ${isCrash ? '#e74c3c' : '#2ecc71'}; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
        .highlight { font-weight: bold; color: #2c3e50; }
        .error { color: #e74c3c; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>CityRide Load Test ${isCrash ? 'Crash ' : ''}Report</h1>
        <p><strong>Test Duration:</strong> ${snapshot.testDurationSec} seconds</p>
        ${isCrash ? `<p class="error"><strong>Failure Cause:</strong> ${snapshot.failureCause}</p>` : ''}
        
        <h2>Capacity Summary</h2>
        <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Max Concurrent Customers</td><td class="highlight">${snapshot.maxConcurrentCustomers}</td></tr>
            <tr><td>Max Concurrent Drivers</td><td class="highlight">${snapshot.maxConcurrentDrivers}</td></tr>
            <tr><td>Max Active Rides</td><td class="highlight">${snapshot.maxActiveRides}</td></tr>
            <tr><td>Max Requests Per Second</td><td class="highlight">${snapshot.maxRequestsPerSecond.toFixed(2)}</td></tr>
            <tr><td>Max Socket Connections</td><td class="highlight">${snapshot.maxSocketConnections}</td></tr>
        </table>

        <h2>Performance Metrics</h2>
        <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Average Response Time</td><td>${snapshot.averageResponseTime.toFixed(2)} ms</td></tr>
            <tr><td>P95 Response Time</td><td>${snapshot.p95ResponseTime.toFixed(2)} ms</td></tr>
            <tr><td>P99 Response Time</td><td>${snapshot.p99ResponseTime.toFixed(2)} ms</td></tr>
            <tr><td>Peak CPU Usage</td><td>${snapshot.peakCpu.toFixed(2)}%</td></tr>
            <tr><td>Peak Memory Usage</td><td>${snapshot.peakMemory.toFixed(2)}%</td></tr>
            <tr><td>Peak DB Latency</td><td>${snapshot.peakDbLatency.toFixed(2)} ms</td></tr>
        </table>

        <h2>AWS Upgrade Recommendation</h2>
        <p>${this.generateRecommendation(snapshot)}</p>
    </div>
</body>
</html>
    `;
    await fs.writeFile(reportHtmlPath, htmlContent);

    // Zip logs (Assume there is a logs directory or mock it)
    await this.createZip(logsZipPath);

    return {
      reportHtmlPath,
      reportJsonPath,
      metricsJsonPath,
      logsZipPath
    };
  }

  generateRecommendation(snapshot) {
    if (snapshot.peakCpu > 90) return "CPU Bottleneck detected. Consider upgrading EC2 to t3.medium or compute-optimized instances (c6g.large).";
    if (snapshot.peakMemory > 90) return "Memory Exhaustion detected. Consider upgrading EC2 to r6g.large (Memory Optimized).";
    if (snapshot.peakDbLatency > 1000) return "Database Latency is high. Consider upgrading RDS to db.t4g.small or adding Read Replicas.";
    if (snapshot.maxSocketConnections > 5000) return "High socket count. Consider adding a load balancer and horizontal scaling across multiple Node.js instances.";
    return "Current infrastructure handles this load adequately. Monitor for future growth.";
  }

  createZip(zipPath) {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', resolve);
      archive.on('error', reject);

      archive.pipe(output);
      // Append a mock log file or real log if available
      archive.append('System logs would be here.', { name: 'server.log' });
      archive.finalize();
    });
  }
}

module.exports = new Reporter();

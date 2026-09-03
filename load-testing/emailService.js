const nodemailer = require('nodemailer');
const config = require('./config');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      auth: {
        user: config.email.user,
        pass: config.email.password
      }
    });
  }

  async sendEmail(subject, snapshot, reportPaths) {
    if (!config.email.user || !config.email.password) {
      console.warn('Email credentials not configured. Skipping email notification.');
      return;
    }

    const htmlBody = `
      <h2>CityRide Capacity Test Report</h2>
      <p><strong>Maximum Concurrent Customers:</strong> ${snapshot.maxConcurrentCustomers}</p>
      <p><strong>Maximum Concurrent Drivers:</strong> ${snapshot.maxConcurrentDrivers}</p>
      <p><strong>Maximum Active Rides:</strong> ${snapshot.maxActiveRides}</p>
      <p><strong>Peak CPU:</strong> ${snapshot.peakCpu.toFixed(2)}%</p>
      <p><strong>Peak Memory:</strong> ${snapshot.peakMemory.toFixed(2)}%</p>
      <p><strong>Peak Database Latency:</strong> ${snapshot.peakDbLatency.toFixed(2)}ms</p>
      ${snapshot.failureCause ? `<p style="color:red"><strong>Failure Reason:</strong> ${snapshot.failureCause}</p>` : ''}
      <hr>
      <p>Please find the detailed reports and logs attached.</p>
    `;

    const attachments = Object.values(reportPaths).map(filePath => ({
      path: filePath
    }));

    try {
      await this.transporter.sendMail({
        from: `"CityRide Load Tester" <${config.email.user}>`,
        to: config.email.reportEmail,
        subject: subject,
        html: htmlBody,
        attachments: attachments
      });
      console.log(`Email sent successfully to ${config.email.reportEmail}`);
    } catch (err) {
      console.error('Failed to send email:', err.message);
    }
  }

  async sendCrashEmail(snapshot, reportPaths) {
    await this.sendEmail('🚨 URGENT: CityRide Capacity Test CRASH Report', snapshot, reportPaths);
  }

  async sendCompletionEmail(snapshot, reportPaths) {
    await this.sendEmail('✅ CityRide Capacity Test Completion Report', snapshot, reportPaths);
  }
}

module.exports = new EmailService();

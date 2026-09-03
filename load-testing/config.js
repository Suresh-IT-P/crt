require('dotenv').config();

const config = {
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    socketUrl: process.env.SOCKET_URL || 'http://localhost:3000'
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cityride'
  },
  email: {
    host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.BREVO_SMTP_PORT) || 587,
    user: process.env.BREVO_SMTP_USER,
    password: process.env.BREVO_SMTP_PASSWORD,
    reportEmail: process.env.REPORT_EMAIL || 'sureshit2005@gmail.com'
  },
  thresholds: {
    cpuPercent: parseInt(process.env.MAX_CPU_PERCENT) || 95,
    memoryPercent: parseInt(process.env.MAX_MEMORY_PERCENT) || 95,
    errorRatePercent: parseInt(process.env.MAX_ERROR_RATE_PERCENT) || 5,
    eventLoopLagMs: parseInt(process.env.MAX_EVENT_LOOP_LAG_MS) || 1000
  },
  modes: {
    1: { customers: 10, drivers: 10 },
    2: { customers: 25, drivers: 25 },
    3: { customers: 50, drivers: 50 },
    4: { customers: 100, drivers: 100 },
    5: { customers: 250, drivers: 250 },
    6: { customers: 500, drivers: 500 },
    7: { customers: 'auto', drivers: 'auto', step: 10, intervalMs: 60000 }
  }
};

module.exports = config;

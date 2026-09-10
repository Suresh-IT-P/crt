const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const path = require('path');
const os = require('os');
const cron = require('node-cron');
const axios = require('axios');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const multer = require('multer');
const sharp = require('sharp');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pricingEngine = require('./pricingEngine');
const commissionEngine = require('./commissionEngine');
require('dotenv').config();

const app = express();
const httpServer = http.createServer(app);
const isDev = process.env.NODE_ENV !== 'production';

// --- SOCKET.IO SETUP ---
const allowedSocketOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'capacitor://localhost',
    'http://localhost',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
];

const io = new SocketIOServer(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || allowedSocketOrigins.some(o => origin.startsWith(o)) || isDev) {
                callback(null, true);
            } else {
                callback(null, true); // allow all in production (Railway proxy, Capacitor)
            }
        },
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Socket.IO authentication middleware
io.use((socket, next) => {
    try {
        const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];
        if (!token) {
            // Allow unauthenticated connections (they simply won't join private rooms)
            socket.data.role = 'anonymous';
            return next();
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = decoded.id;
        socket.data.role = decoded.role;
        socket.data.name = decoded.name;
        next();
    } catch (e) {
        socket.data.role = 'anonymous';
        next();
    }
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    const { userId, role } = socket.data;

    // Join role-specific rooms
    if (userId && role === 'driver') {
        socket.join(`driver:${userId}`);
        socket.join('drivers');
    } else if (userId && role === 'user') {
        socket.join(`user:${userId}`);
    } else if (userId && role === 'admin') {
        socket.join('admin');
    } else if (userId && role === 'vendor') {
        socket.join(`vendor:${userId}`);
        socket.join('admin'); // vendors see admin events too
    }

    // Allow client to explicitly join a booking room to track live updates
    socket.on('track_booking', (bookingId) => {
        if (bookingId) socket.join(`booking:${bookingId}`);
    });

    socket.on('untrack_booking', (bookingId) => {
        if (bookingId) socket.leave(`booking:${bookingId}`);
    });

    // Realtime Driver -> Customer Pre-Ride Waiting Timer Synchronization
    socket.on('waiting_timer_update', (data) => {
        if (!data || !data.bookingId) return;
        const bId = String(data.bookingId);
        io.to(`booking:${bId}`).emit('waiting_timer_update', data);
    });

    // In-ride chat: relay messages within a booking room and save to database
    socket.on('chat_message', async ({ bookingId, message, senderName, senderRole, timestamp }) => {
        if (!bookingId || !message) return;
        const clean = (typeof message === 'string') ? message.slice(0, 500).trim() : '';
        if (!clean) return;

        const ts = timestamp || Date.now();
        const notifData = {
            bookingId: String(bookingId),
            message: clean,
            senderName: senderName || 'Unknown',
            senderRole: senderRole || 'user',
            timestamp: ts
        };

        // Broadcast to everyone else in the booking room (excluding sender socket)
        socket.to(`booking:${bookingId}`).emit('chat_message', notifData);
        socket.to(`booking:${bookingId}`).emit('chat_notification', notifData);

        // Save to database and notify specific user/driver rooms directly
        try {
            if (db) {
                await db.query(
                    'INSERT INTO taxi_booking_chats (booking_id, sender_role, sender_name, message, created_at) VALUES (?, ?, ?, ?, ?)',
                    [bookingId, senderRole || 'user', senderName || 'Unknown', clean, new Date(ts)]
                );

                // Lookup booking to notify the other party
                const [rows] = await db.query('SELECT user_id, driver_id FROM taxi_bookings WHERE id = ?', [bookingId]);
                if (rows && rows.length > 0) {
                    const booking = rows[0];
                    if (senderRole === 'driver' && booking.user_id) {
                        // Notify passenger directly
                        io.to(`user:${booking.user_id}`).emit('chat_message', notifData);
                        io.to(`user:${booking.user_id}`).emit('chat_notification', notifData);
                    } else if (senderRole === 'user' && booking.driver_id) {
                        // Notify driver directly
                        io.to(`driver:${booking.driver_id}`).emit('chat_message', notifData);
                        io.to(`driver:${booking.driver_id}`).emit('chat_notification', notifData);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to save/notify chat message:', err);
        }
    });

    // Typing indicator
    socket.on('chat_typing', ({ bookingId, senderRole }) => {
        if (!bookingId) return;
        socket.to(`booking:${bookingId}`).emit('chat_typing', { senderRole });
    });

    // WebRTC Signaling for In-App Calling
    socket.on('webrtc_offer', async ({ bookingId, offer, callerName, callerRole }) => {
        if (!bookingId) return;
        socket.to(`booking:${bookingId}`).emit('webrtc_offer', { offer, callerName, callerRole });

        try {
            if (db) {
                await db.query(`UPDATE taxi_booking_calls SET status = 'missed', ended_at = NOW() WHERE booking_id = ? AND status = 'ringing'`, [bookingId]);
                await db.query(`UPDATE taxi_booking_calls SET status = 'completed', ended_at = NOW() WHERE booking_id = ? AND status = 'in_progress'`, [bookingId]);
                await db.query(
                    'INSERT INTO taxi_booking_calls (booking_id, caller_role, caller_name, status, started_at) VALUES (?, ?, ?, ?, NOW())',
                    [bookingId, callerRole || 'unknown', callerName || 'Unknown', 'ringing']
                );
            }
        } catch (e) { console.error('Error saving call offer:', e); }
    });

    socket.on('webrtc_answer', async ({ bookingId, answer }) => {
        if (!bookingId) return;
        socket.to(`booking:${bookingId}`).emit('webrtc_answer', { answer });

        try {
            if (db) {
                await db.query(
                    'UPDATE taxi_booking_calls SET status = ?, answered_at = NOW() WHERE booking_id = ? AND status = ? ORDER BY id DESC LIMIT 1',
                    ['in_progress', bookingId, 'ringing']
                );
            }
        } catch (e) { console.error('Error saving call answer:', e); }
    });

    socket.on('webrtc_ice_candidate', ({ bookingId, candidate }) => {
        if (!bookingId) return;
        socket.to(`booking:${bookingId}`).emit('webrtc_ice_candidate', { candidate });
    });

    socket.on('webrtc_end_call', async ({ bookingId }) => {
        if (!bookingId) return;
        socket.to(`booking:${bookingId}`).emit('webrtc_end_call');

        try {
            if (db) {
                await db.query(`
                    UPDATE taxi_booking_calls 
                    SET status = 'completed', ended_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, answered_at, NOW()) 
                    WHERE booking_id = ? AND status = 'in_progress'
                `, [bookingId]);

                await db.query(`
                    UPDATE taxi_booking_calls 
                    SET status = 'missed', ended_at = NOW() 
                    WHERE booking_id = ? AND status = 'ringing'
                `, [bookingId]);
            }
        } catch (e) { console.error('Error saving call end:', e); }
    });

    socket.on('disconnect', () => {
        // cleanup handled automatically by Socket.IO
    });
});

/**
 * Helper: Emit a socket event safely (never throws, never breaks HTTP flow)
 */
function emitEvent(room, event, data) {
    try {
        io.to(room).emit(event, { ...data, ts: Date.now() });
    } catch (e) {
        // Socket errors must never affect HTTP responses
    }
}

// Global memory cache for ongoing ride GPS tracking and Kalman state
const activeRidesGpsState = new Map();


// --- MIDDLEWARE HARDENING & OPTIMIZATIONS ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
            connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*", "capacitor://*", "https://*.railway.app", "https://photon.komoot.io", "https://router.project-osrm.org", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: null,
        },
    },
    hsts: isDev ? false : {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Strict CSP in Report-Only mode to log any potential issues without blocking them
app.use(helmet.contentSecurityPolicy({
    reportOnly: true,
    directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "http://localhost:*", "http://127.0.0.1:*", "ws://localhost:*", "ws://127.0.0.1:*", "capacitor://*", "https://*.railway.app", "https://photon.komoot.io", "https://router.project-osrm.org", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: null,
    }
}));
app.disable('x-powered-by');

const fs = require('fs');

const getContentType = (ext) => {
    switch (ext) {
        case '.js': return 'application/javascript; charset=UTF-8';
        case '.css': return 'text/css; charset=UTF-8';
        case '.html': return 'text/html; charset=UTF-8';
        case '.svg': return 'image/svg+xml; charset=UTF-8';
        case '.json': return 'application/json; charset=UTF-8';
        case '.png': return 'image/png';
        case '.jpg': case '.jpeg': return 'image/jpeg';
        case '.webp': return 'image/webp';
        case '.ico': return 'image/x-icon';
        default: return 'application/octet-stream';
    }
};

// Custom pre-compressed Brotli/Gzip static serving middleware
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    let reqPath = req.path;
    if (reqPath === '/') {
        reqPath = '/index.html';
    }

    const ext = path.extname(reqPath);
    if (!['.js', '.css', '.html', '.svg', '.json'].includes(ext)) {
        return next();
    }

    const publicDir = path.normalize(path.join(__dirname, 'public') + path.sep);
    const acceptEncoding = req.headers['accept-encoding'] || '';

    if (ext === '.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
    }

    res.setHeader('Content-Type', getContentType(ext));
    res.setHeader('Vary', 'Accept-Encoding');

    const brFilePath = path.normalize(path.join(publicDir, reqPath + '.br'));
    if (brFilePath.startsWith(publicDir)) {
        if (acceptEncoding.includes('br') && fs.existsSync(brFilePath)) {
            res.setHeader('Content-Encoding', 'br');
            return fs.createReadStream(brFilePath).pipe(res);
        }
    } else {
        return res.status(403).send('Forbidden');
    }

    const gzFilePath = path.normalize(path.join(publicDir, reqPath + '.gz'));
    if (gzFilePath.startsWith(publicDir)) {
        if (acceptEncoding.includes('gzip') && fs.existsSync(gzFilePath)) {
            res.setHeader('Content-Encoding', 'gzip');
            return fs.createReadStream(gzFilePath).pipe(res);
        }
    } else {
        return res.status(403).send('Forbidden');
    }

    next();
});

// Configure caching for fallback static assets serving
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '365d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30 days
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 365 days
        }
    }
}));

// Compression middleware (moved after static files serving)
app.use(compression({
    filter: (req, res) => {
        if (req.originalUrl && req.originalUrl.includes('/api/monitor/stream')) {
            return false;
        }
        return compression.filter(req, res);
    }
}));
app.use(cookieParser());

// Trust Proxy for Nginx (for accurate rate-limiting client IP capture)
app.set('trust proxy', 1);

// Limit request sizes (brute force payload protection)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

// Restrict CORS to approved domains & support native APK webviews
app.use(cors({
    origin: (origin, callback) => {
        // Always allow mobile APK webviews, Capacitor, local network, and preflight requests
        callback(null, true);
    },
    credentials: true
}));

// --- LIVE MONITOR: SSE BROADCAST SYSTEM ---
const LOG_FILE = './server.log';

const monitorClients = new Set();
const activityLog = [];
const MAX_LOG_SIZE = 500;

// Load persistent log history from JSONL file on startup so logs survive restarts
function loadLogHistory() {
    try {
        const backupFile = './server.log.bak';
        let lines = [];
        if (fs.existsSync(backupFile)) {
            const backupContent = fs.readFileSync(backupFile, 'utf8');
            lines = lines.concat(backupContent.split('\n'));
        }
        if (fs.existsSync(LOG_FILE)) {
            const logContent = fs.readFileSync(LOG_FILE, 'utf8');
            lines = lines.concat(logContent.split('\n'));
        }

        const loaded = [];
        // Parse from end to get the most recent entries up to MAX_LOG_SIZE
        const reversedLines = lines.slice().reverse();
        for (const lineRaw of reversedLines) {
            const line = lineRaw.trim();
            if (!line) continue;
            try {
                const entry = JSON.parse(line);
                loaded.push(entry);
                if (loaded.length >= MAX_LOG_SIZE) break;
            } catch (e) {
                // skip corrupt lines
            }
        }
        // Populate activityLog (newest first)
        activityLog.push(...loaded);
    } catch (err) {
        process.stdout.write(`Failed to load persistent log history: ${err.message}\n`);
    }
}
loadLogHistory();

function appendToLogFile(entry) {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFile(LOG_FILE, logLine, 'utf8', (err) => {
        if (err) return;
        // Check size and rotate asynchronously if > 10MB to avoid infinite disk growth
        fs.stat(LOG_FILE, (err, stats) => {
            if (err) return;
            if (stats.size > 10 * 1024 * 1024) {
                const backup = './server.log.bak';
                fs.unlink(backup, () => {
                    fs.rename(LOG_FILE, backup, () => { });
                });
            }
        });
    });
}

function broadcastLog(entry) {
    activityLog.unshift(entry);
    if (activityLog.length > MAX_LOG_SIZE) activityLog.pop();

    // Save to persistent file log
    appendToLogFile(entry);

    const data = `data: ${JSON.stringify(entry)}\n\n`;
    for (const client of monitorClients) {
        try { client.write(data); } catch (e) { monitorClients.delete(client); }
    }
}

// Hook console methods to broadcast all console output directly to the live monitor HTML page
const util = require('util');
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;
const originalDebug = console.debug;

let isConsoleBroadcasting = false;

function handleConsoleBroadcast(args, level) {
    if (isConsoleBroadcasting) return;
    isConsoleBroadcasting = true;
    try {
        const message = util.format(...args);

        // Skip HTTP request logs since they are already broadcasted via type 'HTTP' to prevent duplicate feed entries.
        // However, keep the /api/monitor requests because they are skipped by the HTTP logger.
        if (message.startsWith('[REQUEST]') && !message.includes('/api/monitor')) {
            isConsoleBroadcasting = false;
            return;
        }

        broadcastLog({
            type: 'CONSOLE',
            level: level,
            text: message,
            ts: Date.now()
        });
    } catch (err) {
        // Fallback to original just in case
    } finally {
        isConsoleBroadcasting = false;
    }
}

console.log = function (...args) {
    originalLog.apply(console, args);
    handleConsoleBroadcast(args, 'LOG');
};

console.error = function (...args) {
    originalError.apply(console, args);
    handleConsoleBroadcast(args, 'ERROR');
};

console.warn = function (...args) {
    originalWarn.apply(console, args);
    handleConsoleBroadcast(args, 'WARN');
};

console.info = function (...args) {
    originalInfo.apply(console, args);
    handleConsoleBroadcast(args, 'INFO');
};

console.debug = function (...args) {
    originalDebug.apply(console, args);
    handleConsoleBroadcast(args, 'DEBUG');
};

// Hardware Metrics Broadcast
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();
setInterval(() => {
    if (monitorClients.size === 0) return; // don't compute if no one is watching
    const memUsage = process.memoryUsage();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();

    const cpuUsage = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();
    const now = Date.now();
    const elapsedTime = now - lastCpuTime;
    lastCpuTime = now;

    const cpuPercent = (100 * (cpuUsage.user + cpuUsage.system) / 1000) / elapsedTime;

    const sysMetrics = {
        type: 'SYS_METRICS',
        cpu: cpuPercent.toFixed(1),
        memUsed: ((totalMem - freeMem) / 1024 / 1024).toFixed(0),
        memTotal: (totalMem / 1024 / 1024).toFixed(0),
        rss: (memUsage.rss / 1024 / 1024).toFixed(0),
        uptime: process.uptime().toFixed(0),
        ts: Date.now()
    };

    const data = `data: ${JSON.stringify(sysMetrics)}\n\n`;
    for (const client of monitorClients) {
        try { client.write(data); } catch (e) { monitorClients.delete(client); }
    }
}, 2000);

// Security/Auth stats state
const authStats = {
    loginSuccess: 0,
    loginFail: 0,
    registrations: 0,
    otpDispatched: 0
};

// Security Logging Helper
function logAuthEvent({ event, role, identifier, status, ip, message, reason }) {
    if (status === 'OK') {
        if (event.includes('LOGIN')) authStats.loginSuccess++;
        else if (event.includes('REGISTER') || event.includes('APPLY')) authStats.registrations++;
        else if (event.includes('OTP') || event.includes('SEND')) authStats.otpDispatched++;
    } else {
        if (event.includes('LOGIN')) authStats.loginFail++;
    }

    let maskedIdentifier = identifier || 'unknown';
    if (typeof maskedIdentifier === 'string') {
        if (maskedIdentifier.includes('@')) {
            const [local, domain] = maskedIdentifier.split('@');
            if (local.length > 2) {
                maskedIdentifier = `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
            } else {
                maskedIdentifier = `***@${domain}`;
            }
        } else if (maskedIdentifier.length >= 7) {
            maskedIdentifier = `${maskedIdentifier.substring(0, 3)}***${maskedIdentifier.substring(maskedIdentifier.length - 3)}`;
        } else {
            maskedIdentifier = '***';
        }
    }

    broadcastLog({
        type: 'AUTH',
        event,
        role: role || 'unknown',
        identifier: maskedIdentifier,
        status: status || 'OK',
        ip: ip || 'unknown',
        message: message || '',
        reason: reason || '',
        ts: Date.now()
    });
}

// Mask sensitive parameters in objects recursively
function maskSensitiveData(obj) {
    if (!obj) return obj;
    if (typeof obj !== 'object') return obj;
    try {
        const cloned = JSON.parse(JSON.stringify(obj));
        const sensitiveKeys = ['password', 'token', 'otp', 'secret', 'cvv', 'key', 'auth', 'pass', 'cookie'];

        function recurse(current) {
            if (!current || typeof current !== 'object') return;
            for (const key in current) {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
                if (Object.prototype.hasOwnProperty.call(current, key)) {
                    const val = Reflect.get(current, key);
                    if (typeof val === 'object' && val !== null) {
                        recurse(val);
                    } else if (typeof key === 'string') {
                        const lowerKey = key.toLowerCase();
                        if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
                            Reflect.set(current, key, '***[SECURE]***');
                        } else if (typeof val === 'string' && val.length > 1000) {
                            Reflect.set(current, key, val.substring(0, 100) + '... (truncated)');
                        }
                    }
                }
            }
        }
        recurse(cloned);
        return cloned;
    } catch (e) {
        return { error: 'Failed to serialize payload details.' };
    }
}

// DB Query Interceptor - wrap db.query to log all DB activity
function wrapDB(pool) {
    const originalQuery = pool.query.bind(pool);
    pool.query = async function (sql, params) {
        const start = Date.now();
        let op = 'QUERY';
        const sqlUpper = (sql || '').trim().toUpperCase();
        if (sqlUpper.startsWith('SELECT')) op = 'SELECT';
        else if (sqlUpper.startsWith('INSERT')) op = 'INSERT';
        else if (sqlUpper.startsWith('UPDATE')) op = 'UPDATE';
        else if (sqlUpper.startsWith('DELETE')) op = 'DELETE';
        else if (sqlUpper.startsWith('CREATE')) op = 'CREATE';
        else if (sqlUpper.startsWith('ALTER')) op = 'ALTER';
        else if (sqlUpper.startsWith('DROP')) op = 'DROP';
        try {
            const result = await originalQuery(sql, params);
            const duration = Date.now() - start;
            const rows = Array.isArray(result[0]) ? result[0].length : (result[0] ? 1 : 0);
            const table = (sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+([\w_]+)/i) || [])[1] || 'unknown';
            broadcastLog({
                type: 'DB',
                op,
                table,
                sql: sql.replace(/\s+/g, ' ').trim().substring(0, 120),
                duration,
                rows,
                status: 'OK',
                ts: Date.now()
            });
            return result;
        } catch (err) {
            const duration = Date.now() - start;
            broadcastLog({
                type: 'DB',
                op,
                sql: sql.replace(/\s+/g, ' ').trim().substring(0, 120),
                duration,
                rows: 0,
                status: 'ERROR',
                error: err.message,
                ts: Date.now()
            });
            throw err;
        }
    };
    return pool;
}

// Request Logger Middleware
app.use((req, res, next) => {
    const start = Date.now();

    // Intercept send to capture response body
    const originalSend = res.send;
    let responseBody = null;
    res.send = function (body) {
        responseBody = body;
        return originalSend.apply(res, arguments);
    };

    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLine = `[REQUEST] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} - Duration: ${duration}ms - IP: ${req.ip}`;
        console.log(logLine);
        // Skip broadcasting monitor SSE itself to avoid feedback loop
        if (!req.originalUrl.startsWith('/api/monitor')) {
            let reqBody = null;
            if (req.body && Object.keys(req.body).length > 0) {
                reqBody = maskSensitiveData(req.body);
            }
            let reqQuery = null;
            if (req.query && Object.keys(req.query).length > 0) {
                reqQuery = maskSensitiveData(req.query);
            }
            let resBody = null;
            if (responseBody) {
                try {
                    let parsed = responseBody;
                    if (typeof responseBody === 'string') {
                        try {
                            parsed = JSON.parse(responseBody);
                        } catch (e) {
                            if (responseBody.length > 500) {
                                parsed = responseBody.substring(0, 500) + '... (truncated)';
                            }
                        }
                    }
                    resBody = maskSensitiveData(parsed);
                } catch (e) {
                    resBody = '[unparseable response body]';
                }
            }

            broadcastLog({
                type: 'HTTP',
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration,
                ip: req.ip || 'unknown',
                reqBody,
                reqQuery,
                resBody,
                ts: Date.now()
            });
        }
    });
    next();
});

// Fallback for missing uploads (prevents 404 console errors by redirecting to a placeholder)
app.use('/uploads', (req, res) => {
    res.redirect('https://placehold.co/600x400?text=File+Not+Found+On+Server');
});

// --- JWT CONFIGURATION & HELPERS (Single-Token Architecture) ---
if (!process.env.JWT_SECRET) {
    console.error("FATAL ERROR: process.env.JWT_SECRET is not defined. Server cannot start securely.");
    process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '3650d'; // 10 years access token (safe from 32-bit integer overflows, practically infinite)

// Cookie name per role so different panels can coexist in the same browser
function getRoleCookieName(role) {
    switch (role) {
        case 'admin': return 'cr_admin_tok';
        case 'driver': return 'cr_driver_tok';
        case 'user': return 'cr_user_tok';
        case 'vendor': return 'cr_vendor_tok';
        case 'association_admin': return 'cr_assoc_tok';
        default: return 'cr_user_tok';
    }
}

async function setAuthCookie(res, req, user, role) {
    const accessPayload = {
        id: user.id,
        role: role,
        name: user.name,
        email: user.email || null,
        phone: user.phone || null
    };
    const accessToken = jwt.sign(accessPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const cookieName = getRoleCookieName(role);
    res.cookie(cookieName, accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 10 * 365 * 24 * 60 * 60 * 1000 // 10 years (avoids Y2K38 integer overflow in browsers)
    });
    // Keep legacy cookie in sync so old clients aren't broken immediately
    res.cookie('cityride_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        maxAge: 10 * 365 * 24 * 60 * 60 * 1000 // 10 years (avoids Y2K38 integer overflow in browsers)
    });
}

function authenticateJWT(req, res, next) {
    const allCookies = req.cookies || {};
    const url = req.originalUrl || '';
    const authHeader = req.headers.authorization && req.headers.authorization.split(' ')[1];

    // Read all potential tokens
    const tokens = {
        association_admin: allCookies.cr_assoc_tok,
        admin: allCookies.cr_admin_tok,
        driver: allCookies.cr_driver_tok,
        vendor: allCookies.cr_vendor_tok,
        user: allCookies.cr_user_tok,
        legacy: allCookies.cityride_token || authHeader
    };

    // Determine target/preferred role based on the route
    let preferredRole = null;
    if (url.includes('/api/admin/')) {
        preferredRole = 'admin';
    } else if (url.includes('/api/driver/')) {
        preferredRole = 'driver';
    } else if (url.includes('/api/vendor/') || url.includes('/search-by-vehicle')) {
        preferredRole = 'vendor';
    } else if (url.includes('/api/user/')) {
        preferredRole = 'user';
    } else if (url.includes('/api/association/')) {
        preferredRole = 'association_admin';
    } else if (url.includes('/api/bookings/')) {
        if (url.includes('/create') || url.includes('/rate-driver') || url.includes('/driver-location') || url.includes('/fare-breakdown')) {
            preferredRole = 'user';
        } else if (url.includes('/accept') || url.includes('/reached-pickup') || url.includes('/start-journey') || url.includes('/finish-trip') || url.includes('/update-gps-location') || url.includes('/upload-gps-logs-bulk') || url.includes('/update-status')) {
            preferredRole = 'driver';
        }
    }

    // Try to find a valid token. If preferredRole is set, try that first.
    let validDecoded = null;
    let fallbackDecoded = null;

    // Helper to verify a token
    const verifyToken = (token) => {
        if (!token) return null;
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return null;
        }
    };

    const getTokenByRole = (roleName) => {
        switch (roleName) {
            case 'admin': return tokens.admin;
            case 'driver': return tokens.driver;
            case 'vendor': return tokens.vendor;
            case 'user': return tokens.user;
            case 'legacy': return tokens.legacy;
            default: return null;
        }
    };

    // Try verifying the preferred token first
    const prefToken = getTokenByRole(preferredRole);
    if (preferredRole && prefToken) {
        validDecoded = verifyToken(prefToken);
    }

    // If preferred token was not found or invalid, try other tokens in order of relevance
    if (!validDecoded) {
        // Look through all tokens and find any valid one
        const rolesOrder = ['admin', 'driver', 'user', 'vendor', 'legacy'];
        for (const roleKey of rolesOrder) {
            if (roleKey === preferredRole) continue; // already checked
            const decoded = verifyToken(getTokenByRole(roleKey));
            if (decoded) {
                if (!fallbackDecoded) {
                    fallbackDecoded = decoded;
                }

                // If the decoded role matches the preferredRole, set it as valid
                if (preferredRole && decoded.role === preferredRole) {
                    validDecoded = decoded;
                    break;
                }
            }
        }
    }

    const finalDecoded = validDecoded || fallbackDecoded;
    if (!finalDecoded) {
        return res.status(401).json({ error: 'Access denied. No valid authentication token provided.' });
    }

    req.user = finalDecoded;
    next();
}

function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            console.warn(`[AUTH WARNING] Path ${req.originalUrl} requires role [${roles.join(', ')}], but req.user has role "${req.user ? req.user.role : 'none'}"`);
            return res.status(403).json({ error: 'Access denied. Unauthorized access role.' });
        }
        next();
    };
}

async function verifyBookingAccess(req, res, next) {
    const bookingId = req.params.bookingId || req.body.bookingId || req.query.bookingId;
    if (!bookingId) return res.status(400).json({ error: 'Booking ID is required.' });
    try {
        const [bookings] = await db.query('SELECT * FROM taxi_bookings WHERE id = ?', [bookingId]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });

        const b = bookings[0];
        req.booking = b;
        if (req.user.role === 'admin') return next();
        if (req.user.role === 'driver' && b.driver_id === req.user.id) return next();
        if (req.user.role === 'user' && b.user_id === req.user.id) return next();

        return res.status(403).json({ error: 'Access Denied: You do not have permission to view or modify this booking.' });
    } catch (err) {
        return res.status(500).json({ error: 'Booking verification failed.' });
    }
}

// --- INPUT VALIDATION & SANITIZATION HELPERS ---
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

function validatePhone(phone) {
    const re = /^\+?[0-9\s\-()]{7,15}$/;
    return re.test(String(phone));
}

function cleanString(str) {
    if (typeof str !== 'string') return '';
    return str.trim();
}

// --- MULTER STORAGE CONFIGURATION (IN-MEMORY WITH FILE FILTERING) ---
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB size limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('MIME Policy: Only JPEG, PNG, and WEBP image files are allowed.'), false);
        }
    }
});

// Helper to optimize and convert uploaded image files to a low-size JPEG Base64 string
const optimizeAndGetBase64 = async (fileArray) => {
    if (!fileArray || fileArray.length === 0) return null;
    const file = fileArray[0];
    try {
        // Resize to max 800px width/height and compress to quality 60
        const optimizedBuffer = await sharp(file.buffer)
            .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 60 })
            .toBuffer();

        return `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;
    } catch (err) {
        console.error(`Error optimizing file ${file.fieldname}:`, err.message);
        // Fallback to raw base64 if sharp fails (e.g. if it's already a non-image or invalid format)
        try {
            return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        } catch (fallbackErr) {
            return null;
        }
    }
};

// --- RATE LIMITING ---
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3000,
    message: { error: 'Security Limit: Too many requests from this IP.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2500,
    message: { error: 'API Rate limit exceeded. Please lower your request frequency.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict authentication rate limiter
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Security Limit: Too many attempts. Try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(globalLimiter);
app.use('/api/', apiLimiter);

// Clean Navigation Routes
app.get('/monitor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'monitor.html')));
app.get('/driver', (req, res) => res.sendFile(path.join(__dirname, 'public', 'driver.html')));
app.get('/vendor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vendor.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'public', 'auth.html')));
app.get('/driver-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'driver-login.html')));
app.get('/driver-register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'driver-register.html')));
app.get('/vendor-login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vendor-login.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));

// --- DRIVER ONBOARDING OTP STORAGE ---
const registrationOtps = new Map(); // email -> otp

// Global DB
let db;

// --- MAIL ENGINE (Supports Gmail & Brevo) ---
async function sendBrevoMail(recipient, subject, htmlContent, attachments = []) {
    // 1. If GMAIL SMTP app passcode is provided, use NodeMailer with Gmail (Most Reliable for @gmail.com senders)
    if (process.env.GMAIL_APP_PASSWORD && process.env.BREVO_SENDER_EMAIL) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.BREVO_SENDER_EMAIL,
                    pass: process.env.GMAIL_APP_PASSWORD
                }
            });

            const mailOptions = {
                from: `"${process.env.BREVO_SENDER_NAME || 'CityRide'}" <${process.env.BREVO_SENDER_EMAIL}>`,
                to: recipient,
                subject: subject,
                html: htmlContent
            };

            if (attachments && attachments.length > 0) {
                mailOptions.attachments = attachments.map(att => ({
                    filename: att.name,
                    content: att.content
                }));
            }

            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ [GMAIL SMTP] Mail successfully delivered to: ${recipient}. Message ID: ${info.messageId}`);
            return info;
        } catch (err) {
            console.error(`❌ [GMAIL SMTP] Error to ${recipient}:`, err.message);
            throw err;
        }
    }

    // 2. Fallback to Brevo HTTP API
    if (!process.env.BREVO_API_KEY) {
        console.error('❌ MAIL FAILURE: No Gmail App Password or Brevo API Key found.');
        return;
    }

    try {
        const payload = {
            sender: {
                name: process.env.BREVO_SENDER_NAME || 'CityRide',
                email: process.env.BREVO_SENDER_EMAIL || 'sureshit2005@gmail.com'
            },
            to: [{ email: recipient }],
            subject: subject,
            htmlContent: htmlContent
        };

        if (attachments && attachments.length > 0) {
            payload.attachment = attachments;
        }

        const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        console.log(`✅ [BREVO API] Mail successfully dispatched to: ${recipient}. Message ID: ${response.data.messageId || 'N/A'}`);
        return response.data;
    } catch (err) {
        const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error(`❌ [BREVO API] Error to ${recipient}:`, errMsg);
        throw new Error(errMsg);
    }
}

async function initDB() {
    // Detect environment: use internal Railway variables only in actual cloud container
    const isRailway = !!(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_STATIC_URL);

    let host, port, user, password, database;

    // Default to the config from .env (which contains public credentials)
    const publicHost = process.env.DB_HOST || 'localhost';
    const publicPort = parseInt(process.env.DB_PORT) || 3306;
    const publicUser = process.env.DB_USER || 'root';
    const publicPassword = process.env.DB_PASSWORD || '';
    const publicDatabase = process.env.DB_NAME || 'railway';

    if (isRailway) {
        if (process.env.MYSQL_URL) {
            console.log('Detected MYSQL_URL. Parsing connection details directly from Railway...');
            try {
                const url = new URL(process.env.MYSQL_URL);
                host = url.hostname;
                port = parseInt(url.port) || 3306;
                user = url.username;
                password = url.password;
                database = url.pathname.replace('/', '');
            } catch (e) {
                console.error('Failed to parse MYSQL_URL:', e.message);
            }
        }

        // Fallback to individual variables if MYSQL_URL parsing failed or didn't exist
        host = host || process.env.DB_HOST || process.env.MYSQL_HOST || process.env.MYSQLHOST || 'mysql.railway.internal';
        port = port || parseInt(process.env.DB_PORT) || parseInt(process.env.MYSQLPORT) || publicPort;
        user = user || process.env.DB_USER || process.env.MYSQLUSER || publicUser;
        password = password || process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || process.env.MYSQL_ROOT_PASSWORD || publicPassword;
        database = database || process.env.DB_NAME || process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE || publicDatabase;

        console.log('Detected Railway Container environment. Connecting internally to MySQL at:', host, 'on port:', port);
    } else {
        host = publicHost;
        port = publicPort;
        user = publicUser;
        password = publicPassword;
        database = publicDatabase;
        console.log('Detected Local/PC environment. Connecting to MySQL proxy at:', host, 'on port:', port);
    }
    
const dbConfig = {
        host: host,
        port: port,
        user: user,
        password: password,
        database: database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'UTF8MB4_UNICODE_CI',
        timezone: 'Z',
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
    };

    if (process.env.DB_SSL === 'true') {
        dbConfig.ssl = { rejectUnauthorized: false };
    }


    try {
        // 1. Ensure Database Exists (Safe check - fallback to pool directly if single connection drops)
        try {
            const tempConn = await mysql.createConnection({
                host: dbConfig.host,
                port: dbConfig.port,
                user: dbConfig.user,
                password: dbConfig.password,
                connectTimeout: 5000,
                ssl: dbConfig.ssl
            });
            await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            await tempConn.end();
            console.log(`Database "${dbConfig.database}" ensured.`);
        } catch (err) {
            console.warn(`⚠️ Pre-check warning (${err.code || err.message}). Proceeding directly with database pool...`);
        }

        // 2. Initialize Shared Pool
        db = mysql.createPool(dbConfig);

        // Pool Error Handling
        db.on('error', (err) => {
            console.error('Database Pool Error:', err.code || err.message);
            if (['PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(err.code)) {
                console.log('Re-initializing database pool after network connection drop...');
                try {
                    db = wrapDB(mysql.createPool(dbConfig));
                } catch (e) { console.error('Failed to re-initialize pool:', e); }
            }
        });

        console.log('Database Pool initialized.');

        // Wrap DB to intercept and broadcast all queries for live monitor
        db = wrapDB(db);

        // 3. Create Tables
        // Passengers
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_passengers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100),
                password VARCHAR(255),
                phone VARCHAR(20) UNIQUE,
                otp_verified TINYINT DEFAULT 0,
                banned_until TIMESTAMP NULL,
                is_blocked TINYINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS passengers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100),
                password VARCHAR(255),
                phone VARCHAR(20) UNIQUE,
                otp_verified TINYINT DEFAULT 0,
                banned_until TIMESTAMP NULL,
                is_blocked TINYINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Ensure is_blocked exists
        try {
            await db.query('ALTER TABLE taxi_passengers ADD COLUMN is_blocked TINYINT DEFAULT 0');
        } catch (e) { /* existing */ }
        try {
            await db.query('ALTER TABLE passengers ADD COLUMN is_blocked TINYINT DEFAULT 0');
        } catch (e) { /* existing */ }

        // taxi_drivers
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_drivers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                password VARCHAR(255),
                phone VARCHAR(20),
                car_model VARCHAR(50),
                car_number VARCHAR(20),
                vehicle_type VARCHAR(50) DEFAULT 'sedan',
                wallet_balance DECIMAL(10,2) DEFAULT 0,
                is_blocked TINYINT DEFAULT 0,
                approval_status VARCHAR(20) DEFAULT 'approved',
                
                -- Driver Documents (Stored upon approval)
                dl_front LONGTEXT,
                dl_back LONGTEXT,
                pvc LONGTEXT,
                aadhar_front LONGTEXT,
                aadhar_back LONGTEXT,
                rc_book LONGTEXT,
                insurance LONGTEXT,
                pollution LONGTEXT,
                permit LONGTEXT,
                payment_qr LONGTEXT,
                pref_loc_1 VARCHAR(100),
                pref_loc_2 VARCHAR(100),
                pref_loc_3 VARCHAR(100),
                ride_local TINYINT DEFAULT 1,
                ride_oneway TINYINT DEFAULT 1,
                ride_round TINYINT DEFAULT 1,
                seating_capacity INT DEFAULT 5,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Ensure columns exist
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN is_blocked TINYINT DEFAULT 0'); } catch (e) { }
        try { await db.query("ALTER TABLE taxi_drivers ADD COLUMN approval_status VARCHAR(20) DEFAULT 'approved'"); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN profile_photo LONGTEXT'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN seating_capacity INT DEFAULT 5'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN dl_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN pvc_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN insurance_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN pollution_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD COLUMN permit_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_drivers ADD UNIQUE (phone)'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD UNIQUE (phone)'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN profile_photo LONGTEXT'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN seating_capacity INT DEFAULT 5'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN dl_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN pvc_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN insurance_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN pollution_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN permit_expiry DATE NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_driver_applications ADD COLUMN payment_qr LONGTEXT'); } catch (e) { }

        // Add Preferences & Seating Capacity Migrations
        const prefCols = ['pref_loc_1 VARCHAR(100)', 'pref_loc_2 VARCHAR(100)', 'pref_loc_3 VARCHAR(100)', 'ride_local TINYINT DEFAULT 1', 'ride_oneway TINYINT DEFAULT 1', 'ride_round TINYINT DEFAULT 1', 'seating_capacity INT DEFAULT 5'];
        for (const col of prefCols) {
            try { await db.query(`ALTER TABLE taxi_drivers ADD COLUMN ${col}`); } catch (e) { }
            try { await db.query(`ALTER TABLE taxi_driver_applications ADD COLUMN ${col}`); } catch (e) { }
        }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN seating_capacity INT DEFAULT 4'); } catch (e) { }

        // Add Document Columns to Drivers if missing
        const docCols = ['dl_front', 'dl_back', 'pvc', 'aadhar_front', 'aadhar_back', 'rc_book', 'insurance', 'pollution', 'permit', 'payment_qr'];
        for (const col of docCols) {
            try { await db.query(`ALTER TABLE taxi_drivers ADD COLUMN ${col} LONGTEXT`); } catch (e) { }
        }

        // Add GPS Location & Status Columns to Drivers if missing
        const gpsCols = ['latitude DECIMAL(10, 8) NULL', 'longitude DECIMAL(11, 8) NULL', 'is_online TINYINT DEFAULT 0', 'last_seen TIMESTAMP NULL'];
        for (const col of gpsCols) {
            try { await db.query(`ALTER TABLE taxi_drivers ADD COLUMN ${col}`); } catch (e) { }
        }

        // District, Association & ID Card Columns
        const driverAssocCols = [
            'district VARCHAR(100) NULL',
            'association_id INT NULL',
            "association_name VARCHAR(150) DEFAULT 'CityRide Driver (Independent)'",
            'association_id_card LONGTEXT NULL'
        ];
        for (const col of driverAssocCols) {
            try { await db.query(`ALTER TABLE taxi_drivers ADD COLUMN ${col}`); } catch (e) { }
            try { await db.query(`ALTER TABLE taxi_driver_applications ADD COLUMN ${col}`); } catch (e) { }
        }

        // SOS Emergency Alerts Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_sos_alerts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT,
                user_type VARCHAR(20) DEFAULT 'passenger',
                user_id INT,
                association_id INT,
                user_name VARCHAR(100),
                user_phone VARCHAR(20),
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                status VARCHAR(20) DEFAULT 'active',
                resolution_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        try { await db.query('ALTER TABLE taxi_sos_alerts ADD COLUMN association_id INT'); } catch (e) { }

        // Association Support Tickets
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_association_support_tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                association_id INT,
                booking_id INT,
                customer_id INT,
                driver_id INT,
                issue_text TEXT,
                status VARCHAR(20) DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Association Incentives
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_association_incentives (
                id INT AUTO_INCREMENT PRIMARY KEY,
                association_id INT,
                title VARCHAR(255),
                target_rides INT,
                bonus_amount DECIMAL(10,2),
                period VARCHAR(50),
                is_active TINYINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Association Surge Config
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_association_surge_config (
                association_id INT PRIMARY KEY,
                multiplier DECIMAL(3, 2) DEFAULT 1.00,
                night_surcharge_percent INT DEFAULT 0,
                bata_per_day DECIMAL(10, 2) DEFAULT 0.00,
                is_active TINYINT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Global Surge Pricing Config Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_surge_config (
                id INT AUTO_INCREMENT PRIMARY KEY,
                surge_key VARCHAR(50) UNIQUE,
                multiplier DECIMAL(3, 2) DEFAULT 1.00,
                is_active TINYINT DEFAULT 0,
                description VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Seed default surge config keys if empty
        try {
            await db.query(`
                INSERT IGNORE INTO taxi_surge_config (surge_key, multiplier, is_active, description) VALUES 
                ('night_surge', 1.25, 0, 'Night Surcharge (10 PM - 5 AM)'),
                ('rain_surge', 1.30, 0, 'Rain & Monsoon Surge'),
                ('demand_surge', 1.50, 0, 'High Demand Zone Surge')
            `);
        } catch (e) { }

        // taxi_driver_applications (New Registrations)
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_driver_applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                password VARCHAR(255),
                phone VARCHAR(20),
                car_model VARCHAR(50),
                car_number VARCHAR(20),
                vehicle_type VARCHAR(50) DEFAULT 'sedan',
                
                -- Driver Documents
                dl_front LONGTEXT,
                dl_back LONGTEXT,
                pvc LONGTEXT,
                aadhar_front LONGTEXT,
                aadhar_back LONGTEXT,
                
                -- Vehicle Documents
                rc_book LONGTEXT,
                insurance LONGTEXT,
                pollution LONGTEXT,
                permit LONGTEXT,
                payment_qr LONGTEXT,
                pref_loc_1 VARCHAR(100),
                pref_loc_2 VARCHAR(100),
                pref_loc_3 VARCHAR(100),
                ride_local TINYINT DEFAULT 1,
                ride_oneway TINYINT DEFAULT 1,
                ride_round TINYINT DEFAULT 1,
                seating_capacity INT DEFAULT 5,
                
                status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
                admin_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Modify document columns to LONGTEXT to support Base64 images
        const docColsToMigrate = ['dl_front', 'dl_back', 'pvc', 'aadhar_front', 'aadhar_back', 'rc_book', 'insurance', 'pollution', 'permit', 'payment_qr'];
        for (const col of docColsToMigrate) {
            try { await db.query(`ALTER TABLE taxi_drivers MODIFY COLUMN ${col} LONGTEXT`); } catch (e) { }
            try { await db.query(`ALTER TABLE taxi_driver_applications MODIFY COLUMN ${col} LONGTEXT`); } catch (e) { }
        }

        // taxi_admins
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                password VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed default admin if empty
        const [adminRows] = await db.query('SELECT COUNT(*) as cnt FROM taxi_admins');
        if (adminRows[0].cnt === 0) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('adminpass', salt);
            await db.query('INSERT INTO taxi_admins (name, email, password) VALUES (?, ?, ?)',
                ['CityRide Admin', 'admin@cityridetaxi', hashedPassword]);
            console.log('Default admin seeded.');
        }

        // taxi_vendors (Partners/Dealers)
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_vendors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id VARCHAR(50) UNIQUE,
                name VARCHAR(100),
                business_name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                password VARCHAR(255),
                phone VARCHAR(20),
                is_blocked TINYINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // taxi_bookings
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_bookings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                pickup_loc TEXT,
                pickup_coords VARCHAR(100),
                drop_loc TEXT,
                drop_coords VARCHAR(100),
                pickup_date DATE,
                pickup_time TIME,
                passengers INT,
                vehicle_type VARCHAR(50),
                trip_type VARCHAR(50),
                fare VARCHAR(20),
                status VARCHAR(20) DEFAULT 'pending',
                driver_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Ensure coords exist
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN pickup_coords VARCHAR(100) AFTER pickup_loc'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN drop_coords VARCHAR(100) AFTER drop_loc'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN extra_drops TEXT AFTER drop_coords'); } catch (e) { }

        // Migration: Ensure trip_type exists
        try {
            await db.query('ALTER TABLE taxi_bookings ADD COLUMN trip_type VARCHAR(50) AFTER vehicle_type');
        } catch (e) { /* already exists */ }

        // Migration: Ensure cancel_reason exists
        try {
            await db.query('ALTER TABLE taxi_bookings ADD COLUMN cancel_reason TEXT AFTER status');
        } catch (e) { /* already exists */ }

        // Migration: Ensure distance exists
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN distance VARCHAR(50)'); } catch (e) { }

        // Migration: Ensure core columns exist (Safe recovery)
        try {
            await db.query("ALTER TABLE taxi_bookings ADD COLUMN status VARCHAR(20) DEFAULT 'pending' AFTER fare");
            console.log('✅ Migration: status column added to bookings.');
        } catch (e) {
            if (!e.message.includes('Duplicate column name')) console.error('❌ Migration Error (status):', e.message);
        }

        try {
            await db.query('ALTER TABLE taxi_bookings ADD COLUMN journey_otp VARCHAR(10) AFTER status');
            console.log('✅ Migration: journey_otp column added to bookings.');
        } catch (e) {
            if (!e.message.includes('Duplicate column name')) console.error('❌ Migration Error (journey_otp):', e.message);
        }

        try {
            await db.query('ALTER TABLE taxi_bookings ADD COLUMN vendor_id INT NULL');
            console.log('✅ Migration: vendor_id column added to bookings.');
        } catch (e) {
            if (!e.message.includes('Duplicate column name')) console.error('❌ Migration Error (vendor_id):', e.message);
        }

        try {
            await db.query('ALTER TABLE taxi_bookings ADD COLUMN vendor_markup DECIMAL(10,2) DEFAULT 0');
            console.log('✅ Migration: vendor_markup column added to bookings.');
        } catch (e) {
            if (!e.message.includes('Duplicate column name')) console.error('❌ Migration Error (vendor_markup):', e.message);
        }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN journey_otp VARCHAR(10)'); } catch (e) { }

        // Migration: Odometer and Timer for Rental
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN start_odometer INT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN end_odometer INT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN journey_start_time DATETIME NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN journey_end_time DATETIME NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN rental_package VARCHAR(50) NULL'); } catch (e) { }
        // Ensure status column can handle all states including vendor flow
        try { await db.query("ALTER TABLE taxi_bookings MODIFY COLUMN status ENUM('pending', 'assigned', 'vendor_assigned', 'pending_vendor_assignment', 'ongoing', 'finished', 'completed', 'cancelled', 'cancel_requested') DEFAULT 'pending'"); } catch (e) { }
        // Migration: Vendor assignment driver acceptance tracking
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN driver_accept_required TINYINT DEFAULT 0'); } catch (e) { }

        // Migration: Vendor Support
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN vendor_id INT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN vendor_markup DECIMAL(10,2) DEFAULT 0'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN passenger_name VARCHAR(100) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN passenger_phone VARCHAR(20) DEFAULT NULL'); } catch (e) { }

        // Migration: GPS Tracking & Deviation
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN actual_distance VARCHAR(50) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN is_deviated TINYINT DEFAULT 0'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN original_fare VARCHAR(50) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN return_date DATE DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN start_gps_coords VARCHAR(100) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN end_gps_coords VARCHAR(100) DEFAULT NULL'); } catch (e) { }

        // Migration: Dual Distance Calculation (Static + Dynamic)
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN estimated_distance VARCHAR(50) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN estimated_fare VARCHAR(50) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN estimated_duration VARCHAR(50) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN dynamic_distance VARCHAR(50) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN dynamic_fare VARCHAR(50) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN reached_pickup_time DATETIME NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN end_otp VARCHAR(10) DEFAULT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN rating TINYINT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN rating_comment TEXT NULL'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN air_distance_boost_km DECIMAL(10,2) DEFAULT 0'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_bookings ADD COLUMN pickup_incentive_fare DECIMAL(10,2) DEFAULT 0'); } catch (e) { }

        // GPS Logs Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_ride_gps_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT,
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                accuracy DECIMAL(8, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX (booking_id)
            )
        `);

        // Alter to add speed column to gps logs if not exists
        try { await db.query('ALTER TABLE taxi_ride_gps_logs ADD COLUMN speed DECIMAL(5, 2) DEFAULT 0.00'); } catch (e) { }

        // Recovery: Generate OTPs for legacy rides that don't have one
        try {
            const [missing] = await db.query("SELECT id FROM taxi_bookings WHERE journey_otp IS NULL OR journey_otp = ''");
            for (const ride of missing) {
                const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
                await db.query('UPDATE taxi_bookings SET journey_otp = ? WHERE id = ?', [newOtp, ride.id]);
                console.log(`[RECOVERY] Generated legacy OTP [${newOtp}] for Ride #B${ride.id}`);
            }
        } catch (e) { console.error('Recovery script failed:', e.message); }

        // Recovery: Generate end_otp for legacy rides that don't have one and are not local
        try {
            const [missingEnd] = await db.query("SELECT id FROM taxi_bookings WHERE (end_otp IS NULL OR end_otp = '') AND trip_type != 'local'");
            for (const ride of missingEnd) {
                const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
                await db.query('UPDATE taxi_bookings SET end_otp = ? WHERE id = ?', [newOtp, ride.id]);
                console.log(`[RECOVERY] Generated legacy end OTP [${newOtp}] for Ride #B${ride.id}`);
            }
        } catch (e) { console.error('End OTP recovery script failed:', e.message); }

        // Abort Rejections Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_abort_rejections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT,
                driver_id INT,
                original_reason TEXT,
                admin_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS abort_rejections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT,
                driver_id INT,
                original_reason TEXT,
                admin_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // OTPs Table (For Email Verification)
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(100),
                otp VARCHAR(10),
                expires_at TIMESTAMP
            )
        `);

        // Tariffs
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_tariffs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vehicle_type VARCHAR(50),
                category VARCHAR(50),
                config JSON,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_vendor_tariffs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT,
                vehicle_type VARCHAR(50),
                category VARCHAR(50),
                config JSON,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY vendor_vehicle_cat (vendor_id, vehicle_type, category)
            )
        `);

        // Vendor Wallet Tables
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_vendor_wallets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL UNIQUE,
                balance DECIMAL(12,2) DEFAULT 0.00,
                total_earned DECIMAL(12,2) DEFAULT 0.00,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (vendor_id) REFERENCES taxi_vendors(id) ON DELETE CASCADE
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_vendor_wallet_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vendor_id INT NOT NULL,
                booking_id INT NULL,
                driver_id INT NULL,
                amount DECIMAL(10,2) NOT NULL,
                type ENUM('credit', 'debit') DEFAULT 'credit',
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_vendor_wallet_txn (vendor_id),
                INDEX idx_booking_wallet_txn (booking_id)
            )
        `);
        console.log('✅ Vendor wallet tables ready.');

        await db.query(`
            CREATE TABLE IF NOT EXISTS tariffs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                vehicle_type VARCHAR(50),
                category VARCHAR(50),
                config JSON,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Peak Rules Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_peak_rules (
                id INT AUTO_INCREMENT PRIMARY KEY,
                start_time TIME,
                end_time TIME,
                surcharge_percentage DECIMAL(5,2),
                is_active TINYINT DEFAULT 1
            )
        `);

        // Insert default peak rules if empty
        const [peakRows] = await db.query('SELECT COUNT(*) as cnt FROM taxi_peak_rules');
        if (peakRows[0].cnt === 0) {
            await db.query("INSERT INTO taxi_peak_rules (start_time, end_time, surcharge_percentage) VALUES ('08:00:00', '11:00:00', 25.00)");
            await db.query("INSERT INTO taxi_peak_rules (start_time, end_time, surcharge_percentage) VALUES ('16:00:00', '21:00:00', 25.00)");
            console.log('Default peak rules initialized.');
        }

        // Special Location Charges Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_special_location_charges (
                id INT AUTO_INCREMENT PRIMARY KEY,
                place_type VARCHAR(100) NOT NULL UNIQUE,
                display_name VARCHAR(150) NOT NULL,
                surcharge_percentage DECIMAL(5,2) DEFAULT 0.00,
                is_active TINYINT DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // Seed default special location charges if table is empty
        const [spRows] = await db.query('SELECT COUNT(*) as cnt FROM taxi_special_location_charges');
        if (spRows[0].cnt === 0) {
            const defaultSpecialCharges = [
                ['mall', 'Shopping Mall', 10.00],
                ['cinema', 'Cinema Theatre', 10.00],
                ['beach', 'Beach / Waterfront', 15.00],
                ['resort', 'Resort / Hotel', 15.00],
                ['restaurant', 'Restaurant / Dine-In', 10.00],
                ['railway_station', 'Railway Station', 5.00]
            ];
            for (const [pt, dn, sp] of defaultSpecialCharges) {
                await db.query('INSERT INTO taxi_special_location_charges (place_type, display_name, surcharge_percentage) VALUES (?, ?, ?)', [pt, dn, sp]);
            }
            console.log('✅ Default special location charges initialized.');
        }

        // Chat Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_booking_chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT NOT NULL,
                sender_role VARCHAR(20) NOT NULL,
                sender_name VARCHAR(100),
                message TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_booking (booking_id)
            )
        `);

        // Calls Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_booking_calls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT NOT NULL,
                caller_role VARCHAR(20) NOT NULL,
                caller_name VARCHAR(100),
                status VARCHAR(20) NOT NULL DEFAULT 'ringing',
                started_at DATETIME NOT NULL,
                answered_at DATETIME NULL,
                ended_at DATETIME NULL,
                duration_seconds INT DEFAULT 0,
                INDEX idx_booking_calls (booking_id)
            )
        `);

        // Migration: add special_place_type and association_id to taxi_bookings if missing
        try {
            await db.query('ALTER TABLE taxi_bookings ADD COLUMN special_place_type VARCHAR(50) DEFAULT NULL');
            console.log('✅ Migration: special_place_type column added to taxi_bookings.');
        } catch (e) { /* Already exists */ }
        
        try {
            await db.query('ALTER TABLE taxi_bookings ADD COLUMN association_id INT DEFAULT NULL');
            console.log('✅ Migration: association_id column added to taxi_bookings.');
        } catch (e) { /* Already exists */ }
        
        try {
            await db.query('ALTER TABLE taxi_drivers ADD COLUMN association_id INT DEFAULT NULL');
            console.log('✅ Migration: association_id column added to taxi_drivers.');
        } catch (e) { /* Already exists */ }

        // --- SYSTEM COMMISSION CONFIGS ---
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_commission_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                version INT NOT NULL,
                customer_commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
                driver_commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
                customer_commission_percent DECIMAL(5,2) DEFAULT 0,
                customer_commission_fixed DECIMAL(10,2) DEFAULT 0,
                driver_commission_percent DECIMAL(5,2) DEFAULT 0,
                driver_commission_fixed DECIMAL(10,2) DEFAULT 0,
                total_commission_percent DECIMAL(5,2) DEFAULT 0,
                total_commission_fixed DECIMAL(10,2) DEFAULT 0,
                maintenance_percent DECIMAL(5,2) DEFAULT 0,
                maintenance_fixed DECIMAL(10,2) DEFAULT 0,
                association_percent DECIMAL(5,2) DEFAULT 0,
                association_fixed DECIMAL(10,2) DEFAULT 0,
                cityride_percent DECIMAL(5,2) DEFAULT 0,
                cityride_fixed DECIMAL(10,2) DEFAULT 0,
                effective_from DATETIME DEFAULT CURRENT_TIMESTAMP,
                effective_to DATETIME DEFAULT NULL,
                status VARCHAR(20) DEFAULT 'active',
                created_by INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration: Add new commission type and fixed columns if missing (for older DB instances)
        try { await db.query("ALTER TABLE taxi_commission_configs ADD COLUMN customer_commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage' AFTER version"); } catch (e) { }
        try { await db.query("ALTER TABLE taxi_commission_configs ADD COLUMN driver_commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage' AFTER customer_commission_type"); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_commission_configs ADD COLUMN customer_commission_fixed DECIMAL(10,2) DEFAULT 0 AFTER customer_commission_percent'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_commission_configs ADD COLUMN driver_commission_fixed DECIMAL(10,2) DEFAULT 0 AFTER driver_commission_percent'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_commission_configs ADD COLUMN total_commission_fixed DECIMAL(10,2) DEFAULT 0 AFTER total_commission_percent'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_commission_configs ADD COLUMN maintenance_fixed DECIMAL(10,2) DEFAULT 0 AFTER maintenance_percent'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_commission_configs ADD COLUMN association_fixed DECIMAL(10,2) DEFAULT 0 AFTER association_percent'); } catch (e) { }
        try { await db.query('ALTER TABLE taxi_commission_configs ADD COLUMN cityride_fixed DECIMAL(10,2) DEFAULT 0 AFTER cityride_percent'); } catch (e) { }
        
        const [configCount] = await db.query('SELECT COUNT(*) as cnt FROM taxi_commission_configs');
        if (configCount[0].cnt === 0) {
            await db.query(`
                INSERT INTO taxi_commission_configs 
                (version, customer_commission_type, driver_commission_type, customer_commission_percent, driver_commission_percent, total_commission_percent, maintenance_percent, association_percent, cityride_percent)
                VALUES (1, 'percentage', 'percentage', 10.00, 5.00, 15.00, 2.00, 8.00, 5.00)
            `);
            console.log('✅ Migration: default commission config initialized.');
        }

        // --- ASSOCIATION TABLES ---
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_associations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                city_name VARCHAR(100) NOT NULL,
                admin_username VARCHAR(50) UNIQUE NOT NULL,
                admin_password VARCHAR(255) NOT NULL,
                commission_type ENUM('percentage', 'fixed') DEFAULT 'percentage',
                commission_value DECIMAL(10, 2) DEFAULT 0,
                geofence_radius DECIMAL(10, 2) DEFAULT 50,
                latitude DECIMAL(10,8) DEFAULT NULL,
                longitude DECIMAL(11,8) DEFAULT NULL,
                is_active TINYINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        try { await db.query('ALTER TABLE taxi_associations ADD COLUMN latitude DECIMAL(10,8) DEFAULT NULL'); } catch (e) {}
        try { await db.query('ALTER TABLE taxi_associations ADD COLUMN longitude DECIMAL(11,8) DEFAULT NULL'); } catch (e) {}
        try { await db.query('ALTER TABLE taxi_associations ADD COLUMN commission_customer_pct DECIMAL(10,2) DEFAULT 0'); } catch (e) {}
        try { await db.query('ALTER TABLE taxi_associations ADD COLUMN commission_customer_fixed DECIMAL(10,2) DEFAULT 0'); } catch (e) {}
        try { await db.query('ALTER TABLE taxi_associations ADD COLUMN commission_driver_pct DECIMAL(10,2) DEFAULT 0'); } catch (e) {}
        try { await db.query('ALTER TABLE taxi_associations ADD COLUMN commission_driver_fixed DECIMAL(10,2) DEFAULT 0'); } catch (e) {}

        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_association_wallets (
                association_id INT PRIMARY KEY,
                balance DECIMAL(10,2) DEFAULT 0.00,
                FOREIGN KEY (association_id) REFERENCES taxi_associations(id) ON DELETE CASCADE
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_association_wallet_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                association_id INT,
                booking_id INT NULL,
                driver_id INT NULL,
                type ENUM('credit', 'debit') NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                note VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (association_id) REFERENCES taxi_associations(id) ON DELETE CASCADE
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_association_tariffs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                association_id INT NOT NULL,
                trip_type VARCHAR(20) NOT NULL,
                vehicle_type VARCHAR(20) NOT NULL,
                config JSON,
                UNIQUE KEY unique_assoc_tariff (association_id, trip_type, vehicle_type),
                FOREIGN KEY (association_id) REFERENCES taxi_associations(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Association tables ensured.');

        // Insert default tariffs if empty
        try {
            const [tariffRows] = await db.query('SELECT COUNT(*) as cnt FROM taxi_tariffs');

            const defaultTariffs = [
                {
                    vehicle_type: 'bike',
                    category: 'local',
                    config: JSON.stringify({ base: 0, perKm: 10, minKm: 5 })
                },
                {
                    vehicle_type: 'bike',
                    category: 'oneway',
                    config: JSON.stringify({ base: 0, perKm: 10, minKm: 5, convenience: 0 })
                },
                {
                    vehicle_type: 'auto',
                    category: 'local',
                    config: JSON.stringify({ base: 60, perKm: 12, minKm: 0 })
                },
                {
                    vehicle_type: 'auto',
                    category: 'oneway',
                    config: JSON.stringify({ base: 0, perKm: 9, minKm: 50 })
                },
                {
                    vehicle_type: 'auto',
                    category: 'round',
                    config: JSON.stringify({ base: 0, perKm: 8, minKmPerDay: 100 })
                },
                {
                    vehicle_type: 'auto',
                    category: 'rental',
                    config: JSON.stringify({
                        '2-20': { base: 200, extraKm: 10, extraHour: 80 },
                        '4-40': { base: 380, extraKm: 10, extraHour: 80 },
                        '8-80': { base: 700, extraKm: 9, extraHour: 70 },
                        '12-120': { base: 1000, extraKm: 9, extraHour: 70 }
                    })
                },
                {
                    vehicle_type: 'sedan',
                    category: 'local',
                    config: JSON.stringify({ base: 200, perKm: 25, minKm: 0 })
                },
                {
                    vehicle_type: 'sedan',
                    category: 'oneway',
                    config: JSON.stringify({ base: 0, perKm: 13, minKm: 130 })
                },
                {
                    vehicle_type: 'sedan',
                    category: 'round',
                    config: JSON.stringify({ base: 0, perKm: 12, minKmPerDay: 250 })
                },
                {
                    vehicle_type: 'sedan',
                    category: 'rental',
                    config: JSON.stringify({
                        '2-20': { base: 600, extraKm: 18, extraHour: 150 },
                        '4-40': { base: 1100, extraKm: 18, extraHour: 150 },
                        '8-80': { base: 2100, extraKm: 16, extraHour: 120 },
                        '12-120': { base: 2800, extraKm: 15, extraHour: 120 }
                    })
                },
                {
                    vehicle_type: 'suv',
                    category: 'local',
                    config: JSON.stringify({ base: 300, perKm: 35, minKm: 0 })
                },
                {
                    vehicle_type: 'suv',
                    category: 'oneway',
                    config: JSON.stringify({ base: 0, perKm: 19, minKm: 130 })
                },
                {
                    vehicle_type: 'suv',
                    category: 'round',
                    config: JSON.stringify({ base: 0, perKm: 18, minKmPerDay: 250 })
                },
                {
                    vehicle_type: 'suv',
                    category: 'rental',
                    config: JSON.stringify({
                        '2-20': { base: 900, extraKm: 25, extraHour: 250 },
                        '4-40': { base: 1600, extraKm: 25, extraHour: 250 },
                        '8-80': { base: 3100, extraKm: 22, extraHour: 200 },
                        '12-120': { base: 4200, extraKm: 20, extraHour: 200 }
                    })
                },
                {
                    vehicle_type: 'hatchback',
                    category: 'local',
                    config: JSON.stringify({ base: 150, perKm: 20, minKm: 0 })
                },
                {
                    vehicle_type: 'hatchback',
                    category: 'oneway',
                    config: JSON.stringify({ base: 0, perKm: 11, minKm: 100 })
                },
                {
                    vehicle_type: 'hatchback',
                    category: 'round',
                    config: JSON.stringify({ base: 0, perKm: 10, minKmPerDay: 200 })
                },
                {
                    vehicle_type: 'hatchback',
                    category: 'rental',
                    config: JSON.stringify({
                        '2-20': { base: 450, extraKm: 15, extraHour: 120 },
                        '4-40': { base: 850, extraKm: 15, extraHour: 120 },
                        '8-80': { base: 1600, extraKm: 14, extraHour: 100 },
                        '12-120': { base: 2200, extraKm: 13, extraHour: 100 }
                    })
                },
                {
                    vehicle_type: '8plus1',
                    category: 'local',
                    config: JSON.stringify({ base: 600, perKm: 32, minKm: 0 })
                },
                {
                    vehicle_type: '8plus1',
                    category: 'oneway',
                    config: JSON.stringify({ base: 0, perKm: 22, minKm: 150 })
                },
                {
                    vehicle_type: '8plus1',
                    category: 'round',
                    config: JSON.stringify({ base: 0, perKm: 20, minKmPerDay: 250 })
                },
                {
                    vehicle_type: '8plus1',
                    category: 'rental',
                    config: JSON.stringify({
                        '2-20': { base: 1800, extraKm: 30, extraHour: 300 },
                        '4-40': { base: 3200, extraKm: 30, extraHour: 300 },
                        '8-80': { base: 6000, extraKm: 28, extraHour: 250 },
                        '12-120': { base: 8500, extraKm: 25, extraHour: 250 }
                    })
                },
                {
                    vehicle_type: 'van24',
                    category: 'local',
                    config: JSON.stringify({ base: 1500, perKm: 55, minKm: 0 })
                },
                {
                    vehicle_type: 'van24',
                    category: 'oneway',
                    config: JSON.stringify({ base: 0, perKm: 42, minKm: 200 })
                },
                {
                    vehicle_type: 'van24',
                    category: 'round',
                    config: JSON.stringify({ base: 0, perKm: 38, minKmPerDay: 300 })
                },
                {
                    vehicle_type: 'van24',
                    category: 'rental',
                    config: JSON.stringify({
                        '2-20': { base: 4000, extraKm: 50, extraHour: 500 },
                        '4-40': { base: 7000, extraKm: 50, extraHour: 500 },
                        '8-80': { base: 13000, extraKm: 45, extraHour: 450 },
                        '12-120': { base: 18000, extraKm: 40, extraHour: 400 }
                    })
                }
            ];

            // If table is empty, insert all
            if (tariffRows[0].cnt === 0) {
                for (const t of defaultTariffs) {
                    await db.query('INSERT INTO taxi_tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                }
                console.log('Default tariffs initialized.');
            } else {
                // Check if hatchbacks specifically are missing (Migration)
                const [hatchRows] = await db.query("SELECT COUNT(*) as cnt FROM taxi_tariffs WHERE vehicle_type = 'hatchback'");
                if (hatchRows[0].cnt === 0) {
                    const hatchTariffs = defaultTariffs.filter(t => t.vehicle_type === 'hatchback');
                    for (const t of hatchTariffs) {
                        await db.query('INSERT INTO taxi_tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                    }
                    console.log('✅ Migration: Hatchback tariffs added.');
                }
                // Check if 8plus1 specifically are missing (Migration)
                const [newRows] = await db.query("SELECT COUNT(*) as cnt FROM taxi_tariffs WHERE vehicle_type = '8plus1'");
                if (newRows[0].cnt === 0) {
                    const newTariffs = defaultTariffs.filter(t => t.vehicle_type === '8plus1' || t.vehicle_type === 'van24');
                    for (const t of newTariffs) {
                        await db.query('INSERT INTO taxi_tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                    }
                    console.log('✅ Migration: 8plus1 and van24 tariffs added to taxi_tariffs.');
                }
                // Check if auto specifically are missing (Migration)
                const [autoRows] = await db.query("SELECT COUNT(*) as cnt FROM taxi_tariffs WHERE vehicle_type = 'auto'");
                if (autoRows[0].cnt === 0) {
                    const autoTariffs = defaultTariffs.filter(t => t.vehicle_type === 'auto');
                    for (const t of autoTariffs) {
                        await db.query('INSERT INTO taxi_tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                    }
                    console.log('✅ Migration: auto tariffs added to taxi_tariffs.');
                }
            }

            // Also seed non-prefixed tariffs table if empty
            const [tariffRows2] = await db.query('SELECT COUNT(*) as cnt FROM tariffs');
            if (tariffRows2[0].cnt === 0) {
                for (const t of defaultTariffs) {
                    await db.query('INSERT INTO tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                }
                console.log('Default tariffs (non-prefixed) initialized.');
            } else {
                // Check if hatchbacks specifically are missing (Migration)
                const [hatchRows2] = await db.query("SELECT COUNT(*) as cnt FROM tariffs WHERE vehicle_type = 'hatchback'");
                if (hatchRows2[0].cnt === 0) {
                    const hatchTariffs = defaultTariffs.filter(t => t.vehicle_type === 'hatchback');
                    for (const t of hatchTariffs) {
                        await db.query('INSERT INTO tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                    }
                    console.log('✅ Migration: Hatchback tariffs (non-prefixed) added.');
                }
                // Check if 8plus1 specifically are missing (Migration)
                const [newRows2] = await db.query("SELECT COUNT(*) as cnt FROM tariffs WHERE vehicle_type = '8plus1'");
                if (newRows2[0].cnt === 0) {
                    const newTariffs = defaultTariffs.filter(t => t.vehicle_type === '8plus1' || t.vehicle_type === 'van24');
                    for (const t of newTariffs) {
                        await db.query('INSERT INTO tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                    }
                    console.log('✅ Migration: 8plus1 and van24 tariffs (non-prefixed) added to tariffs.');
                }
                // Check if auto specifically are missing (Migration)
                const [autoRows2] = await db.query("SELECT COUNT(*) as cnt FROM tariffs WHERE vehicle_type = 'auto'");
                if (autoRows2[0].cnt === 0) {
                    const autoTariffs = defaultTariffs.filter(t => t.vehicle_type === 'auto');
                    for (const t of autoTariffs) {
                        await db.query('INSERT INTO tariffs (vehicle_type, category, config) VALUES (?, ?, ?)', [t.vehicle_type, t.category, t.config]);
                    }
                    console.log('✅ Migration: auto tariffs added to tariffs.');
                }
            }
        } catch (e) {
            console.error('Tariff initialization failed:', e.message);
        }

        // 4. Create Indexes for performance (Non-blocking)
        (async () => {
            try { await db.query('CREATE INDEX idx_bookings_user_id ON taxi_bookings(user_id)'); } catch (e) {}
            try { await db.query('CREATE INDEX idx_bookings_driver_id ON taxi_bookings(driver_id)'); } catch (e) {}
            try { await db.query('CREATE INDEX idx_bookings_status ON taxi_bookings(status)'); } catch (e) {}
        })();

        // 5. System Settings Table
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        // Seed default setting: air_distance_restrict = enabled
        await db.query(`
            INSERT IGNORE INTO taxi_settings (setting_key, setting_value)
            VALUES ('air_distance_restrict', '1')
        `);
        console.log('✅ System settings table ensured.');

        // Live Offers Table (Enterprise Upgrade)
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_offers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(50) UNIQUE,
                description TEXT,
                discount_type ENUM('percentage', 'flat') DEFAULT 'percentage',
                discount_value DECIMAL(8,2) DEFAULT 0,
                max_discount DECIMAL(8,2) DEFAULT NULL,
                min_trip_amount DECIMAL(8,2) DEFAULT 0,
                max_uses_per_user INT DEFAULT 1,
                total_uses_allowed INT DEFAULT NULL,
                current_uses INT DEFAULT 0,
                valid_vehicle_types VARCHAR(255) DEFAULT 'ALL',
                valid_until DATETIME DEFAULT NULL,
                is_active TINYINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Migration block for existing table
        try {
            await db.query("ALTER TABLE taxi_offers ADD COLUMN discount_type ENUM('percentage', 'flat') DEFAULT 'percentage'");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN discount_value DECIMAL(8,2) DEFAULT 0");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN max_discount DECIMAL(8,2) DEFAULT NULL");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN min_trip_amount DECIMAL(8,2) DEFAULT 0");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN max_uses_per_user INT DEFAULT 1");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN total_uses_allowed INT DEFAULT NULL");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN current_uses INT DEFAULT 0");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN valid_vehicle_types VARCHAR(255) DEFAULT 'ALL'");
            await db.query("ALTER TABLE taxi_offers ADD COLUMN valid_until DATETIME DEFAULT NULL");
            // Migrate old discount_percent data if it exists
            await db.query("UPDATE taxi_offers SET discount_value = discount_percent WHERE discount_value = 0 AND discount_percent IS NOT NULL");
        } catch (e) {
            // Columns likely already exist, ignore.
        }
        console.log('✅ Taxi Offers table ensured (Enterprise Schema).');

        // Missing Financial and Audit Tables
        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_ride_pricing_snapshots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT UNIQUE,
                distance_km DECIMAL(10,2) DEFAULT 0,
                ride_category VARCHAR(50) DEFAULT NULL,
                vehicle_type VARCHAR(50) DEFAULT NULL,
                tariff_version_id INT DEFAULT NULL,
                commission_version_id INT DEFAULT NULL,
                base_fare DECIMAL(10,2) DEFAULT 0,
                distance_charge DECIMAL(10,2) DEFAULT 0,
                peak_charge DECIMAL(10,2) DEFAULT 0,
                special_location_charge DECIMAL(10,2) DEFAULT 0,
                extra_drops_charge DECIMAL(10,2) DEFAULT 0,
                waiting_charge DECIMAL(10,2) DEFAULT 0,
                vendor_markup DECIMAL(10,2) DEFAULT 0,
                final_fare DECIMAL(10,2) DEFAULT 0,
                customer_commission_pct DECIMAL(5,2) DEFAULT 0,
                driver_commission_pct DECIMAL(5,2) DEFAULT 0,
                maintenance_pct DECIMAL(5,2) DEFAULT 0,
                association_pct DECIMAL(5,2) DEFAULT 0,
                cityride_pct DECIMAL(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_financial_ledger (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id INT,
                transaction_type VARCHAR(50),
                amount DECIMAL(10,2) DEFAULT 0,
                reference_version_id INT DEFAULT NULL,
                status VARCHAR(20) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_booking_transaction (booking_id, transaction_type)
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                driver_id INT,
                type ENUM('credit', 'debit'),
                amount DECIMAL(10,2) DEFAULT 0,
                note TEXT,
                updated_by VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Migration: ensure updated_by column exists
        try { await db.query('ALTER TABLE wallet_transactions ADD COLUMN updated_by VARCHAR(100) DEFAULT NULL'); } catch (e) { }

        await db.query(`
            CREATE TABLE IF NOT EXISTS taxi_audit_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT,
                action VARCHAR(50),
                entity_type VARCHAR(50),
                entity_id VARCHAR(50),
                new_value TEXT,
                remark TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('MySQL schema and default admin ensured.');
    } catch (err) {
        console.error('Database Initialization Failed:', err.message);
        throw err;
    }
}

// Maintenance: Clean up old OTPs every hour
cron.schedule('0 * * * *', async () => {
    if (db) {
        await db.query('DELETE FROM taxi_otps WHERE expires_at < NOW()');
        console.log('--- OTP CLEANUP COMPLETED ---');
    }
});

async function startServer() {
    try {
        const PORT = process.env.PORT || 3000;

        httpServer.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on http://0.0.0.0:${PORT}`);
            console.log(`✅ Socket.IO WebSocket server attached on same port ${PORT}`);
        });

        // Run DB schema migrations in background
        initDB().catch(err => console.error('Database Initialization Warning:', err));

    } catch (err) {
        console.error('CRITICAL ERROR during startup:', err);
        process.exit(1);
    }
}

// --- AUTOMATED DAILY REPORTING ENGINE (RESEND) ---
async function sendDailyReport() {
    console.log('--- GENERATING ADVANCED PERFORMANCE BACKUP ---');
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. Gather Rich Data
        const [bookings] = await db.query(`
            SELECT b.*, 
                   COALESCE(b.passenger_name, u.name, tu.name) as customer_name, 
                   COALESCE(b.passenger_phone, u.phone, tu.phone) as customer_phone, 
                   COALESCE(u.email, tu.email) as customer_email,
                   d.name as driver_name, d.phone as driver_phone, d.car_model, d.car_number
            FROM taxi_bookings b 
            LEFT JOIN passengers u ON b.user_id = u.id 
            LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id 
            WHERE b.created_at >= ?
        `, [todayStart]);

        let dailyRevenue = 0;
        bookings.forEach(b => {
            if (b.status === 'completed') {
                dailyRevenue += parseFloat(b.fare.replace(/[^0-9.]/g, '')) || 0;
            }
        });

        // 2. Generate CSV In-Memory
        console.log('📊 Compiling Extended CSV Dataset...');
        const csvRows = ['ID,Status,Fare,Type,Customer,Cust_Phone,Cust_Email,Pickup,Drop,Car_Type,Driver,Driver_Phone,Car_Model,Plate'];
        bookings.forEach(b => {
            csvRows.push(`${b.id},${b.status},"${b.fare}","${b.trip_type || 'oneway'}","${b.customer_name || 'Walk-in'}","${b.customer_phone || ''}","${b.customer_email || ''}","${b.pickup_loc}","${b.drop_loc}","${b.vehicle_type}","${b.driver_name || 'Unassigned'}","${b.driver_phone || ''}","${b.car_model || ''}","${b.car_number || ''}"`);
        });
        const csvContent = Buffer.from(csvRows.join('\n')).toString('base64');

        // 3. Generate PDF In-Memory
        console.log('📄 Crafting Professional PDF Visualization...');
        const pdfPromise = new Promise((resolve) => {
            const doc = new PDFDocument({ margin: 30, size: 'A4' });
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));

            // --- HEADER SECTION ---
            doc.rect(0, 0, 600, 100).fill('#1a1a1a');

            // Add Logo Image
            try {
                const logoPath = path.join(__dirname, 'public', 'logo.png');
                doc.image(logoPath, 40, 30, { width: 40 });
                doc.fillColor('#ff5252').fontSize(24).text('CITYRIDE', 90, 35, { characterSpacing: 2 });
            } catch (err) {
                doc.fillColor('#ff5252').fontSize(28).text('CITYRIDE', 40, 35, { characterSpacing: 2 });
            }

            doc.fillColor('#ffffff').fontSize(10).text('LOGISTICS INTELLIGENCE UNIT', 40, 75);
            doc.text(`REPORT ID: ${new Date().getTime()}`, 400, 45, { align: 'right' });
            doc.text(`AUDIT DATE: ${new Date().toDateString()}`, 400, 60, { align: 'right' });

            // --- METRICS CARDS ---
            doc.fillColor('#000000');
            const drawCard = (x, y, label, value, color) => {
                doc.rect(x, y, 160, 70).fill('#f8f8f8');
                doc.rect(x, y, 5, 70).fill(color);
                doc.fillColor('#888888').fontSize(8).text(label.toUpperCase(), x + 15, y + 15);
                doc.fillColor('#333333').fontSize(18).text(value, x + 15, y + 35);
            };

            const completed = bookings.filter(b => b.status === 'completed').length;
            drawCard(40, 120, 'Total Missions', bookings.length.toString(), '#444444');
            drawCard(215, 120, 'Completed', completed.toString(), '#28a745');
            drawCard(390, 120, 'Daily Revenue', `Rs. ${dailyRevenue.toFixed(2)}`, '#ff5252');

            // --- MISSION LOG TABLE ---
            doc.fillColor('#000000').fontSize(14).text('MISSION LOG (DAILY SNAPSHOT)', 40, 215);

            // Table Header
            const startY = 240;
            doc.rect(40, startY, 515, 20).fill('#1a1a1a');
            doc.fillColor('#ffffff').fontSize(9);
            doc.text('ID', 50, startY + 6);
            doc.text('TYPE', 80, startY + 6);
            doc.text('STATUS', 140, startY + 6);
            doc.text('CUSTOMER', 210, startY + 6);
            doc.text('ROUTE', 320, startY + 6);
            doc.text('FARE', 490, startY + 6);

            // Table Rows
            let rowY = startY + 20;
            doc.fillColor('#333333');
            bookings.slice(0, 20).forEach((b, i) => {
                if (i % 2 === 0) doc.rect(40, rowY, 515, 25).fill('#fafafa');
                doc.fillColor('#444444').fontSize(8);
                doc.text(b.id.toString(), 50, rowY + 8);
                doc.text((b.trip_type || 'oneway').toUpperCase(), 80, rowY + 8);

                const statusColor = b.status === 'completed' ? '#28a745' : (b.status === 'pending' ? '#ffc107' : '#dc3545');
                doc.fillColor(statusColor).text(b.status.toUpperCase(), 140, rowY + 8);

                doc.fillColor('#444444').text(b.customer_name || 'Walk-in', 210, rowY + 8);
                const route = `${b.pickup_loc.substring(0, 15)} -> ${b.drop_loc.substring(0, 15)}`;
                doc.text(route, 320, rowY + 8);
                doc.text(b.fare, 490, rowY + 8);
                rowY += 25;
            });

            // --- FOOTER ---
            doc.fontSize(8).fillColor('#aaaaaa').text('CONFIDENTIAL SYSTEM GENERATED DOCUMENT • CITYRIDE TAXI ADMINISTRATION', 40, 780, { align: 'center' });

            doc.end();
        });
        const pdfContent = await pdfPromise;

        // 4. Dispatch via HTTP
        const subject = `[SYSTEM BACKUP] CityRide Logistics - ${new Date().toLocaleDateString()}`;
        const html = `
            <div style="font-family: sans-serif; padding: 25px; border: 1px solid #eee; border-radius: 12px;">
                <h1 style="margin:0; color:#ff5252;">Daily Audit Complete</h1>
                <p>Hello Admin, your Daily Intelligence Backup and Logistics Spreadsheet are attached below.</p>
                <div style="background: #f8f8f8; padding: 15px; border-left: 5px solid #ff5252; margin: 20px 0;">
                    <strong>Revenue:</strong> Rs. ${dailyRevenue.toFixed(2)}<br>
                    <strong>Missions Logged:</strong> ${bookings.length}
                </div>
            </div>
        `;

        const attachments = [
            { content: csvContent, name: `Logistics_${new Date().getTime()}.csv` },
            { content: pdfContent, name: `Audit_Report_${new Date().getTime()}.pdf` }
        ];

        await sendBrevoMail(process.env.REPORT_RECEIVER_EMAIL, subject, html, attachments);
        console.log('✅ Advanced Integrity Backup Delivered Successfully.');
    } catch (err) {
        console.error('❌ Advanced Backup Failure:', err.message);
    }
}

// Daily report cron job at 11:59 PM
cron.schedule('59 23 * * *', () => {
    sendDailyReport();
});

// --- PEAK RULES API ---
app.get('/api/peak-rules', async (req, res) => {
    try {
        const [rules] = await db.query('SELECT * FROM taxi_peak_rules WHERE is_active = 1');
        res.json(rules);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch peak rules' });
    }
});

// --- GET CHAT HISTORY ---
app.get('/api/bookings/:id/chat', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_booking_chats WHERE booking_id = ? ORDER BY created_at ASC', [req.params.id]);
        res.json({ success: true, messages: rows });
    } catch (err) {
        console.error('Error fetching chat history:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch chat history' });
    }
});

// --- GET CALL HISTORY ---
app.get('/api/bookings/:id/calls', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_booking_calls WHERE booking_id = ? ORDER BY started_at DESC', [req.params.id]);
        res.json({ success: true, calls: rows });
    } catch (err) {
        console.error('Error fetching call history:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch call history' });
    }
});

app.post('/api/admin/peak-rules/add', async (req, res) => {
    try {
        const { start_time, end_time, surcharge_percentage } = req.body;
        await db.query('INSERT INTO taxi_peak_rules (start_time, end_time, surcharge_percentage) VALUES (?, ?, ?)', [start_time, end_time, surcharge_percentage]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add peak rule' });
    }
});

app.post('/api/admin/peak-rules/delete', async (req, res) => {
    try {
        const { id } = req.body;
        await db.query('DELETE FROM taxi_peak_rules WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete peak rule' });
    }
});


// --- AUTHENTICATION ROUTES ---
// 1. Send OTP (Email Verification Request)
app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        logAuthEvent({ event: 'OTP_SENT', role: 'user', identifier: 'unknown', status: 'ERROR', ip: req.ip, message: 'OTP request failed: Email missing' });
        return res.status(400).json({ error: 'Email is required.' });
    }

    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await db.query('DELETE FROM taxi_otps WHERE email = ?', [email]);
        await db.query('INSERT INTO taxi_otps (email, otp, expires_at) VALUES (?, ?, ?)', [email, otp, expiresAt]);

        const subject = 'CityRide platform verification code';
        const html = '<div style="font-family: Arial, sans-serif; padding: 25px; border: 4px solid #1a1a1a; border-radius: 15px; max-width: 500px; text-align: center;">\n' +
            '  <h2 style="color: #ff5252;">Identity <span style="color: #1a1a1a;">Verification</span></h2>\n' +
            '  <p style="color: #555;">Use the following code to authorize your action:</p>\n' +
            '  <div style="background: #f8f8f8; padding: 20px; font-size: 38px; font-weight: bold; letter-spacing: 12px; color: #000; border-radius: 8px;">\n' +
            '      ' + escapeHTML(otp) + '\n' +
            '  </div>\n' +
            '  <p style="color: #888; font-size: 10px; margin-top: 20px;">Requested at: ' + escapeHTML(new Date().toLocaleTimeString()) + '</p>\n' +
            '</div>';

        console.log(`[BREVO API] Dispatching OTP for: ${email}`);
        await sendBrevoMail(email, subject, html);
        logAuthEvent({ event: 'OTP_SENT', role: 'user', identifier: email, status: 'OK', ip: req.ip, message: 'OTP sent successfully via API' });
        res.json({ success: true, message: 'OTP sent successfully via API.' });
    } catch (err) {
        console.error('--- BREVO API FAIL ---', err.message);
        logAuthEvent({ event: 'OTP_SENT', role: 'user', identifier: email, status: 'ERROR', ip: req.ip, message: 'Mail delivery failure', reason: err.message });
        res.status(500).json({ error: 'Mail delivery failure (API Gateway)' });
    }
});

// 2. Passenger Registry (With OTP Validation)
app.post('/api/auth/register', authRateLimiter, async (req, res) => {
    let { name, email, password, phone } = req.body;
    try {
        name = cleanString(name);
        email = cleanString(email);
        phone = cleanString(phone);

        if (!name || !email || !password || !phone) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'user', identifier: email || phone || 'unknown', status: 'ERROR', ip: req.ip, message: 'Registry failed: Missing fields', reason: 'missing_fields' });
            return res.status(400).json({ error: 'All fields are required.' });
        }
        if (name.length < 2 || name.length > 100) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'user', identifier: email, status: 'ERROR', ip: req.ip, message: 'Registry failed: Invalid name length', reason: 'invalid_name' });
            return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' });
        }
        if (!validateEmail(email)) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'user', identifier: email, status: 'ERROR', ip: req.ip, message: 'Registry failed: Invalid email format', reason: 'invalid_email' });
            return res.status(400).json({ error: 'Invalid email address format.' });
        }
        if (!validatePhone(phone)) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'user', identifier: phone, status: 'ERROR', ip: req.ip, message: 'Registry failed: Invalid phone format', reason: 'invalid_phone' });
            return res.status(400).json({ error: 'Invalid phone number format.' });
        }
        if (password.length < 6) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'user', identifier: email, status: 'ERROR', ip: req.ip, message: 'Registry failed: Password too short', reason: 'password_too_short' });
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        // Check for Existing Member
        const [existing] = await db.query('SELECT id FROM passengers WHERE phone = ? OR email = ?', [phone, email]);
        if (existing.length > 0) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'user', identifier: email, status: 'ERROR', ip: req.ip, message: 'Registry failed: Identity already registered', reason: 'identity_exists' });
            return res.status(400).json({ error: 'Identity already registered in the mainframe.' });
        }

        // Register Member
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const sql = 'INSERT INTO passengers (name, email, password, phone) VALUES (?, ?, ?, ?)';
        const [result] = await db.query(sql, [name, email, hashedPassword, phone]);

        const user = {
            id: result.insertId,
            name,
            email,
            phone,
            role: 'user'
        };
        await setAuthCookie(res, req, user, 'user');
        logAuthEvent({ event: 'REGISTER_SUCCESS', role: 'user', identifier: email, status: 'OK', ip: req.ip, message: `Passenger registered: ${name}` });
        res.json({ success: true, user });
    } catch (err) {
        logAuthEvent({ event: 'REGISTER_FAIL', role: 'user', identifier: email || 'unknown', status: 'ERROR', ip: req.ip, message: 'Registry Failure', reason: err.message });
        res.status(500).json({ error: 'Registry Failure' });
    }
});

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    const { phone, email, password } = req.body;
    const identifier = cleanString(phone || email);
    try {
        if (!identifier || !password) {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'user', identifier: identifier || 'unknown', status: 'ERROR', ip: req.ip, message: 'Login failed: Missing credentials', reason: 'missing_fields' });
            return res.status(400).json({ error: 'Identifier (phone/email) and password are required.' });
        }

        // Check against both phone and email
        const [users] = await db.query(
            'SELECT id, name, email, phone, password, is_blocked FROM passengers WHERE phone = ? OR email = ?',
            [identifier, identifier]
        );

        if (users.length > 0) {
            const user = users[0];
            if (user.is_blocked) {
                logAuthEvent({ event: 'LOGIN_FAIL', role: 'user', identifier, status: 'ERROR', ip: req.ip, message: 'Login blocked: Account suspended', reason: 'user_blocked' });
                return res.status(403).json({ error: 'Mainframe: Your access has been permanently revoked by Command.' });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                delete user.password;
                user.role = 'user';
                await setAuthCookie(res, req, user, 'user');
                logAuthEvent({ event: 'LOGIN_SUCCESS', role: 'user', identifier, status: 'OK', ip: req.ip, message: `Logged in: ${user.name}` });
                return res.json({ success: true, user });
            } else {
                logAuthEvent({ event: 'LOGIN_FAIL', role: 'user', identifier, status: 'ERROR', ip: req.ip, message: 'Login failed: Incorrect password', reason: 'wrong_password' });
            }
        } else {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'user', identifier, status: 'ERROR', ip: req.ip, message: 'Login failed: Account not found', reason: 'user_not_found' });
        }
        res.status(401).json({ error: 'Invalid phone number/email or password.' });
    } catch (err) {
        logAuthEvent({ event: 'LOGIN_FAIL', role: 'user', identifier: identifier || 'unknown', status: 'ERROR', ip: req.ip, message: 'Auth Failure', reason: err.message });
        res.status(500).json({ error: 'Auth Failure' });
    }
});

// Update Passenger Profile (name + email)
app.put('/api/user/update-profile', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, email } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name cannot be empty.' });
        }
        const cleanName = cleanString(name);
        const cleanEmail = email ? cleanString(email) : null;
        if (cleanEmail && !validateEmail(cleanEmail)) {
            return res.status(400).json({ error: 'Invalid email address format.' });
        }
        // Check email uniqueness if changed
        if (cleanEmail) {
            const [existing] = await db.query('SELECT id FROM passengers WHERE email = ? AND id != ?', [cleanEmail, userId]);
            if (existing.length > 0) {
                return res.status(400).json({ error: 'Email already in use by another account.' });
            }
        }
        await db.query('UPDATE passengers SET name = ?, email = ? WHERE id = ?', [cleanName, cleanEmail, userId]);
        const [rows] = await db.query('SELECT id, name, email, phone FROM passengers WHERE id = ?', [userId]);
        const updatedUser = rows[0];
        // Refresh auth cookie with new name
        await setAuthCookie(res, req, { ...updatedUser, role: 'user' }, 'user');
        res.json({ success: true, user: updatedUser });
    } catch (err) {
        res.status(500).json({ error: 'Profile update failed: ' + err.message });
    }
});

// Admin Command Login
app.post('/api/admin/login', authRateLimiter, async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = cleanString(email);
    try {
        if (!cleanEmail || !password) {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'admin', identifier: cleanEmail || 'unknown', status: 'ERROR', ip: req.ip, message: 'Admin login failed: Missing credentials', reason: 'missing_fields' });
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const [taxi_admins] = await db.query('SELECT id, name, email, password FROM taxi_admins WHERE email = ?', [cleanEmail]);

        if (taxi_admins.length > 0) {
            const user = taxi_admins[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                delete user.password;
                user.role = 'admin';
                await setAuthCookie(res, req, user, 'admin');
                logAuthEvent({ event: 'LOGIN_SUCCESS', role: 'admin', identifier: cleanEmail, status: 'OK', ip: req.ip, message: `Admin logged in: ${user.name}` });
                return res.json({ success: true, user });
            } else {
                logAuthEvent({ event: 'LOGIN_FAIL', role: 'admin', identifier: cleanEmail, status: 'ERROR', ip: req.ip, message: 'Admin login failed: Incorrect password', reason: 'wrong_password' });
            }
        } else {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'admin', identifier: cleanEmail, status: 'ERROR', ip: req.ip, message: 'Admin login failed: Account not found', reason: 'admin_not_found' });
        }
        res.status(401).json({ error: 'Mainframe Access Denied.' });
    } catch (err) {
        logAuthEvent({ event: 'LOGIN_FAIL', role: 'admin', identifier: cleanEmail || 'unknown', status: 'ERROR', ip: req.ip, message: 'Executive Auth Failure', reason: err.message });
        res.status(500).json({ error: 'Executive Auth Failure' });
    }
});

// Partner Pilot Login
app.post('/api/driver/login', authRateLimiter, async (req, res) => {
    const { phone, password } = req.body;
    const cleanPhone = cleanString(phone);
    try {
        if (!cleanPhone || !password) {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'driver', identifier: cleanPhone || 'unknown', status: 'ERROR', ip: req.ip, message: 'Pilot login failed: Missing credentials', reason: 'missing_fields' });
            return res.status(400).json({ error: 'Phone and password are required.' });
        }

        const [drivers] = await db.query('SELECT id, name, email, phone, car_model, car_number, vehicle_type, wallet_balance, password, is_blocked FROM taxi_drivers WHERE phone = ?', [cleanPhone]);

        if (drivers.length > 0) {
            const user = drivers[0];
            if (user.is_blocked) {
                logAuthEvent({ event: 'LOGIN_FAIL', role: 'driver', identifier: cleanPhone, status: 'ERROR', ip: req.ip, message: 'Pilot login blocked: Account suspended', reason: 'driver_blocked' });
                return res.status(403).json({ error: 'Flight Status: Denied. Your authorization key has been revoked by Ground Control.' });
            }
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                delete user.password;
                user.role = 'driver';
                await setAuthCookie(res, req, user, 'driver');
                logAuthEvent({ event: 'LOGIN_SUCCESS', role: 'driver', identifier: cleanPhone, status: 'OK', ip: req.ip, message: `Pilot logged in: ${user.name}` });
                return res.json({ success: true, user });
            } else {
                logAuthEvent({ event: 'LOGIN_FAIL', role: 'driver', identifier: cleanPhone, status: 'ERROR', ip: req.ip, message: 'Pilot login failed: Incorrect password', reason: 'wrong_password' });
            }
        } else {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'driver', identifier: cleanPhone, status: 'ERROR', ip: req.ip, message: 'Pilot login failed: Account not found', reason: 'driver_not_found' });
        }
        res.status(401).json({ error: 'Pilot Authorization Denied. Invalid phone number or password.' });
    } catch (err) {
        logAuthEvent({ event: 'LOGIN_FAIL', role: 'driver', identifier: cleanPhone || 'unknown', status: 'ERROR', ip: req.ip, message: 'Pilot Auth Failure', reason: err.message });
        res.status(500).json({ error: 'Pilot Auth Failure' });
    }
});

// --- SESSION RESTORE ENDPOINT ---
// Called by client pages when localStorage is empty. Validates the httpOnly
// JWT cookie and returns user identity so the client can re-hydrate localStorage
// without forcing the user to log in again.
app.get('/api/auth/session', async (req, res) => {
    const allCookies = req.cookies || {};
    const requestedRole = req.query.role; // Optional: client can specify which role to restore

    let token = null;
    if (requestedRole) {
        const cookieName = getRoleCookieName(requestedRole);
        switch (cookieName) {
            case 'cr_admin_tok': token = allCookies.cr_admin_tok; break;
            case 'cr_driver_tok': token = allCookies.cr_driver_tok; break;
            case 'cr_user_tok': token = allCookies.cr_user_tok; break;
            case 'cr_vendor_tok': token = allCookies.cr_vendor_tok; break;
            default: token = null; break;
        }
    }
    if (!token) {
        // Try all role cookies in order
        token = allCookies.cr_admin_tok || allCookies.cr_driver_tok ||
            allCookies.cr_user_tok || allCookies.cr_vendor_tok ||
            allCookies.cityride_token;
    }
    if (!token) {
        return res.status(401).json({ valid: false });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const role = decoded.role;
        let userData = null;

        if (role === 'admin') {
            const [rows] = await db.query('SELECT id, name, email FROM taxi_admins WHERE id = ?', [decoded.id]);
            if (rows.length > 0) userData = { ...rows[0], role: 'admin' };
        } else if (role === 'driver') {
            const [rows] = await db.query('SELECT id, name, phone, email, car_model, car_number, vehicle_type, wallet_balance FROM taxi_drivers WHERE id = ?', [decoded.id]);
            if (rows.length > 0) userData = { ...rows[0], role: 'driver' };
        } else if (role === 'vendor') {
            const [rows] = await db.query('SELECT id, name, email, phone, business_name FROM taxi_vendors WHERE id = ?', [decoded.id]);
            if (rows.length > 0) userData = { ...rows[0], role: 'vendor' };
        } else if (role === 'user') {
            const [rows] = await db.query('SELECT id, name, phone, email FROM passengers WHERE id = ?', [decoded.id]);
            if (rows.length > 0) userData = { ...rows[0], role: 'user' };
        }

        if (!userData) {
            return res.status(401).json({ valid: false });
        }

        return res.json({ valid: true, user: userData, role });
    } catch (err) {
        return res.status(401).json({ valid: false });
    }
});

app.post('/api/auth/logout', (req, res) => {
    const roleToLogout = req.query.role || req.body?.role;
    let identifier = 'session';
    let role = roleToLogout || 'user';
    const allCookies = req.cookies || {};

    const targetCookie = roleToLogout ? getRoleCookieName(roleToLogout) : null;
    const tokenToVerify = targetCookie ? allCookies[targetCookie] : (allCookies.cr_admin_tok || allCookies.cr_driver_tok || allCookies.cr_user_tok || allCookies.cr_vendor_tok || allCookies.cityride_token);

    if (tokenToVerify) {
        try {
            const decoded = jwt.verify(tokenToVerify, JWT_SECRET);
            if (decoded) {
                identifier = decoded.email || decoded.phone || decoded.name || 'session';
                role = decoded.role || role;
            }
        } catch (e) { }
    }
    logAuthEvent({ event: 'LOGOUT', role, identifier, status: 'OK', ip: req.ip, message: `Logged out role: ${role}` });

    if (roleToLogout) {
        res.clearCookie(getRoleCookieName(roleToLogout));
    } else {
        // Legacy fallback if no role is provided
        res.clearCookie('cityride_token');
        res.clearCookie('cr_user_tok');
    }
    res.json({ success: true, message: 'Logged out successfully' });
});

// --- DRIVER REGISTRATION OTP FLOW ---
app.post('/api/driver/register/send-otp', async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            logAuthEvent({ event: 'OTP_SENT', role: 'driver', identifier: 'unknown', status: 'ERROR', ip: req.ip, message: 'OTP failed: Email missing' });
            return res.status(400).json({ error: 'Email is required for verification.' });
        }

        // Check if email already in use
        const [existing] = await db.query('SELECT id FROM taxi_drivers WHERE email = ?', [email]);
        const [existingApp] = await db.query('SELECT id FROM taxi_driver_applications WHERE email = ?', [email]);
        if (existing.length > 0 || existingApp.length > 0) {
            logAuthEvent({ event: 'OTP_SENT', role: 'driver', identifier: email, status: 'ERROR', ip: req.ip, message: 'OTP failed: Email already registered or pending application', reason: 'email_taken' });
            return res.status(400).json({ error: 'This email is already registered or has a pending application.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        registrationOtps.set(email, { otp, expiry: Date.now() + 10 * 60 * 1000 }); // 10 min expiry

        const subject = 'CityRide Pilot Identity Verification';
        const html = '            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">\n' +
            '                <h2 style="color: #B71C1C;">Pilot Recruitment Hub</h2>\n' +
            '                <p>Greetings, Pilot. You are attempting to register with the CityRide Network.</p>\n' +
            '                <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">\n' +
            '                    <span style="font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333;">' + escapeHTML(otp) + '</span>\n' +
            '                </div>\n' +
            '                <p>Enter this verification token in your registration portal to continue. This code is valid for 10 minutes.</p>\n' +
            '                <p style="font-size: 0.8rem; color: #888;">If you did not request this, please ignore this email.</p>\n' +
            '            </div>\n';

        await sendBrevoMail(email, subject, html);
        logAuthEvent({ event: 'OTP_SENT', role: 'driver', identifier: email, status: 'OK', ip: req.ip, message: 'Pilot recruitment OTP sent' });
        res.json({ success: true, message: 'Verification token dispatched to your inbox.' });
    } catch (err) {
        console.error('OTP Dispatch Error:', err.message);
        logAuthEvent({ event: 'OTP_SENT', role: 'driver', identifier: email || 'unknown', status: 'ERROR', ip: req.ip, message: 'OTP dispatch failure', reason: err.message });
        res.status(500).json({ error: 'Neural Link failed (Email System Offline).' });
    }
});

app.post('/api/driver/register/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        logAuthEvent({ event: 'OTP_VERIFY', role: 'driver', identifier: email || 'unknown', status: 'ERROR', ip: req.ip, message: 'OTP verification failed: Missing inputs', reason: 'missing_fields' });
        return res.status(400).json({ error: 'Email and token are required.' });
    }

    const stored = registrationOtps.get(email);
    if (!stored) {
        logAuthEvent({ event: 'OTP_VERIFY', role: 'driver', identifier: email, status: 'ERROR', ip: req.ip, message: 'OTP verification failed: Verification session not found', reason: 'no_otp_session' });
        return res.status(400).json({ error: 'No verification request found for this email.' });
    }

    if (Date.now() > stored.expiry) {
        registrationOtps.delete(email);
        logAuthEvent({ event: 'OTP_VERIFY', role: 'driver', identifier: email, status: 'ERROR', ip: req.ip, message: 'OTP verification failed: Token expired', reason: 'expired' });
        return res.status(400).json({ error: 'Verification token expired. Please request a new one.' });
    }

    if (stored.otp !== otp) {
        logAuthEvent({ event: 'OTP_VERIFY', role: 'driver', identifier: email, status: 'ERROR', ip: req.ip, message: 'OTP verification failed: Invalid token', reason: 'wrong_otp' });
        return res.status(400).json({ error: 'Invalid verification token.' });
    }

    // Mark as verified
    stored.verified = true;
    logAuthEvent({ event: 'OTP_VERIFY', role: 'driver', identifier: email, status: 'OK', ip: req.ip, message: 'Pilot identity verified' });
    res.json({ success: true, message: 'Identity verified. You may now continue your application.' });
});

// --- DRIVER REGISTRATION (MULTI-STEP WITH DOCS) ---
app.post('/api/driver/register', authRateLimiter, upload.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'dl_front', maxCount: 1 },
    { name: 'dl_back', maxCount: 1 },
    { name: 'pvc', maxCount: 1 },
    { name: 'aadhar_front', maxCount: 1 },
    { name: 'aadhar_back', maxCount: 1 },
    { name: 'rc_book', maxCount: 1 },
    { name: 'insurance', maxCount: 1 },
    { name: 'pollution', maxCount: 1 },
    { name: 'permit', maxCount: 1 },
    { name: 'payment_qr', maxCount: 1 },
    { name: 'association_id_card', maxCount: 1 }
]), async (req, res) => {
    let { name, email, password, phone, car_model, car_number, vehicle_type, seating_capacity, pref_loc_1, pref_loc_2, pref_loc_3, ride_local, ride_oneway, ride_round, district, association_id, dl_expiry, pvc_expiry, insurance_expiry, pollution_expiry, permit_expiry } = req.body;
    try {
        name = cleanString(name);
        email = cleanString(email);
        phone = cleanString(phone);
        car_model = cleanString(car_model);
        car_number = cleanString(car_number);
        vehicle_type = cleanString(vehicle_type);
        seating_capacity = parseInt(seating_capacity) || 5;
        pref_loc_1 = cleanString(pref_loc_1 || '');
        pref_loc_2 = cleanString(pref_loc_2 || '');
        pref_loc_3 = cleanString(pref_loc_3 || '');
        ride_local = ride_local ? 1 : 0;
        ride_oneway = ride_oneway ? 1 : 0;
        ride_round = ride_round ? 1 : 0;
        district = cleanString(district || '');

        let parsedAssocId = association_id ? parseInt(association_id) : null;
        let assocName = 'CityRide Driver (Independent)';

        if (parsedAssocId && parsedAssocId > 0) {
            const [assocRows] = await db.query('SELECT name FROM taxi_associations WHERE id = ?', [parsedAssocId]);
            if (assocRows.length > 0) {
                assocName = assocRows[0].name;
            } else {
                parsedAssocId = null;
            }
        } else {
            parsedAssocId = null;
        }

        // Validation
        if (!name || !email || !password || !phone) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'driver', identifier: email || phone || 'unknown', status: 'ERROR', ip: req.ip, message: 'Pilot registration failed: Missing fields', reason: 'missing_fields' });
            return res.status(400).json({ error: 'Core identity details are required.' });
        }

        // Check availability
        const [existingEmail] = await db.query('SELECT id FROM taxi_driver_applications WHERE email = ?', [email]);
        const [existingDriverEmail] = await db.query('SELECT id FROM taxi_drivers WHERE email = ?', [email]);
        const [existingPhone] = await db.query('SELECT id FROM taxi_driver_applications WHERE phone = ?', [phone]);
        const [existingDriverPhone] = await db.query('SELECT id FROM taxi_drivers WHERE phone = ?', [phone]);

        if (existingEmail.length > 0 || existingDriverEmail.length > 0) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'driver', identifier: email, status: 'ERROR', ip: req.ip, message: 'Pilot registration failed: Email already registered', reason: 'email_taken' });
            return res.status(400).json({ error: 'This email is already registered or has a pending application.' });
        }
        if (existingPhone.length > 0 || existingDriverPhone.length > 0) {
            logAuthEvent({ event: 'REGISTER_FAIL', role: 'driver', identifier: phone, status: 'ERROR', ip: req.ip, message: 'Pilot registration failed: Phone number already registered', reason: 'phone_taken' });
            return res.status(400).json({ error: 'This phone number is already registered or has a pending application.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Optimize and convert all uploaded images to low-size Base64 strings
        const profile_photo = await optimizeAndGetBase64(req.files?.['profile_photo']);
        const dl_front = await optimizeAndGetBase64(req.files?.['dl_front']);
        const dl_back = await optimizeAndGetBase64(req.files?.['dl_back']);
        const pvc = await optimizeAndGetBase64(req.files?.['pvc']);
        const aadhar_front = await optimizeAndGetBase64(req.files?.['aadhar_front']);
        const aadhar_back = await optimizeAndGetBase64(req.files?.['aadhar_back']);
        const rc_book = await optimizeAndGetBase64(req.files?.['rc_book']);
        const insurance = await optimizeAndGetBase64(req.files?.['insurance']);
        const pollution = await optimizeAndGetBase64(req.files?.['pollution']);
        const permit = await optimizeAndGetBase64(req.files?.['permit']);
        const payment_qr = await optimizeAndGetBase64(req.files?.['payment_qr']);
        const association_id_card = await optimizeAndGetBase64(req.files?.['association_id_card']);

        const sql = `
            INSERT INTO taxi_driver_applications 
            (name, profile_photo, email, password, phone, car_model, car_number, vehicle_type, seating_capacity,
             dl_front, dl_back, pvc, aadhar_front, aadhar_back, 
             rc_book, insurance, pollution, permit, payment_qr,
             pref_loc_1, pref_loc_2, pref_loc_3, ride_local, ride_oneway, ride_round,
             district, association_id, association_name, association_id_card,
             dl_expiry, pvc_expiry, insurance_expiry, pollution_expiry, permit_expiry) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            name, profile_photo, email, hashedPassword, phone, car_model, car_number, vehicle_type, seating_capacity,
            dl_front, dl_back, pvc, aadhar_front, aadhar_back,
            rc_book, insurance, pollution, permit, payment_qr,
            pref_loc_1, pref_loc_2, pref_loc_3, ride_local, ride_oneway, ride_round,
            district, parsedAssocId, assocName, association_id_card,
            dl_expiry || null, pvc_expiry || null, insurance_expiry || null, pollution_expiry || null, permit_expiry || null
        ];

        await db.query(sql, values);
        logAuthEvent({ event: 'REGISTER_SUCCESS', role: 'driver', identifier: email, status: 'OK', ip: req.ip, message: `Pilot application submitted: ${name}` });
        res.json({ success: true, message: 'Application submitted! Ground Control will review your credentials shortly.' });
    } catch (err) {
        console.error('Driver Registration Error:', err.message);
        logAuthEvent({ event: 'REGISTER_FAIL', role: 'driver', identifier: email || 'unknown', status: 'ERROR', ip: req.ip, message: 'Failed to process application', reason: err.message });
        res.status(500).json({ error: 'Failed to process application.' });
    }
});

// --- ADMIN ROUTE PROTECTION MIDDLEWARE ---
app.use('/api/admin/', (req, res, next) => {
    if (req.path === '/login') return next();
    return authenticateJWT(req, res, () => {
        return requireRole(['admin'])(req, res, next);
    });
});

// --- ADMIN: MANAGE DRIVER APPLICATIONS ---
app.get('/api/admin/driver-applications', async (req, res) => {
    try {
        const { status } = req.query;
        let sql = 'SELECT * FROM taxi_driver_applications';
        let params = [];

        if (status) {
            sql += ' WHERE status = ?';
            params.push(status);
        } else {
            // Default to pending for the main queue
            sql += " WHERE status = 'pending'";
        }

        sql += ' ORDER BY created_at DESC';

        const [apps] = await db.query(sql, params);
        apps.forEach(app => delete app.password);
        res.json({ success: true, applications: apps });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch applications.' });
    }
});

// --- UNDERGROUND DRILLDOWN AUDIT REPORT ENDPOINT ---
app.get('/api/admin/underground-reports', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const { association_id, driver_id, vehicle_type, vehicle_search, user_id, status, start_date, end_date } = req.query;

        let whereClauses = ['1=1'];
        let params = [];

        if (association_id && association_id !== 'all') {
            whereClauses.push('b.association_id = ?');
            params.push(association_id);
        }

        if (driver_id && driver_id !== 'all') {
            whereClauses.push('b.driver_id = ?');
            params.push(driver_id);
        }

        if (vehicle_type && vehicle_type !== 'all') {
            whereClauses.push('(b.vehicle_type = ? OR d.vehicle_type = ?)');
            params.push(vehicle_type, vehicle_type);
        }

        if (vehicle_search && vehicle_search.trim() !== '') {
            const vSearch = `%${vehicle_search.trim()}%`;
            whereClauses.push('(b.vehicle_type LIKE ? OR d.car_model LIKE ? OR d.car_number LIKE ?)');
            params.push(vSearch, vSearch, vSearch);
        }

        if (user_id && user_id.trim() !== '') {
            const uSearch = `%${user_id.trim()}%`;
            whereClauses.push('(CAST(b.user_id AS CHAR) LIKE ? OR b.passenger_name LIKE ? OR b.passenger_phone LIKE ?)');
            params.push(uSearch, uSearch, uSearch);
        }

        if (status && status !== 'all') {
            if (status === 'completed') {
                whereClauses.push("b.status IN ('completed', 'finished')");
            } else if (status === 'cancelled') {
                whereClauses.push("b.status IN ('cancelled', 'cancel_requested')");
            } else {
                whereClauses.push("b.status = ?");
                params.push(status);
            }
        }

        if (start_date) {
            whereClauses.push('b.created_at >= ?');
            params.push(`${start_date} 00:00:00`);
        }

        if (end_date) {
            whereClauses.push('b.created_at <= ?');
            params.push(`${end_date} 23:59:59`);
        }

        const whereSql = whereClauses.join(' AND ');

        // Detailed Underground Telemetry Rows (Limit 300 for high performance)
        const [rideRows] = await db.query(`
            SELECT 
                b.id, b.user_id, b.driver_id, COALESCE(b.association_id, d.association_id) as association_id,
                b.pickup_loc, b.drop_loc, b.pickup_date, b.pickup_time,
                b.vehicle_type, b.trip_type, b.fare, b.status, b.created_at,
                COALESCE(NULLIF(b.passenger_name, ''), p.name, 'Customer') as passenger_name,
                COALESCE(NULLIF(b.passenger_phone, ''), p.phone, 'N/A') as passenger_phone,
                b.actual_distance, b.distance,
                b.cancel_reason, b.journey_start_time, b.journey_end_time,
                d.name as driver_name, d.phone as driver_phone, d.car_model, d.car_number, d.profile_photo as driver_photo,
                COALESCE(a.name, d.association_name, 'Independent') as association_name,
                COALESCE(a.city_name, d.district, 'CityRide Network') as association_city
            FROM taxi_bookings b
            LEFT JOIN passengers p ON b.user_id = p.id
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id
            LEFT JOIN taxi_associations a ON COALESCE(b.association_id, d.association_id) = a.id
            WHERE ${whereSql}
            ORDER BY b.created_at DESC
            LIMIT 300
        `, params);

        // Calculate Stats dynamically across rows handling string fare formats (e.g. "\u20B9263")
        let total_rides = rideRows.length;
        let gross_revenue = 0;
        let cancelled_rides = 0;
        const uniqueCustomers = new Set();
        const activeDrivers = new Set();

        rideRows.forEach(r => {
            const rawFare = String(r.fare || '0').replace(/[^0-9.]/g, '');
            const fareVal = parseFloat(rawFare) || 0;
            if (r.status === 'completed' || r.status === 'finished') {
                gross_revenue += fareVal;
            }
            if (r.status === 'cancelled' || r.status === 'cancel_requested') {
                cancelled_rides++;
            }
            if (r.user_id) uniqueCustomers.add(r.user_id);
            if (r.driver_id) activeDrivers.add(r.driver_id);
        });

        const stats = {
            total_rides,
            gross_revenue,
            platform_commission: gross_revenue * 0.10,
            driver_payout: gross_revenue * 0.90,
            unique_customers: uniqueCustomers.size,
            active_drivers: activeDrivers.size,
            cancelled_rides
        };

        // Fetch Dropdown Lists for filters (Associations & Drivers)
        const [associationsList] = await db.query('SELECT id, name, city_name FROM taxi_associations ORDER BY name ASC');
        const [driversList] = await db.query('SELECT id, name, phone, car_number, association_id, vehicle_type FROM taxi_drivers WHERE is_blocked = 0 ORDER BY name ASC');

        res.json({
            stats: stats,
            rides: rideRows,
            associations: associationsList,
            drivers: driversList
        });
    } catch (err) {
        console.error('Underground report error:', err);
        res.status(500).json({ error: 'Failed to generate underground report: ' + err.message });
    }
});

app.get('/api/admin/driver-applications/history', async (req, res) => {
    try {
        const [apps] = await db.query("SELECT * FROM taxi_driver_applications WHERE status = 'approved' ORDER BY created_at DESC");
        apps.forEach(app => delete app.password);
        res.json({ success: true, applications: apps });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch application history.' });
    }
});

app.post('/api/admin/driver-applications/decision', async (req, res) => {
    const { appId, status, note } = req.body; // status: approved or rejected
    try {
        const [apps] = await db.query('SELECT * FROM taxi_driver_applications WHERE id = ?', [appId]);
        if (apps.length === 0) return res.status(404).json({ error: 'Application not found.' });

        const app = apps[0];
        const escapedNote = escapeHTML(note || 'Processed by Command.');

        if (status === 'approved') {
            // Move to drivers table with all documents
            const sql = `
                INSERT INTO taxi_drivers (
                    name, profile_photo, email, password, phone, car_model, car_number, vehicle_type, seating_capacity, approval_status,
                    dl_front, dl_back, pvc, aadhar_front, aadhar_back, rc_book, insurance, pollution, permit, payment_qr,
                    pref_loc_1, pref_loc_2, pref_loc_3, ride_local, ride_oneway, ride_round,
                    district, association_id, association_name, association_id_card,
                    dl_expiry, pvc_expiry, insurance_expiry, pollution_expiry, permit_expiry
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const values = [
                app.name, app.profile_photo, app.email, app.password, app.phone, app.car_model, app.car_number, app.vehicle_type, app.seating_capacity || 5,
                app.dl_front, app.dl_back, app.pvc, app.aadhar_front, app.aadhar_back,
                app.rc_book, app.insurance, app.pollution, app.permit, app.payment_qr,
                app.pref_loc_1, app.pref_loc_2, app.pref_loc_3, app.ride_local, app.ride_oneway, app.ride_round,
                app.district, app.association_id, app.association_name || 'CityRide Driver (Independent)', app.association_id_card,
                app.dl_expiry, app.pvc_expiry, app.insurance_expiry, app.pollution_expiry, app.permit_expiry
            ];
            await db.query(sql, values);

            // Mark application as approved (History Storage)
            await db.query('UPDATE taxi_driver_applications SET status = "approved", admin_note = ? WHERE id = ?', [escapedNote, appId]);

            // Optional: Send Email Notification
            await sendBrevoMail(app.email, 'CityRide Pilot Identity Verified', `<h2>Welcome to the fleet, Pilot!</h2><p>Your application has been authorized by Command. You can now log in to the Driver Portal and begin your missions.</p>`).catch(e => console.error('Approval notification failed', e));

        } else {
            // REJECTED: Delete application data as requested
            await db.query('DELETE FROM taxi_driver_applications WHERE id = ?', [appId]);

            // Optional: Send Email Notification
            await sendBrevoMail(
                app.email,
                'Pilot Application Update',
                '<h2>Ground Control Update</h2>' +
                '<p>Your application was not authorized at this time.</p>' +
                '<p><strong>Reason:</strong> ' + escapedNote + '</p>'
            ).catch(e => console.error('Rejection notification failed', e));
        }

        res.json({ success: true, message: `Application ${status} successfully.` });
    } catch (err) {
        console.error('Decision Error:', err.message);
        res.status(500).json({ error: 'Failed to process decision.' });
    }
});

// 4.1 Get Latest Driver Info
app.get('/api/driver/info/:id', authenticateJWT, requireRole(['driver', 'user', 'admin']), async (req, res) => {
    try {
        const [drivers] = await db.query(`SELECT 
            id, name, email, phone, car_model, car_number, vehicle_type, seating_capacity, wallet_balance, payment_qr, 
            profile_photo, dl_expiry, pvc_expiry, insurance_expiry, pollution_expiry, permit_expiry,
            ((dl_front IS NOT NULL AND dl_front != '') OR (dl_back IS NOT NULL AND dl_back != '')) as has_dl,
            (pvc IS NOT NULL AND pvc != '') as has_pvc,
            ((aadhar_front IS NOT NULL AND aadhar_front != '') OR (aadhar_back IS NOT NULL AND aadhar_back != '')) as has_aadhar,
            (rc_book IS NOT NULL AND rc_book != '') as has_rc,
            ((insurance IS NOT NULL AND insurance != '') OR (permit IS NOT NULL AND permit != '')) as has_insurance_permit
            FROM taxi_drivers WHERE id = ?`, [req.params.id]);
        if (drivers.length > 0) {
            const driver = drivers[0];
            const [ratingRows] = await db.query('SELECT AVG(rating) as avg_rating, COUNT(rating) as total_ratings FROM taxi_bookings WHERE driver_id = ? AND rating IS NOT NULL', [req.params.id]);
            driver.avg_rating = ratingRows[0].avg_rating ? parseFloat(ratingRows[0].avg_rating).toFixed(1) : '5.0';
            driver.total_ratings = ratingRows[0].total_ratings || 0;
            res.json({ success: true, driver });
        } else {
            res.status(404).json({ error: 'Pilot not found.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch pilot info' });
    }
});

app.post('/api/driver/wallet-payment-notify', authenticateJWT, requireRole(['driver']), async (req, res) => {
    try {
        const { amount } = req.body;
        const driverId = req.user.id;

        const [drivers] = await db.query('SELECT name, phone FROM taxi_drivers WHERE id = ?', [driverId]);
        if (drivers.length === 0) return res.status(404).json({ error: 'Driver not found' });

        const driverName = drivers[0].name;
        const driverPhone = drivers[0].phone;

        // Admin email address
        const adminEmail = process.env.REPORT_RECEIVER_EMAIL || 'sureshit2005@gmail.com';

        const emailContent = '<h2>Pilot Wallet Payment Notification</h2>\n' +
            ' <p><strong>Pilot Name:</strong> ' + escapeHTML(driverName) + '</p>\n' +
            ' <p><strong>Pilot Phone:</strong> ' + escapeHTML(driverPhone) + '</p>\n' +
            ' <p><strong>Pilot ID:</strong> ' + escapeHTML(driverId) + '</p>\n' +
            ' <p><strong>Amount Transferred:</strong> Rs.' + escapeHTML(parseFloat(amount).toFixed(2)) + '</p>\n' +
            ' <p>Please verify the UPI payment and update the pilot\'s wallet balance in the Admin Panel.</p>';

        await sendBrevoMail(
            adminEmail,
            'Pilot Wallet Payment Notification',
            emailContent
        ).catch(e => console.error('Notify email failed to send', e));

        res.json({ success: true, message: 'Ground Control Notified.' });
    } catch (err) {
        console.error('Wallet Payment Notify Error:', err.message);
        res.status(500).json({ error: 'Failed to send notification.' });
    }
});

// GET /api/driver/wallet-balance — Lightweight live balance fetch for ping popup pre-check
app.get('/api/driver/wallet-balance', authenticateJWT, requireRole(['driver']), async (req, res) => {
    try {
        const driverId = req.user.id;
        const [rows] = await db.query('SELECT wallet_balance FROM taxi_drivers WHERE id = ?', [driverId]);
        if (!rows.length) return res.status(404).json({ error: 'Driver not found.' });
        res.json({ success: true, balance: parseFloat(rows[0].wallet_balance) || 0, wallet_balance: parseFloat(rows[0].wallet_balance) || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Vendor Partner Login
app.post('/api/vendor/login', authRateLimiter, async (req, res) => {
    const { vendor_id, password } = req.body;
    const cleanVendorId = cleanString(vendor_id);
    try {
        if (!cleanVendorId || !password) {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'vendor', identifier: cleanVendorId || 'unknown', status: 'ERROR', ip: req.ip, message: 'Vendor login failed: Missing credentials', reason: 'missing_fields' });
            return res.status(400).json({ error: 'Vendor ID and password are required.' });
        }

        const [rows] = await db.query('SELECT * FROM taxi_vendors WHERE vendor_id = ?', [cleanVendorId]);

        if (rows.length > 0) {
            const vendor = rows[0];
            if (vendor.is_blocked) {
                logAuthEvent({ event: 'LOGIN_FAIL', role: 'vendor', identifier: cleanVendorId, status: 'ERROR', ip: req.ip, message: 'Vendor login blocked: Account suspended', reason: 'vendor_blocked' });
                return res.status(403).json({ error: 'Partner Access Revoked. Contact Command.' });
            }
            const isMatch = await bcrypt.compare(password, vendor.password);
            if (isMatch) {
                delete vendor.password;
                vendor.role = 'vendor';
                await setAuthCookie(res, req, vendor, 'vendor');
                logAuthEvent({ event: 'LOGIN_SUCCESS', role: 'vendor', identifier: cleanVendorId, status: 'OK', ip: req.ip, message: `Vendor logged in: ${vendor.name || vendor.vendor_id}` });
                return res.json({ success: true, user: vendor });
            } else {
                logAuthEvent({ event: 'LOGIN_FAIL', role: 'vendor', identifier: cleanVendorId, status: 'ERROR', ip: req.ip, message: 'Vendor login failed: Incorrect password', reason: 'wrong_password' });
            }
        } else {
            logAuthEvent({ event: 'LOGIN_FAIL', role: 'vendor', identifier: cleanVendorId, status: 'ERROR', ip: req.ip, message: 'Vendor login failed: Account not found', reason: 'vendor_not_found' });
        }
        res.status(401).json({ error: 'Auth Failure. Invalid Vendor ID/Key.' });
    } catch (err) {
        logAuthEvent({ event: 'LOGIN_FAIL', role: 'vendor', identifier: cleanVendorId || 'unknown', status: 'ERROR', ip: req.ip, message: 'Partner Auth Failure', reason: err.message });
        res.status(500).json({ error: 'Partner Auth Failure' });
    }
});

// --- AI CHATBOT / SUPPORT WIDGET API ---
app.post('/api/chat', async (req, res) => {
    try {
        let { message } = req.body;
        message = cleanString(message);
        if (!message) return res.status(400).json({ error: 'Message required' });
        if (message.length > 500) return res.status(400).json({ error: 'Message too long (max 500 characters).' });

        // Offline Fallback
        if (!process.env.GEMINI_API_KEY) {
            return res.json({
                success: true,
                reply: "I am the CityRide AI. I am currently offline because the Ground Command has not connected my Neural Link API Key yet. Please call us directly!"
            });
        }

        const apiKey = (process.env.GEMINI_API_KEY || '').trim();
        const genAI = new GoogleGenerativeAI(apiKey);

        // Final verified model: gemini-flash-latest is the only one with active quota for this project.
        const model = genAI.getGenerativeModel({
            model: "gemini-flash-latest",
            systemInstruction: `You are "CityRide AI", the official virtual assistant for CityRideTaxi.
Your style: Friendly, professional, and concise (max 2 sentences).
Core Knowledge:
- Fares: Sedan is \u20B925/KM. SUV is \u20B935/KM.
- Limits: No KM limit for local rides. Outstation rides are for longer distances between cities.
Response Instructions: 
- Only mention booking or redirecting if the user specifically asks how to book or seems ready to ride. 
- Answer their specific question directly first.`
        });

        const prompt = `User says: ${message}`;

        try {
            const result = await model.generateContent(prompt);
            res.json({ success: true, reply: result.response.text() });
        } catch (apiErr) {
            console.error('Google API Error Handled Gracefully:', apiErr.message);
            // If the key is invalid, region-locked, or 404s, NEVER crash the server. Provide a fallback!
            return res.json({
                success: true,
                reply: "I'm currently experiencing neural network maintenance or regional API locks. Please use the 'Raise Ticket' tab next to me to submit your query directly to our team!"
            });
        }
    } catch (err) {
        console.error('Core AI Route Error:', err.message);
        res.status(500).json({ error: 'AI systems crashed.' });
    }
});

app.post('/api/support/ticket', async (req, res) => {
    try {
        let { name, email, query } = req.body;
        name = cleanString(name);
        email = cleanString(email);
        query = cleanString(query);

        if (!name || !email || !query) return res.status(400).json({ error: 'All fields required.' });
        if (!validateEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });

        const escapedName = escapeHTML(name);
        const escapedEmail = escapeHTML(email);
        const escapedQuery = escapeHTML(query);

        // Send email to admin (Receiver)
        const adminEmail = process.env.REPORT_RECEIVER_EMAIL || 'sureshit2005@gmail.com';
        const subject = '🎫 New Support Ticket from ' + escapedName;
        const html = '            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; max-width: 600px;">\n' +
            '                <h2 style="color: #ff5252;">New Support Ticket</h2>\n' +
            '                <p><strong>Customer Name:</strong> ' + escapedName + '</p>\n' +
            '                <p><strong>Reply to Email:</strong> ' + escapedEmail + '</p>\n' +
            '                <hr style="border-top: 1px dashed #ccc;" />\n' +
            '                <p><strong>Issue/Query:</strong></p>\n' +
            '                <div style="background: #f8f8f8; padding: 15px; border-radius: 8px;">\n' +
            '                    ' + escapedQuery + '\n' +
            '                </div>\n' +
            '            </div>\n';

        await sendBrevoMail(adminEmail, subject, html);

        // --- AUTO-MESSAGE / AUTO-REPLY TO CUSTOMER ---
        const customerSubject = 'Ticket Received - CityRideTaxi Support';
        const customerHtml = '            <div style="font-family: sans-serif; padding: 20px; border-left: 4px solid #ff5252; background: #f9f9f9; max-width: 600px;">\n' +
            '                <h3 style="color: #333;">Hello ' + escapedName + ',</h3>\n' +
            '                <p>This is an automated message confirming that your support ticket has been logged into our system successfully.</p>\n' +
            '                <p>Our operations team will review your query and respond directly to this email address within 12 business hours.</p>\n' +
            '                <p style="margin-top: 20px; font-size: 0.9rem; color: #777;">Thank you for riding with us,<br/><strong>CityRideTaxi Command Team</strong></p>\n' +
            '            </div>\n';
        // Send auto-responder back to the customer's inputted email
        await sendBrevoMail(email, customerSubject, customerHtml).catch(e => console.error('Auto-reply failed', e));

        res.json({ success: true, message: 'Ticket received. We will email you shortly.' });
    } catch (err) {
        console.error('Ticket Error:', err.message);
        res.status(500).json({ error: 'Failed to send ticket.' });
    }
});

// Helper functions to check if addresses are in the same district
function extractDistrict(address) {
    if (!address) return null;
    const parts = address.toLowerCase().split(',').map(s => s.trim());
    const ignoreList = ['india', 'tamil nadu', 'kerala', 'karnataka', 'andhra pradesh', 'telangana', 'maharashtra'];

    for (let i = parts.length - 1; i >= 0; i--) {
        let part = parts[i];
        if (!part) continue;
        if (ignoreList.includes(part)) continue;
        if (/^\d+$/.test(part)) continue; // ignore pincodes
        if (part.includes('district')) return part.replace('district', '').trim();
    }

    for (let i = parts.length - 1; i >= 0; i--) {
        let part = parts[i];
        if (!part) continue;
        if (ignoreList.includes(part)) continue;
        if (/^\d/.test(part)) continue;
        return part;
    }
    return null;
}

function isSameDistrict(pickup, drop) {
    const pDist = extractDistrict(pickup);
    const dDist = extractDistrict(drop);
    if (!pDist || !dDist) return true; // fallback if unparseable

    if (pDist === dDist || pDist.includes(dDist) || dDist.includes(pDist)) return true;

    const pWords = pDist.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 4);
    const dWords = dDist.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 4);

    return pWords.some(w => dWords.includes(w));
}

// 2. Booking Management
app.post('/api/bookings/create', authenticateJWT, requireRole(['user', 'vendor', 'admin']), (req, res, next) => {
    if (!req.body.userId && req.user && req.user.role === 'user') {
        req.body.userId = req.user.id;
    }
    next();
}, async (req, res) => {
    try {
        const booking = req.body;

        const journeyOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP
        const endOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP

        // Recalculate Distance & Category & Fare purely server-side
        let distanceKm = parseFloat(booking.distance) || 0; // Ideally use OSRM here if not provided, but we fallback to client distance string if OSRM is missing. (Phase 5 recommends OSRM, but we assume the client passed OSRM distance already. In real prod, we'd query OSRM here using coords)
        
        const finalCategory = await pricingEngine.resolveRideCategory(db, distanceKm, booking.tripType);
        booking.tripType = finalCategory; // Override client's category
        
        const fareDetails = await pricingEngine.calculateCanonicalFare(db, {
            distanceKm,
            durationMins: parseFloat(booking.duration) || 0,
            vehicleType: booking.vehicle || 'sedan',
            category: finalCategory,
            pickupTime: booking.time ? new Date(booking.date + ' ' + booking.time) : new Date(),
            extraDrops: booking.extraDrops,
            specialPlaceType: booking.specialPlaceType,
            vendorId: booking.vendorId || (req.user && req.user.role === 'vendor' ? req.user.id : null),
            rentalPackage: booking.rentalPackage,
            returnDate: booking.returnDate,
            pickupDate: booking.date
        });
        
        booking.fare = "₹" + fareDetails.finalFare;

        const fareStr = String(booking.fare || '\u20B90');
        const distStr = String(booking.distance || '0 KM');
        const durationStr = String(booking.duration || booking.estimatedDuration || '0 Min');

        if (['bike', 'auto'].includes(String(booking.vehicle)) && String(booking.tripType) !== 'local') {
            return res.status(400).json({ error: 'Bikes and Autos are only available for local rides.' });
        }

        const vendorIdToUse = booking.vendorId || (req.user && req.user.role === 'vendor' ? req.user.id : null);
        const driverId = booking.driverId || null;
        // Vendor-assigned rides require driver confirmation; regular rides go straight to assigned
        const isVendorAssigned = !!(vendorIdToUse && driverId);
        const status = driverId ? (isVendorAssigned ? 'vendor_assigned' : 'assigned') : 'pending';
        const driverAcceptRequired = isVendorAssigned ? 1 : 0;
        const userIdToUse = booking.userId || (req.user && req.user.role === 'user' ? req.user.id : 1);
        const extraDropsStr = booking.extraDrops ? (typeof booking.extraDrops === 'string' ? booking.extraDrops : JSON.stringify(booking.extraDrops)) : null;
        const specialPlaceType = booking.specialPlaceType || null;

        // --- Geofence Routing: Find if pickup location belongs to an Association ---
        let finalAssociationId = booking.association_id ? parseInt(booking.association_id) : null;
        if (!finalAssociationId && booking.pickupCoords && booking.pickupCoords.includes(',')) {
            try {
                const [lng, lat] = booking.pickupCoords.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lng)) {
                    const sqlAssoc = `
                        SELECT id, 
                            ( 6371 * acos( cos( radians(?) ) * cos( radians( COALESCE(latitude, 0) ) ) * cos( radians( COALESCE(longitude, 0) ) - radians(?) ) + sin( radians(?) ) * sin( radians( COALESCE(latitude, 0) ) ) ) ) AS distance 
                        FROM taxi_associations 
                        WHERE is_active = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL
                        HAVING distance <= COALESCE(geofence_radius, 50) 
                        ORDER BY distance ASC 
                        LIMIT 1
                    `;
                    const [assocs] = await db.query(sqlAssoc, [lat, lng, lat]);
                    if (assocs.length > 0) {
                        finalAssociationId = assocs[0].id;
                    }
                }
            } catch (assocErr) {
                console.warn('Geofence association lookup warning:', assocErr.message);
            }
        }

        const airDistanceBoostKm = parseFloat(booking.airDistanceBoostKm || 0);
        const pickupIncentiveFare = parseFloat(booking.pickupIncentiveFare || 0);

        const values = [
            userIdToUse,
            String(booking.pickup || ''),
            booking.pickupCoords,
            String(booking.drop || ''),
            booking.dropCoords,
            extraDropsStr,
            booking.date,
            booking.time,
            parseInt(booking.passengers) || 1,
            String(booking.vehicle || 'sedan'),
            String(booking.tripType || 'oneway'),
            fareStr,
            distStr,
            journeyOtp,
            endOtp,
            status,
            vendorIdToUse,
            booking.vendorMarkup || 0,
            booking.rentalPackage || null,
            booking.returnDate || null,
            booking.passengerName || null,
            booking.passengerPhone || null,
            distStr,  // estimated_distance (static, never changes)
            fareStr,  // estimated_fare (static, never changes)
            durationStr, // estimated_duration
            driverId,
            specialPlaceType,
            finalAssociationId,
            airDistanceBoostKm,
            pickupIncentiveFare
        ];
        const [result] = await db.query('INSERT INTO taxi_bookings (user_id, pickup_loc, pickup_coords, drop_loc, drop_coords, extra_drops, pickup_date, pickup_time, passengers, vehicle_type, trip_type, fare, distance, journey_otp, end_otp, status, vendor_id, vendor_markup, rental_package, return_date, passenger_name, passenger_phone, estimated_distance, estimated_fare, estimated_duration, driver_id, special_place_type, association_id, air_distance_boost_km, pickup_incentive_fare, driver_accept_required) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...values, driverAcceptRequired]);


        // 🔴 Socket.IO: Notify all drivers + admin of new opportunity
        const newBookingPayload = {
            bookingId: result.insertId,
            pickup: booking.pickup,
            drop: booking.drop,
            fare: fareStr,
            distance: distStr,
            vehicleType: booking.vehicle,
            tripType: booking.tripType,
            passengers: parseInt(booking.passengers) || 1,
            seatingCapacity: parseInt(booking.passengers) || 1,
            status,
            airDistanceBoostKm,
            pickupIncentiveFare
        };
        emitEvent('drivers', 'new_opportunity', newBookingPayload);
        emitEvent('admin', 'new_opportunity', newBookingPayload);
        if (driverId) {
            if (isVendorAssigned) {
                // Vendor-assigned: driver must accept — send as ping popup
                const vendorPingPayload = { ...newBookingPayload, vendorId: vendorIdToUse, isVendorAssigned: true, requireAccept: true };
                emitEvent(`driver:${driverId}`, 'booking_ping', vendorPingPayload);
                emitEvent(`driver:${driverId}`, 'booking_assigned', vendorPingPayload);
                // Notify vendor that driver was dispatched and is pending acceptance
                emitEvent(`vendor:${vendorIdToUse}`, 'driver_dispatched', { ...newBookingPayload, bookingId: result.insertId, driverId, status: 'vendor_assigned' });
            } else {
                emitEvent(`driver:${driverId}`, 'booking_assigned', newBookingPayload);
            }
        }
        if (booking.userId || req.user?.id) {
            const passengerId = booking.userId || req.user?.id;
            emitEvent(`user:${passengerId}`, 'booking_created', newBookingPayload);
            emitEvent(`user:${passengerId}`, 'booking_status_update', newBookingPayload);
        }

        res.json({ success: true, bookingId: result.insertId, journeyOtp: journeyOtp, endOtp: endOtp, isVendorAssigned });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check Air Distance & Driver Proximity before booking creation
app.post('/api/bookings/check-air-distance', async (req, res) => {
    try {
        const { pickupCoords, vehicleType, tripType } = req.body;
        if (!pickupCoords || !pickupCoords.includes(',')) {
            return res.json({ hasNearbyDrivers: true, restrictEnabled: false });
        }

        const [latStr, lngStr] = pickupCoords.split(',');
        const pickupLat = parseFloat(latStr.trim());
        const pickupLng = parseFloat(lngStr.trim());

        if (isNaN(pickupLat) || isNaN(pickupLng)) {
            return res.json({ hasNearbyDrivers: true, restrictEnabled: false });
        }

        const [settingRows] = await db.query(
            "SELECT setting_key, setting_value FROM taxi_settings WHERE setting_key IN ('air_distance_restrict', 'air_distance_local_km', 'air_distance_outstation_km')"
        );

        let restrictEnabled = false;
        let localRadiusKm = 3;
        let outstationRadiusKm = 5;

        settingRows.forEach(row => {
            if (row.setting_key === 'air_distance_restrict' && row.setting_value === '1') restrictEnabled = true;
            if (row.setting_key === 'air_distance_local_km') localRadiusKm = parseFloat(row.setting_value) || 3;
            if (row.setting_key === 'air_distance_outstation_km') outstationRadiusKm = parseFloat(row.setting_value) || 5;
        });

        if (!restrictEnabled) {
            return res.json({ restrictEnabled: false, hasNearbyDrivers: true });
        }

        const baseRadiusKm = (String(tripType || 'local').toLowerCase() === 'local') ? localRadiusKm : outstationRadiusKm;
        const vType = String(vehicleType || 'sedan').toLowerCase();

        // Fetch active online drivers for this vehicle type
        const [drivers] = await db.query(
            "SELECT id, latitude, longitude FROM taxi_drivers WHERE is_online = 1 AND is_blocked = 0 AND latitude IS NOT NULL AND longitude IS NOT NULL AND LOWER(vehicle_type) = ?",
            [vType]
        );

        if (drivers.length === 0) {
            return res.json({
                restrictEnabled: true,
                hasNearbyDrivers: false,
                baseRadiusKm,
                nearestDriverDistKm: 10,
                recommendedBoosts: [
                    { boostKm: 2, fee: 20, label: "+2 KM Radius (\u20B920 Incentive)" },
                    { boostKm: 5, fee: 50, label: "+5 KM Radius (\u20B950 Incentive)" },
                    { boostKm: 10, fee: 100, label: "+10 KM Max Radius (\u20B9100 Incentive)" }
                ]
            });
        }

        let nearestDist = Infinity;
        drivers.forEach(d => {
            const dLat = parseFloat(d.latitude);
            const dLng = parseFloat(d.longitude);
            if (!isNaN(dLat) && !isNaN(dLng)) {
                const dist = getDistance(dLat, dLng, pickupLat, pickupLng);
                if (dist < nearestDist) nearestDist = dist;
            }
        });

        const hasNearby = nearestDist <= baseRadiusKm;
        const roundedDist = nearestDist === Infinity ? 10 : Math.round(nearestDist * 10) / 10;
        const requiredExtraKm = Math.max(1, Math.ceil(roundedDist - baseRadiusKm));

        res.json({
            restrictEnabled: true,
            hasNearbyDrivers: hasNearby,
            baseRadiusKm,
            nearestDriverDistKm: roundedDist,
            requiredExtraKm,
            recommendedBoosts: [
                { boostKm: Math.max(2, requiredExtraKm), fee: Math.max(20, requiredExtraKm * 10), label: `+${Math.max(2, requiredExtraKm)} KM Radius (\u20B9${Math.max(20, requiredExtraKm * 10)} Incentive)` },
                { boostKm: Math.max(5, requiredExtraKm + 3), fee: Math.max(50, (requiredExtraKm + 3) * 10), label: `+${Math.max(5, requiredExtraKm + 3)} KM Radius (\u20B9${Math.max(50, (requiredExtraKm + 3) * 10)} Incentive)` },
                { boostKm: 10, fee: 100, label: "+10 KM Max Radius (\u20B9100 Incentive)" }
            ]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Apply Air Distance Boost to an existing pending booking
app.post('/api/bookings/:id/boost', async (req, res) => {
    try {
        const { id } = req.params;
        const { boostKm, incentiveFee } = req.body;

        const [bookingRows] = await db.query('SELECT * FROM taxi_bookings WHERE id = ?', [id]);
        if (bookingRows.length === 0) return res.status(404).json({ error: 'Booking not found' });
        const booking = bookingRows[0];
        
        if (booking.status !== 'pending') {
            return res.status(400).json({ error: 'Boost can only be applied to pending bookings.' });
        }

        const newBoostKm = (parseFloat(booking.air_distance_boost_km) || 0) + parseFloat(boostKm);
        const newIncentiveFee = (parseFloat(booking.pickup_incentive_fare) || 0) + parseFloat(incentiveFee);

        await db.query('UPDATE taxi_bookings SET air_distance_boost_km = ?, pickup_incentive_fare = ? WHERE id = ?', [newBoostKm, newIncentiveFee, id]);

        // Broadcast updated opportunity to drivers
        const newBookingPayload = {
            bookingId: booking.id,
            pickup: booking.pickup_loc,
            drop: booking.drop_loc,
            fare: booking.fare,
            distance: booking.distance,
            vehicleType: booking.vehicle_type,
            tripType: booking.trip_type,
            passengers: booking.passengers,
            seatingCapacity: booking.passengers,
            status: booking.status,
            airDistanceBoostKm: newBoostKm,
            pickupIncentiveFare: newIncentiveFee
        };
        emitEvent('drivers', 'new_opportunity', newBookingPayload);
        emitEvent('admin', 'new_opportunity', newBookingPayload);

        res.json({ success: true, airDistanceBoostKm: newBoostKm, pickupIncentiveFare: newIncentiveFee });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fare Breakdown endpoint — returns itemized fare for customer popup
app.get('/api/bookings/fare-breakdown/:bookingId', authenticateJWT, requireRole(['user', 'driver', 'admin']), async (req, res) => {
    try {
        const { bookingId } = req.params;
        const [rows] = await db.query(
            `SELECT b.*, 
                COALESCE(d.name, 'Unassigned') as driver_name,
                COALESCE(d.car_model, '') as car_model,
                COALESCE(d.car_number, '') as car_number
             FROM taxi_bookings b
             LEFT JOIN taxi_drivers d ON b.driver_id = d.id
             WHERE b.id = ?`, [bookingId]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Booking not found.' });
        const b = rows[0];

        const isStarted = !!b.journey_start_time;
        const fareType = isStarted ? 'final' : 'estimated';
        
        // Use actual distance if available, else estimated
        const distKm = parseNumeric(b.actual_distance || b.distance || b.estimated_distance || '0');
        const estimDistKm = parseNumeric(b.estimated_distance || b.distance || '0');
        const estimDurationMins = calcEstimatedDurationMins(estimDistKm);

        let durationMins = estimDurationMins;
        if (isStarted) {
            const startTime = new Date(b.journey_start_time);
            const endTime = b.journey_end_time ? new Date(b.journey_end_time) : new Date();
            durationMins = Math.max(0, (endTime - startTime) / (1000 * 60));
        }

        let preRideWaitingCharge = 0;
        if (b.reached_pickup_time && b.journey_start_time) {
            const reachedTime = new Date(b.reached_pickup_time);
            const journeyStartTime = new Date(b.journey_start_time);
            const preRideElapsedMs = journeyStartTime - reachedTime;
            const preRideElapsedMins = preRideElapsedMs / (1000 * 60);
            if (preRideElapsedMins > 5) {
                preRideWaitingCharge = Math.max(0, Math.ceil((preRideElapsedMins - 5) * 2));
            }
        }

        const categoryKey = b.trip_type === 'rental' ? 'rental' : b.trip_type;

        const pricingConfigRes = await pricingEngine.calculateCanonicalFare(db, {
            distanceKm: distKm,
            durationMins: durationMins,
            vehicleType: b.vehicle_type,
            category: categoryKey,
            pickupTime: b.pickup_time ? new Date(b.pickup_date + ' ' + b.pickup_time) : new Date(),
            extraDrops: b.extra_drops,
            specialPlaceType: b.special_place_type,
            vendorId: b.vendor_id,
            rentalPackage: b.rental_package,
            returnDate: b.return_date,
            pickupDate: b.pickup_date,
            preRideWaitingCharge
        });

        const pricingConfig = pricingConfigRes.pricingConfig || {};
        
        let extraDropsCount = 0;
        let extraDropsList = [];
        try {
            if (b.extra_drops) {
                extraDropsList = typeof b.extra_drops === 'string' ? JSON.parse(b.extra_drops) : b.extra_drops;
                if (Array.isArray(extraDropsList)) {
                    extraDropsCount = extraDropsList.length;
                }
            }
        } catch (e) { }

        let specialLocationDisplayName = null;
        if (b.special_place_type) {
            const [spRows] = await db.query('SELECT display_name FROM taxi_special_location_charges WHERE place_type = ? AND is_active = 1', [b.special_place_type]);
            if (spRows.length > 0) specialLocationDisplayName = spRows[0].display_name;
        }

        // Add association overrides if applied
        let assocCustomerOverrideAmount = 0;
        if (b.driver_id) {
            const [drvRows] = await db.query('SELECT association_id FROM taxi_drivers WHERE id = ?', [b.driver_id]);
            if (drvRows.length > 0 && drvRows[0].association_id) {
                const [assocRows] = await db.query('SELECT commission_customer_pct, commission_customer_fixed FROM taxi_associations WHERE id = ?', [drvRows[0].association_id]);
                if (assocRows.length > 0) {
                    const custPct = parseFloat(assocRows[0].commission_customer_pct) || 0;
                    const custFixed = parseFloat(assocRows[0].commission_customer_fixed) || 0;
                    if (custPct > 0 || custFixed > 0) {
                        assocCustomerOverrideAmount = (pricingConfigRes.finalFare * (custPct / 100)) + custFixed;
                        pricingConfigRes.finalFare = pricingConfigRes.finalFare + Math.ceil(assocCustomerOverrideAmount);
                    }
                }
            }
        }

        const totalFareNum = parseNumeric(b.fare) || pricingConfigRes.finalFare;

        res.json({
            bookingId: b.id,
            pickup: b.pickup_loc,
            drop: b.drop_loc,
            vehicle: b.vehicle_type,
            tripType: b.trip_type,
            distance: distKm.toFixed(3),
            estimatedDistance: estimDistKm.toFixed(3),
            estimatedDurationMins: estimDurationMins,
            estimatedDuration: formatDurationMins(estimDurationMins),
            
            baseFare: Math.round(pricingConfig.base || 0),
            distanceFare: Math.round(pricingConfigRes.baseKmFare),
            peakCharge: Math.round(pricingConfigRes.peakCharge),
            peakPercent: 0,
            driverAllowance: Math.round(pricingConfigRes.driverAllowance || 0),
            waitingCharge: Math.round(pricingConfigRes.waitingCharge),
            platformFee: pricingConfigRes.platformFee,
            platformFeeDesc: "Platform Fee",
            totalFare: totalFareNum,
            
            extraDrops: extraDropsList,
            extraDropsCount: extraDropsCount,
            extraDropsCharge: Math.round(pricingConfigRes.extraDropsCharge),
            
            specialPlaceType: b.special_place_type || null,
            specialLocationDisplayName: specialLocationDisplayName,
            specialLocationSurchargePercent: 0,
            specialLocationCharge: Math.round(pricingConfigRes.specialCharge),
            
            fareStr: b.fare,
            fareType: fareType,
            isStarted: isStarted,
            status: b.status,
            driverName: b.driver_name,
            journey_start_time: b.journey_start_time || null,
            journey_end_time: b.journey_end_time || null,
            
            // Additional rental/round fields
            rentalPackage: b.rental_package || null,
            packageBase: Math.round(pricingConfig.base || 0),
            extraKmCharge: 0, 
            extraHrCharge: 0, 
            minKmVal: pricingConfig.minKm || 0,
            minKmCharge: Math.round((pricingConfig.minKm || 0) * (pricingConfig.perKm || 0)),
            perKmRate: pricingConfig.perKm || 0,
            effectivePerKmRate: pricingConfig.perKm || 0
        });
    } catch (err) {
        console.error('Fare breakdown error:', err);
        res.status(500).json({ error: err.message });
    }
});





// Search drivers by vehicle/car number
app.get('/api/drivers/search-by-vehicle', authenticateJWT, requireRole(['vendor', 'admin']), async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query) {
            return res.json([]);
        }
        const [rows] = await db.query(
            'SELECT id, name, car_model, car_number, vehicle_type, phone FROM taxi_drivers WHERE car_number LIKE ? AND approval_status = "approved" AND is_blocked = 0 LIMIT 10',
            [`%${query}%`]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- VENDOR ROUTE PROTECTION MIDDLEWARE ---
app.use('/api/vendor/', (req, res, next) => {
    if (req.path === '/login') return next();
    return authenticateJWT(req, res, () => {
        return requireRole(['vendor'])(req, res, next);
    });
});

// --- VENDOR CUSTOM TARIFF CONTROLLERS ---
app.get('/api/vendor/tariffs/:vendorId', async (req, res) => {
    try {
        const vendorId = req.params.vendorId;
        const [defaultTariffs] = await db.query('SELECT * FROM taxi_tariffs');
        const [vendorTariffs] = await db.query('SELECT * FROM taxi_vendor_tariffs WHERE vendor_id = ?', [vendorId]);

        const merged = defaultTariffs.map(def => {
            const vTariff = vendorTariffs.find(v => v.vehicle_type === def.vehicle_type && v.category === def.category);
            if (vTariff) {
                return {
                    ...def,
                    id: vTariff.id,
                    config: vTariff.config,
                    is_custom: true,
                    updated_at: vTariff.updated_at
                };
            }
            return {
                ...def,
                is_custom: false
            };
        });
        res.json(merged);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch vendor tariffs' });
    }
});

app.post('/api/vendor/update-tariff', (req, res, next) => {
    if (req.user.id !== parseInt(req.body.vendorId)) {
        return res.status(403).json({ error: 'Access Denied: Vendor ID mismatch.' });
    }
    next();
}, async (req, res) => {
    try {
        const { vendorId, vehicleType, category, config } = req.body;
        if (!vendorId || !vehicleType || !category || !config) {
            return res.status(400).json({ error: 'vendorId, vehicleType, category, and config are required.' });
        }

        await db.query(
            `INSERT INTO taxi_vendor_tariffs (vendor_id, vehicle_type, category, config) 
             VALUES (?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE config = ?`,
            [vendorId, vehicleType, category, JSON.stringify(config), JSON.stringify(config)]
        );
        res.json({ success: true, message: 'Vendor tariff updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update vendor tariff.' });
    }
});

// --- VENDOR WALLET ENDPOINTS ---

// GET /api/vendor/wallet/:vendorId — Wallet balance + transaction history
app.get('/api/vendor/wallet/:vendorId', authenticateJWT, requireRole(['vendor', 'admin']), async (req, res) => {
    try {
        const vendorId = parseInt(req.params.vendorId);
        // Only vendor themselves or admin may view
        if (req.user.role === 'vendor' && req.user.id !== vendorId) {
            return res.status(403).json({ error: 'Access Denied.' });
        }

        // Fetch or initialise wallet row
        const [walletRows] = await db.query(
            'SELECT balance, total_earned, updated_at FROM taxi_vendor_wallets WHERE vendor_id = ?',
            [vendorId]
        );
        const wallet = walletRows[0] || { balance: 0, total_earned: 0, updated_at: null };

        // Fetch recent transactions (50 max)
        const [txns] = await db.query(
            `SELECT t.*, b.pickup_loc, b.drop_loc, d.name as driver_name
             FROM taxi_vendor_wallet_transactions t
             LEFT JOIN taxi_bookings b ON t.booking_id = b.id
             LEFT JOIN taxi_drivers d ON t.driver_id = d.id
             WHERE t.vendor_id = ?
             ORDER BY t.created_at DESC LIMIT 50`,
            [vendorId]
        );

        res.json({
            success: true,
            balance: parseFloat(wallet.balance) || 0,
            totalEarned: parseFloat(wallet.total_earned) || 0,
            lastUpdated: wallet.updated_at,
            transactions: txns
        });
    } catch (err) {
        console.error('[vendor/wallet error]', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/vendor/bookings/:vendorId', async (req, res) => {

    try {
        const vendorId = req.params.vendorId;
        const sql = `
            SELECT b.*, 
                   COALESCE(b.passenger_name, u.name, tu.name) as customer_name, 
                   COALESCE(b.passenger_phone, u.phone, tu.phone) as customer_phone, 
                   d.name as driver_name, d.car_model, d.car_number, d.phone as driver_phone,
                   v.business_name as vendor_business_name
            FROM taxi_bookings b
            LEFT JOIN passengers u ON b.user_id = u.id
            LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id
            LEFT JOIN taxi_vendors v ON b.vendor_id = v.id
            WHERE b.vendor_id = ?
            ORDER BY b.created_at DESC
        `;
        const [rows] = await db.query(sql, [vendorId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.1.1 Cancel Ride (Passenger) — with 3-cancel-per-day ban enforcement
app.post('/api/user/cancel-ride', authenticateJWT, requireRole(['user']), (req, res, next) => {
    console.log(`CANCEL RIDE DEBUG: req.user.id=`, req.user.id, ` type=`, typeof req.user.id, ` req.body.userId=`, req.body.userId, ` type=`, typeof req.body.userId);
    if (req.user.id != req.body.userId) {
        return res.status(401).json({ error: 'Access Denied: You cannot cancel another user\'s booking.' });
    }
    next();
}, async (req, res) => {
    try {
        const { bookingId, userId } = req.body;
        if (!bookingId || !userId) return res.status(400).json({ error: 'bookingId and userId are required.' });

        // Check both tables — users may exist in either `passengers` or `taxi_passengers`
        let [passRows] = await db.query('SELECT id, banned_until FROM passengers WHERE id = ?', [userId]);
        if (passRows.length === 0) {
            [passRows] = await db.query('SELECT id, banned_until FROM taxi_passengers WHERE id = ?', [userId]);
        }
        if (passRows.length === 0) return res.status(404).json({ error: 'User not found.' });
        // Allow cancellation regardless of ban status. 
        // We will check and apply new bans after cancellation.

        const [bookings] = await db.query('SELECT id, status FROM taxi_bookings WHERE id = ? AND user_id = ?', [bookingId, userId]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });
        if (!['pending', 'assigned'].includes(bookings[0].status)) {
            return res.status(400).json({ error: 'Only pending or assigned rides can be cancelled.' });
        }

        await db.query('UPDATE taxi_bookings SET status = "cancelled", driver_id = NULL WHERE id = ?', [bookingId]);
        // Clean up GPS state cache to prevent memory leaks
        activeRidesGpsState.delete(bookingId);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [cancelRows] = await db.query(
            `SELECT COUNT(*) as cnt FROM taxi_bookings WHERE user_id = ? AND status = 'cancelled' AND created_at >= ?`,
            [userId, todayStart]
        );
        const cancelCount = cancelRows[0].cnt;

        let banned = false;
        let banUntil = null;
        if (cancelCount >= 3) {
            banUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await db.query('UPDATE passengers SET banned_until = ? WHERE id = ?', [banUntil, userId]);
            await db.query('UPDATE taxi_passengers SET banned_until = ? WHERE id = ?', [banUntil, userId]).catch(() => { });
            banned = true;
        }

        res.json({ success: true, cancelCount, banned, banned_until: banUntil });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// 2.1.2 Check Passenger Ban Status
app.get('/api/user/ban-status/:userId', authenticateJWT, (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.userId)) {
        return res.status(403).json({ error: 'Access Denied: You cannot view another user\'s ban status.' });
    }
    next();
}, async (req, res) => {
    try {
        let [rows] = await db.query('SELECT banned_until FROM passengers WHERE id = ?', [req.params.userId]);
        if (rows.length === 0) {
            [rows] = await db.query('SELECT banned_until FROM taxi_passengers WHERE id = ?', [req.params.userId]);
        }
        if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        const banEnd = rows[0].banned_until ? new Date(rows[0].banned_until) : null;
        const isBanned = banEnd && banEnd > new Date();
        res.json({ banned: isBanned, banned_until: isBanned ? rows[0].banned_until : null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.2 User Ride History
app.get('/api/user/bookings/:userId', authenticateJWT, (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.userId)) {
        return res.status(403).json({ error: 'Access Denied: You cannot view another user\'s bookings.' });
    }
    next();
}, async (req, res) => {
    try {
        const sql = `
            SELECT b.*, 
                   TIMESTAMPDIFF(SECOND, b.journey_start_time, NOW()) as journey_elapsed_seconds,
                   TIMESTAMPDIFF(SECOND, b.reached_pickup_time, NOW()) as reached_elapsed_seconds,
                   d.name as driver_name, d.phone as driver_phone, d.car_model, d.car_number 
            FROM taxi_bookings b 
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id 
            WHERE b.user_id = ? 
            ORDER BY b.created_at DESC
        `;
        const [rows] = await db.query(sql, [req.params.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'History Retrieval Failure' });
    }
});

// 2.3 Accept Ride (Driver Action)
app.post('/api/bookings/accept', authenticateJWT, requireRole(['driver']), (req, res, next) => {
    if (req.user.id !== parseInt(req.body.driverId)) {
        console.warn(`[AUTH WARNING] Driver ID mismatch on /api/bookings/accept: req.user.id is ${req.user.id} (${typeof req.user.id}), but req.body.driverId is ${req.body.driverId} (${typeof req.body.driverId})`);
        return res.status(403).json({ error: 'Access Denied: Driver ID mismatch.' });
    }
    next();
}, async (req, res) => {
    try {
        const { bookingId, driverId, lat, lng } = req.body;

        // Consolidated single select check query (supports both pending and vendor_assigned states)
        const [checks] = await db.query(`
            SELECT 
              (SELECT fare FROM taxi_bookings WHERE id = ? AND status IN ('pending', 'vendor_assigned')) AS booking_fare,
              (SELECT vendor_id FROM taxi_bookings WHERE id = ? AND status IN ('pending', 'vendor_assigned')) AS vendor_id,
              (SELECT vendor_markup FROM taxi_bookings WHERE id = ? AND status IN ('pending', 'vendor_assigned')) AS vendor_markup,
              (SELECT status FROM taxi_bookings WHERE id = ?) AS current_status,
              (SELECT wallet_balance FROM taxi_drivers WHERE id = ?) AS wallet_balance,
              (SELECT id FROM taxi_bookings WHERE driver_id = ? AND status = 'assigned' LIMIT 1) AS active_booking_id
        `, [bookingId, bookingId, bookingId, bookingId, driverId, driverId]);

        const check = checks[0] || {};

        if (check.booking_fare === null || check.booking_fare === undefined) {
            return res.status(400).json({ error: 'Ride no longer available.' });
        }
        if (check.wallet_balance === null || check.wallet_balance === undefined) {
            return res.status(400).json({ error: 'Pilot not found.' });
        }
        if (check.active_booking_id !== null && check.active_booking_id !== undefined) {
            return res.status(400).json({ error: 'Ground Control: You already have an active mission locked in. Complete your current duty before accepting new targets.' });
        }

        const vendorMarkup = parseFloat(check.vendor_markup) || 0;
        const isVendorRide = check.vendor_id !== null && check.vendor_id !== undefined;

        // Fetch active commission config
        const [configRows] = await db.query("SELECT * FROM taxi_commission_configs WHERE status = 'active' ORDER BY version DESC LIMIT 1");
        const config = configRows[0] || {};
        
        let driverCommissionAmount = 0;
        if (config.driver_commission_type === 'fixed') {
            driverCommissionAmount = parseFloat(config.driver_commission_fixed) || 0;
        } else {
            const rawFare = parseFloat(String(check.booking_fare).replace(/[^0-9.]/g, '')) || 0;
            const drvPct = parseFloat(config.driver_commission_percent) || 0;
            driverCommissionAmount = (rawFare * drvPct) / 100;
        }

        let customerCommissionAmount = 0;
        if (config.customer_commission_type === 'fixed') {
            customerCommissionAmount = parseFloat(config.customer_commission_fixed) || 0;
        } else {
            const rawFare = parseFloat(String(check.booking_fare).replace(/[^0-9.]/g, '')) || 0;
            const custPct = parseFloat(config.customer_commission_percent) || 0;
            customerCommissionAmount = (rawFare * custPct) / 100;
        }

        // Feature Update: Customer commission is deducted at the END of the trip when the driver actually collects the cash.
        // Therefore, we only deduct the driver commission upfront during acceptance.
        const totalCommissionToDeduct = driverCommissionAmount; 
        console.log(`[ACCEPT DEBUG] Booking #${bookingId}: config version=${config.version}, drv_type=${config.driver_commission_type}, drv_fixed=${config.driver_commission_fixed}, cust_type=${config.customer_commission_type}, cust_fixed=${config.customer_commission_fixed} => drvAmt=${driverCommissionAmount}, custAmt=${customerCommissionAmount} (To be deducted at finish), totalUpfront=${totalCommissionToDeduct}`);

        // Minimum balance required: commission + vendor markup
        const requiredBalance = totalCommissionToDeduct + (isVendorRide ? vendorMarkup : 0);

        if (parseFloat(check.wallet_balance) < requiredBalance) {
            return res.status(400).json({ error: `Insufficient funds. Minimum wallet balance required to accept this ride is ₹${requiredBalance.toFixed(2)}.` });
        }

        // Atomic conditional update — accepts from both 'pending' (self-accept) and 'vendor_assigned' (vendor-dispatched)
        const isVendorDispatch = check.current_status === 'vendor_assigned';
        const [updateResult] = await db.query(
            'UPDATE taxi_bookings SET status = "assigned", driver_accept_required = 0, driver_id = ? WHERE id = ? AND status IN ("pending", "vendor_assigned") AND (driver_id = ? OR driver_id IS NULL)',
            [driverId, bookingId, driverId]
        );

        if (updateResult.affectedRows === 0) {
            return res.status(400).json({ error: 'Ride no longer available (accepted by another pilot).' });
        }

        // Deduct upfront commission from wallet
        if (totalCommissionToDeduct > 0) {
            await db.query('UPDATE taxi_drivers SET wallet_balance = wallet_balance - ? WHERE id = ?', [totalCommissionToDeduct, driverId]);
            console.log(`[FINANCE] Ride #B${bookingId} accepted by Driver #${driverId}. Deducted ₹${totalCommissionToDeduct.toFixed(2)} upfront commission.`);
        }

        // Fetch driver details & booking user_id and vendor_id to notify relevant parties
        const [[driverRow], [bookingRow]] = await Promise.all([
            db.query('SELECT name, phone, car_model, car_number FROM taxi_drivers WHERE id = ?', [driverId]),
            db.query('SELECT user_id, vendor_id, pickup_loc, drop_loc, fare FROM taxi_bookings WHERE id = ?', [bookingId])
        ]);
        const driverName = driverRow[0]?.name || 'Your Driver';
        const driverPhone = driverRow[0]?.phone || '';
        const carModel = driverRow[0]?.car_model || '';
        const carNumber = driverRow[0]?.car_number || '';
        const userId = bookingRow[0]?.user_id;
        const bookingVendorId = bookingRow[0]?.vendor_id;

        const acceptPayload = {
            bookingId: parseInt(bookingId),
            id: parseInt(bookingId),
            status: 'assigned',
            driverId: parseInt(driverId),
            driverName,
            driverPhone,
            carModel,
            carNumber,
            pickupLoc: bookingRow[0]?.pickup_loc || '',
            dropLoc: bookingRow[0]?.drop_loc || '',
            fare: bookingRow[0]?.fare || '0',
            ts: Date.now()
        };

        // 🔴 Socket.IO: Realtime instant updates to Customer, Driver, Admin, and Vendor panels
        if (userId) {
            emitEvent(`user:${userId}`, 'booking_confirmed', acceptPayload);
            emitEvent(`user:${userId}`, 'booking_status_update', acceptPayload);
        }
        // Notify vendor that driver accepted
        if (bookingVendorId && isVendorDispatch) {
            emitEvent(`vendor:${bookingVendorId}`, 'driver_accepted', { ...acceptPayload, vendorId: bookingVendorId, message: `Driver ${driverName} accepted the ride.` });
        }
        emitEvent(`driver:${driverId}`, 'booking_assigned', acceptPayload);
        emitEvent(`driver:${driverId}`, 'booking_status_update', acceptPayload);
        emitEvent(`booking:${bookingId}`, 'booking_status_update', acceptPayload);
        emitEvent('admin', 'booking_status_update', acceptPayload);
        io.emit('booking_status_update', acceptPayload);
        io.emit('booking_assigned', acceptPayload);

        // Immediately seed the driver's current location so passenger map works instantly
        if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
            try {
                await db.query(
                    'INSERT INTO taxi_ride_gps_logs (booking_id, latitude, longitude, accuracy, speed) VALUES (?, ?, ?, ?, ?)',
                    [bookingId, parseFloat(lat), parseFloat(lng), 0, 0]
                );
            } catch (e) { console.error('Failed to insert initial GPS on accept:', e); }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.3.0 Driver Cancel / Decline — For vendor-assigned rides or early cancellation
app.post('/api/bookings/driver-cancel', authenticateJWT, requireRole(['driver']), async (req, res) => {
    try {
        const { bookingId, reason } = req.body;
        const driverId = req.user.id;

        // Fetch booking details first
        const [rows] = await db.query(
            'SELECT id, status, vendor_id, user_id, driver_id, pickup_loc, drop_loc, fare FROM taxi_bookings WHERE id = ? AND driver_id = ?',
            [bookingId, driverId]
        );
        if (!rows.length) {
            return res.status(404).json({ error: 'Booking not found or not assigned to you.' });
        }
        const booking = rows[0];
        const allowedStatuses = ['vendor_assigned', 'assigned', 'pending_vendor_assignment'];
        if (!allowedStatuses.includes(booking.status)) {
            return res.status(400).json({ error: 'Cannot cancel a ride that is already ongoing or completed.' });
        }

        // Get driver name for notifications
        const [driverRows] = await db.query('SELECT name FROM taxi_drivers WHERE id = ?', [driverId]);
        const driverName = driverRows[0]?.name || 'Driver';

        // Reset booking back to pending_vendor_assignment (vendor can re-assign) or cancelled
        const newStatus = booking.vendor_id ? 'pending_vendor_assignment' : 'cancelled';
        await db.query(
            'UPDATE taxi_bookings SET status = ?, driver_id = NULL, driver_accept_required = 0, cancel_reason = ? WHERE id = ?',
            [newStatus, reason || 'Driver declined', bookingId]
        );

        // Notify vendor of driver cancellation
        if (booking.vendor_id) {
            emitEvent(`vendor:${booking.vendor_id}`, 'driver_cancelled', {
                bookingId: parseInt(bookingId),
                driverId,
                driverName,
                pickup: booking.pickup_loc,
                drop: booking.drop_loc,
                fare: booking.fare,
                reason: reason || 'Driver declined the ride',
                status: newStatus,
                ts: Date.now()
            });
            emitEvent('admin', 'booking_status_update', { bookingId: parseInt(bookingId), status: newStatus, driverName, reason });
        }

        // Notify customer if applicable
        if (booking.user_id) {
            emitEvent(`user:${booking.user_id}`, 'booking_status_update', { bookingId: parseInt(bookingId), status: 'cancelled', message: 'Your driver cancelled. Please wait for reassignment.' });
        }

        console.log(`[DRIVER CANCEL] Driver #${driverId} (${driverName}) cancelled Booking #B${bookingId}. New status: ${newStatus}`);
        res.json({ success: true, newStatus });
    } catch (err) {
        console.error('[driver-cancel error]', err);
        res.status(500).json({ error: err.message });
    }
});

// 2.3.1 Request Cancellation (Driver Action)
app.post('/api/driver/request-cancel', authenticateJWT, requireRole(['driver']), (req, res, next) => {
    if (req.user.id !== parseInt(req.body.driverId)) {
        return res.status(403).json({ error: 'Access Denied: Driver ID mismatch.' });
    }
    next();
}, async (req, res) => {
    try {
        const { bookingId, driverId, reason } = req.body;
        const [bookings] = await db.query('SELECT * FROM taxi_bookings WHERE id = ? AND driver_id = ?', [bookingId, driverId]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Mission not found.' });
        if (bookings[0].status !== 'assigned') return res.status(400).json({ error: 'Only assigned missions can be aborted.' });

        await db.query('UPDATE taxi_bookings SET status = "pending", driver_id = NULL, driver_accept_required = 0, cancel_reason = ? WHERE id = ?', [reason || 'Driver cancelled directly', bookingId]);

        const bk = bookings[0];

        // Notify customer that it's searching again
        if (bk.user_id) {
            emitEvent(`user:${bk.user_id}`, 'booking_status_update', { bookingId: parseInt(bookingId), status: 'pending', message: 'Your driver cancelled. We are searching for a new driver.' });
        }
        
        // Notify admin
        emitEvent('admin', 'booking_status_update', { bookingId: parseInt(bookingId), status: 'pending', reason: reason || 'Driver cancelled directly' });

        // Clean up GPS state cache for the cancelled driver
        activeRidesGpsState.delete(bookingId);

        // Broadcast to all drivers again as a new opportunity
        const newBookingPayload = {
            bookingId: bk.id,
            pickup: bk.pickup_loc,
            drop: bk.drop_loc,
            fare: bk.fare,
            distance: bk.distance,
            vehicleType: bk.vehicle_type,
            tripType: bk.trip_type,
            passengers: bk.passengers,
            seatingCapacity: bk.passengers,
            status: 'pending',
            airDistanceBoostKm: bk.air_distance_boost_km,
            pickupIncentiveFare: bk.pickup_incentive_fare
        };
        emitEvent('drivers', 'new_opportunity', newBookingPayload);
        emitEvent('admin', 'new_opportunity', newBookingPayload);

        res.json({ success: true, message: 'Ride cancelled and returned to pending pool.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.3.1.5 Reject Ride Ping (Driver Action)
app.post('/api/drivers/reject-ride', authenticateJWT, requireRole(['driver']), (req, res, next) => {
    if (req.user.id !== parseInt(req.body.driverId)) {
        return res.status(403).json({ error: 'Access Denied: Driver ID mismatch.' });
    }
    next();
}, async (req, res) => {
    try {
        const { bookingId, driverId } = req.body;
        // In the future, we can insert into taxi_driver_ping_rejections to prevent re-pinging
        // For now, simply acknowledge the rejection so the frontend doesn't throw a 404
        res.json({ success: true, message: 'Ping rejected.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.3.2 Approve Cancellation (Admin Action)
app.post('/api/admin/approve-cancel', async (req, res) => {
    try {
        const { bookingId } = req.body;
        await db.query('UPDATE taxi_bookings SET status = "cancelled", driver_id = NULL WHERE id = ?', [bookingId]);
        // Clean up GPS state cache to prevent memory leaks
        activeRidesGpsState.delete(bookingId);
        res.json({ success: true, message: 'Mission officially aborted.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.3.3 Reject Cancellation (Admin Action)
app.post('/api/admin/reject-cancel', async (req, res) => {
    try {
        const { bookingId, note } = req.body;
        const [bookings] = await db.query('SELECT driver_id, cancel_reason FROM taxi_bookings WHERE id = ?', [bookingId]);
        if (bookings.length > 0) {
            await db.query('INSERT INTO abort_rejections (booking_id, driver_id, original_reason, admin_note) VALUES (?, ?, ?, ?)',
                [bookingId, bookings[0].driver_id, bookings[0].cancel_reason, note || 'Rejected by Admin Control']);
        }
        await db.query('UPDATE taxi_bookings SET status = "assigned" WHERE id = ?', [bookingId]);
        res.json({ success: true, message: 'Cancellation rejected. Mission remains active.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.3.4 Abort Rejection History (Admin Action)
app.get('/api/admin/rejection-history', async (req, res) => {
    try {
        const sql = `
            SELECT r.*, d.name as driver_name, b.pickup_loc, b.drop_loc 
            FROM abort_rejections r
            LEFT JOIN taxi_drivers d ON r.driver_id = d.id
            LEFT JOIN taxi_bookings b ON r.booking_id = b.id
            ORDER BY r.created_at DESC
        `;
        const [rows] = await db.query(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2.4 Driver Current Jobs
app.get('/api/driver/my-jobs/:driverId', authenticateJWT, (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.driverId)) {
        return res.status(403).json({ error: 'Access Denied: You cannot view another pilot\'s jobs.' });
    }
    next();
}, async (req, res) => {
    try {
        const sql = `
            SELECT b.*, 
                   TIMESTAMPDIFF(SECOND, b.journey_start_time, NOW()) as journey_elapsed_seconds,
                   TIMESTAMPDIFF(SECOND, b.reached_pickup_time, NOW()) as reached_elapsed_seconds,
                   COALESCE(b.passenger_name, u.name, tu.name) as customer_name, 
                   COALESCE(b.passenger_phone, u.phone, tu.phone) as customer_phone 
            FROM taxi_bookings b 
            LEFT JOIN passengers u ON b.user_id = u.id 
            LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
            WHERE b.driver_id = ? AND b.status IN ('assigned', 'ongoing', 'finished', 'completed', 'cancel_requested')
            ORDER BY b.created_at DESC
        `;
        const [rows] = await db.query(sql, [req.params.driverId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// 3. Admin Panel Stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const [
            [totalBookings],
            [activeBookings],
            [totalRevenue],
            [driverCount],
            [userCount],
            [pendingPilotsCount],
            [pendingMissionsCount],
            [cancelRequestsCount]
        ] = await Promise.all([
            db.query("SELECT COUNT(*) as count FROM taxi_bookings"),
            db.query("SELECT COUNT(*) as count FROM taxi_bookings WHERE status IN ('pending', 'assigned')"),
            db.query("SELECT fare FROM taxi_bookings WHERE status = 'completed'"),
            db.query("SELECT COUNT(*) as count FROM taxi_drivers"),
            db.query("SELECT COUNT(*) as count FROM passengers"),
            db.query("SELECT COUNT(*) as count FROM taxi_driver_applications WHERE status = 'pending'"),
            db.query("SELECT COUNT(*) as count FROM taxi_bookings WHERE status = 'pending'"),
            db.query("SELECT COUNT(*) as count FROM taxi_bookings WHERE status = 'cancel_requested'"),
            db.query("SELECT COUNT(*) as count FROM taxi_bookings WHERE status IN ('completed', 'finished') AND DATE(created_at) = CURDATE()")
        ]);

        let revenue = 0;
        let completedCount = 0;
        totalRevenue.forEach(row => {
            completedCount++;
            if (row.fare) {
                // Remove non-numeric characters except dot
                const numericFare = row.fare.toString().replace(/[^0-9.]/g, '');
                revenue += parseFloat(numericFare) || 0;
            }
        });
        
        // Admin daily profit is ₹5 platform fee collected per completed ride today
        const todayCompletedCount = arguments[0][8][0].count || 0; // The 9th query result
        const dailyProfit = todayCompletedCount * 5; 

        res.json({
            totalBookings: totalBookings[0].count,
            activeBookings: activeBookings[0].count,
            revenue: Math.round(revenue * 100) / 100, // Round to 2 decimal places
            profit: dailyProfit,
            totalDrivers: driverCount[0].count,
            totalUsers: userCount[0].count,
            pendingPilots: pendingPilotsCount[0].count,
            pendingMissions: pendingMissionsCount[0].count,
            cancelRequests: cancelRequestsCount[0].count
        });
    } catch (err) {
        console.error('CRITICAL: Admin Stats Failure:', err.message);
        // If it's a connection error, try to return 0s instead of crashing if possible, 
        // but for now, we just return 500 with a better message
        res.status(500).json({ error: 'Data Fetching Failed', details: err.message });
    }
});

// 3.1 Detailed Bookings for Admin
app.get('/api/admin/bookings', async (req, res) => {
    try {
        const sql = `
            SELECT b.*, 
                   COALESCE(b.passenger_name, u.name, tu.name) as customer_name, 
                   COALESCE(b.passenger_phone, u.phone, tu.phone) as customer_phone, 
                   d.name as driver_name, d.car_model, d.car_number, d.phone as driver_phone,
                   v.business_name as vendor_business_name
            FROM taxi_bookings b
            LEFT JOIN passengers u ON b.user_id = u.id
            LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id
            LEFT JOIN taxi_vendors v ON b.vendor_id = v.id
            ORDER BY b.created_at DESC
        `;
        const [rows] = await db.query(sql);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.2 Member Management
app.get('/api/admin/users', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, name, email, phone, 'user' as role, is_blocked, created_at FROM passengers ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.2.1 Fleet Management
app.get('/api/admin/drivers', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT d.id, d.name, d.email, d.phone, 'driver' as role, d.car_model, d.car_number, d.vehicle_type, d.seating_capacity, d.wallet_balance, d.is_blocked, d.approval_status, d.association_id, d.district, d.association_id_card, COALESCE(a.name, d.association_name, 'CityRide Driver (Independent)') as association_name, d.created_at 
            FROM taxi_drivers d 
            LEFT JOIN taxi_associations a ON d.association_id = a.id 
            ORDER BY d.created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Live Fleet GPS Radar Locations
app.post('/api/driver/status', authenticateJWT, requireRole(['driver']), async (req, res) => {
    try {
        const { is_online, latitude, longitude } = req.body;
        const driverId = req.user.id;
        
        let sql = 'UPDATE taxi_drivers SET last_seen = NOW()';
        const params = [];
        
        if (is_online !== undefined) {
            sql += ', is_online = ?';
            params.push(is_online ? 1 : 0);
        }
        
        if (latitude !== undefined && longitude !== undefined) {
            sql += ', latitude = ?, longitude = ?';
            params.push(latitude, longitude);
        }
        
        sql += ' WHERE id = ?';
        params.push(driverId);
        
        await db.query(sql, params);
        res.json({ success: true });
    } catch (err) {
        console.error('Driver status update error:', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.get('/api/admin/live-fleet', async (req, res) => {
    try {
        const [drivers] = await db.query(`
            SELECT id, name, phone, car_model, car_number, vehicle_type, COALESCE(is_online, 0) as is_online, COALESCE(is_blocked, 0) as is_blocked, latitude, longitude, last_seen
            FROM taxi_drivers
        `);
        res.json(drivers || []);
    } catch (err) {
        console.error("Live Fleet Fetch Error:", err.message);
        res.json([]);
    }
});

// Emergency SOS Alerts Endpoints
app.get('/api/admin/sos-alerts', async (req, res) => {
    try {
        const [alerts] = await db.query('SELECT * FROM taxi_sos_alerts ORDER BY created_at DESC LIMIT 50');
        res.json(alerts || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/sos-alerts/resolve', async (req, res) => {
    try {
        const { id, notes } = req.body;
        if (!id) return res.status(400).json({ error: 'Alert ID required' });
        await db.query('UPDATE taxi_sos_alerts SET status = "resolved", resolution_notes = ? WHERE id = ?', [notes || 'Resolved by admin', id]);
        res.json({ success: true, message: 'SOS Alert marked as resolved.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dynamic Surge Pricing Endpoints
app.get('/api/admin/surge-config', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_surge_config');
        res.json(rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/surge-config/update', async (req, res) => {
    try {
        const { surge_key, multiplier, is_active } = req.body;
        if (!surge_key) return res.status(400).json({ error: 'surge_key required' });
        await db.query(
            'UPDATE taxi_surge_config SET multiplier = ?, is_active = ? WHERE surge_key = ?',
            [parseFloat(multiplier) || 1.0, is_active ? 1 : 0, surge_key]
        );
        res.json({ success: true, message: 'Surge pricing rule updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Wallet Transaction Credit/Debit
app.post('/api/admin/driver/wallet-transaction', async (req, res) => {
    try {
        const { id, type, amount, note, updatedBy } = req.body;
        const numAmount = parseFloat(amount);
        if (!id || isNaN(numAmount) || numAmount <= 0) {
            return res.status(400).json({ error: 'Valid driver ID and positive amount are required.' });
        }
        const delta = type === 'debit' ? -numAmount : numAmount;
        await db.query('UPDATE taxi_drivers SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?', [delta, id]);
        
        try {
            await db.query(
                `INSERT INTO wallet_transactions (driver_id, type, amount, note, updated_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
                [id, type === 'debit' ? 'debit' : 'credit', numAmount, note || 'Admin Adjustment', updatedBy || 'System Admin']
            );
        } catch (e) {
            console.error('Failed to log wallet transaction:', e);
        }
        res.json({ success: true, message: `Wallet ${type === 'debit' ? 'debited' : 'credited'} successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/driver/wallet-transactions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await db.query(
            'SELECT type, amount, note, updated_by, created_at FROM wallet_transactions WHERE driver_id = ? ORDER BY created_at DESC LIMIT 50',
            [id]
        );
        res.json({ success: true, transactions: rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch wallet history' });
    }
});

// Manual Ride Dispatch Assignment
app.post('/api/admin/driver/assign', async (req, res) => {
    try {
        const { bookingId, driverId } = req.body;
        if (!bookingId || !driverId) return res.status(400).json({ error: 'bookingId and driverId required.' });
        const [driver] = await db.query('SELECT name, phone FROM taxi_drivers WHERE id = ?', [driverId]);
        if (driver.length === 0) return res.status(404).json({ error: 'Driver not found.' });
        
        await db.query('UPDATE taxi_bookings SET driver_id = ?, driver_name = ?, status = "assigned" WHERE id = ?', [driverId, driver[0].name, bookingId]);
        
        if (io) {
            io.to(`driver:${driverId}`).emit('new_booking_assigned', { bookingId });
            io.to(`booking:${bookingId}`).emit('status_change', { status: 'assigned', driverName: driver[0].name });
        }
        
        res.json({ success: true, message: 'Driver assigned successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/driver/:id', async (req, res) => {
    try {
        const [drivers] = await db.query('SELECT * FROM taxi_drivers WHERE id = ?', [req.params.id]);
        if (drivers.length > 0) {
            const driver = drivers[0];
            delete driver.password;
            res.json({ success: true, driver: driver });
        } else {
            res.status(404).json({ error: 'Driver not found.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.3 Delete Operations
app.post('/api/admin/delete-passenger', async (req, res) => {
    try {
        await db.query("DELETE FROM passengers WHERE id = ?", [req.body.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/delete-driver', async (req, res) => {
    try {
        await db.query("DELETE FROM taxi_drivers WHERE id = ?", [req.body.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/update-user', async (req, res) => {
    try {
        const { id, name, email, phone, password } = req.body;

        let sql = 'UPDATE passengers SET name = ?, email = ?, phone = ?';
        let params = [name, email, phone];

        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            sql += ', password = ?';
            params.push(hashedPassword);
        }

        sql += ' WHERE id = ?';
        params.push(id);

        await db.query(sql, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.4 Registry Updates
app.post('/api/admin/update-driver', async (req, res) => {
    try {
        const { id, name, email, phone, car_model, car_number, vehicle_type, seating_capacity, password } = req.body;

        let sql = 'UPDATE taxi_drivers SET name = ?, email = ?, phone = ?, car_model = ?, car_number = ?, vehicle_type = ?, seating_capacity = ?';
        let params = [name, email, phone, car_model, car_number, vehicle_type, parseInt(seating_capacity) || 5];

        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            sql += ', password = ?';
            params.push(hashedPassword);
        }

        sql += ' WHERE id = ?';
        params.push(id);

        await db.query(sql, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.4.1 Wallet Update
app.post('/api/admin/update-driver-wallet', async (req, res) => {
    try {
        await db.query('UPDATE taxi_drivers SET wallet_balance = ? WHERE id = ?', [req.body.wallet_balance, req.body.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3.4.1.2 Credentials Reset (Driver)
app.post('/api/admin/update-driver-password', async (req, res) => {
    try {
        const { id, password } = req.body;
        if (!id || !password) return res.status(400).json({ error: 'ID and password are required.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.query('UPDATE taxi_drivers SET password = ? WHERE id = ?', [hashedPassword, id]);
        res.json({ success: true, message: 'Driver password updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update driver password.' });
    }
});

// 3.4.1.3 Credentials Reset (Passenger)
app.post('/api/admin/update-passenger-password', async (req, res) => {
    try {
        const { id, password } = req.body;
        if (!id || !password) return res.status(400).json({ error: 'ID and password are required.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await db.query('UPDATE passengers SET password = ? WHERE id = ?', [hashedPassword, id]);
        res.json({ success: true, message: 'Passenger password updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update passenger password.' });
    }
});

// 3.4.2 Block/Unblock Operations
app.post('/api/admin/toggle-block', async (req, res) => {
    try {
        const { id, type, status } = req.body;
        const table = type === 'user' ? 'passengers' : 'taxi_drivers';
        await db.query(`UPDATE ${table} SET is_blocked = ? WHERE id = ?`, [status, id]);
        res.json({ success: true, message: `Access ${status ? 'Revoked' : 'Restored'} successfully.` });
    } catch (err) {
        res.status(500).json({ error: 'Command Failure' });
    }
});

// 3.5 Induct Pilot
app.post('/api/admin/create-driver', async (req, res) => {
    try {
        const { name, email, password, phone, car_model, car_number, vehicle_type, seating_capacity, association_id } = req.body;
        const [existing] = await db.query('SELECT id FROM taxi_drivers WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Pilot email already authorized.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const assocIdVal = association_id ? parseInt(association_id) : null;
        const sql = 'INSERT INTO taxi_drivers (name, email, password, phone, car_model, car_number, vehicle_type, seating_capacity, association_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        await db.query(sql, [name, email, hashedPassword, phone, car_model, car_number, vehicle_type, parseInt(seating_capacity) || 5, assocIdVal]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Pilot Induction failed.' });
    }
});

// 3.6 Vendor Partner Management
app.get('/api/test-vendors', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, vendor_id, name, business_name, email, phone, is_blocked, created_at FROM taxi_vendors ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        console.error('API Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/vendors', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, vendor_id, name, business_name, email, phone, is_blocked, created_at FROM taxi_vendors ORDER BY created_at DESC");
        res.json(rows);
    } catch (err) {
        console.error('Error fetching vendors:', err);
        res.status(500).json({ error: 'Failed to fetch partners.' });
    }
});

app.post('/api/admin/create-vendor', async (req, res) => {
    try {
        const { vendor_id, name, business_name, email, password, phone } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const [existing] = await db.query('SELECT id FROM taxi_vendors WHERE vendor_id = ? OR email = ?', [vendor_id, email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Partner ID or Email already exists.' });

        const sql = 'INSERT INTO taxi_vendors (vendor_id, name, business_name, email, password, phone) VALUES (?, ?, ?, ?, ?, ?)';
        await db.query(sql, [vendor_id, name, business_name, email, hashedPassword, phone]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Partner Induction failed.' });
    }
});

app.post('/api/admin/update-vendor', async (req, res) => {
    try {
        const { id, vendor_id, name, business_name, email, password, phone, is_blocked } = req.body;

        const [existing] = await db.query('SELECT id FROM taxi_vendors WHERE (vendor_id = ? OR email = ?) AND id != ?', [vendor_id, email, id]);
        if (existing.length > 0) return res.status(400).json({ error: 'Partner ID or Email already exists on another account.' });

        let sql = 'UPDATE taxi_vendors SET vendor_id = ?, name = ?, business_name = ?, email = ?, phone = ?, is_blocked = ?';
        let params = [vendor_id, name, business_name, email, phone, is_blocked];

        if (password && password.trim() !== "") {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            sql += ', password = ?';
            params.push(hashedPassword);
        }

        sql += ' WHERE id = ?';
        params.push(id);

        await db.query(sql, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/delete-vendor', async (req, res) => {
    try {
        await db.query("DELETE FROM taxi_vendors WHERE id = ?", [req.body.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Public Association List for Driver Registration
app.get('/api/public/associations', async (req, res) => {
    try {
        const { city } = req.query;
        let sql = 'SELECT id, name, city_name FROM taxi_associations WHERE is_active = 1';
        let params = [];
        if (city && city.trim() !== '') {
            sql += " AND (city_name = ? OR city_name IS NULL OR city_name = '')";
            params.push(city.trim());
        }
        sql += ' ORDER BY name ASC';
        const [rows] = await db.query(sql, params);
        res.json(rows || []);
    } catch (e) {
        res.json([]);
    }
});

// --- ASSOCIATION ADMIN ROUTES ---
app.get('/api/admin/associations', async (req, res) => {
    try {
        const sql = `
            SELECT a.*, COALESCE(w.balance, 0) as balance 
            FROM taxi_associations a
            LEFT JOIN taxi_association_wallets w ON a.id = w.association_id
            ORDER BY a.created_at DESC
        `;
        const [rows] = await db.query(sql);
        res.json(rows || []);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch associations.' });
    }
});

app.post('/api/admin/associations/:id/commission', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { custPct, drvPct, custFixed, drvFixed } = req.body;
        
        await db.query(`
            UPDATE taxi_associations 
            SET commission_customer_pct = ?, commission_driver_pct = ?, commission_customer_fixed = ?, commission_driver_fixed = ?
            WHERE id = ?
        `, [custPct || 0, drvPct || 0, custFixed || 0, drvFixed || 0, id]);
        
        res.json({ success: true, message: 'Association commission rules updated successfully.' });
    } catch (err) {
        console.error("Error updating association commission rules:", err);
        res.status(500).json({ error: 'Database update failed.' });
    }
});

// --- SYSTEM REPORTS & ANALYTICS ROUTES ---
app.get('/api/admin/reports/associations', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateFilter = '';
        let queryParams = [];
        if (startDate && endDate) {
            dateFilter = ' AND b.created_at BETWEEN ? AND ?';
            queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const sql = `
            SELECT 
                a.id,
                a.name,
                a.city_name,
                a.commission_type,
                a.commission_value,
                a.is_active,
                COALESCE(w.balance, 0) as wallet_balance,
                COUNT(DISTINCT d.id) as total_drivers,
                COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_rides,
                COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.id END) as cancelled_rides,
                COALESCE(SUM(CASE WHEN b.status = 'completed' THEN CAST(REPLACE(REPLACE(b.fare, '\u20B9', ''), ',', '') AS DECIMAL(10,2)) ELSE 0 END), 0) as total_revenue
            FROM taxi_associations a
            LEFT JOIN taxi_association_wallets w ON a.id = w.association_id
            LEFT JOIN taxi_drivers d ON a.id = d.association_id
            LEFT JOIN taxi_bookings b ON d.id = b.driver_id ${dateFilter}
            GROUP BY a.id, a.name, a.city_name, a.commission_type, a.commission_value, a.is_active, w.balance
            ORDER BY total_revenue DESC
        `;
        const [rows] = await db.query(sql, queryParams);
        res.json(rows);
    } catch (err) {
        console.error('Reports Associations Error:', err);
        res.status(500).json({ error: 'Failed to fetch association report data.' });
    }
});

app.get('/api/admin/reports/vehicles', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateFilter = '';
        let queryParams = [];
        if (startDate && endDate) {
            dateFilter = ' AND b.created_at BETWEEN ? AND ?';
            queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        const sql = `
            SELECT 
                v_types.vehicle_type,
                COUNT(DISTINCT d.id) as registered_drivers,
                COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_rides,
                COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.id END) as cancelled_rides,
                COUNT(DISTINCT b.id) as total_bookings,
                COALESCE(SUM(CASE WHEN b.status = 'completed' THEN CAST(REPLACE(REPLACE(b.fare, '\u20B9', ''), ',', '') AS DECIMAL(10,2)) ELSE 0 END), 0) as total_revenue
            FROM (
                SELECT 'bike' as vehicle_type UNION 
                SELECT 'auto' UNION 
                SELECT 'hatchback' UNION 
                SELECT 'sedan' UNION 
                SELECT 'suv' UNION 
                SELECT '8plus1' UNION 
                SELECT 'van24'
            ) v_types
            LEFT JOIN taxi_drivers d ON LOWER(d.vehicle_type) = v_types.vehicle_type
            LEFT JOIN taxi_bookings b ON (LOWER(b.vehicle_type) = v_types.vehicle_type OR b.driver_id = d.id) ${dateFilter}
            GROUP BY v_types.vehicle_type
            ORDER BY total_revenue DESC
        `;
        const [rows] = await db.query(sql, queryParams);
        res.json(rows);
    } catch (err) {
        console.error('Reports Vehicles Error:', err);
        res.status(500).json({ error: 'Failed to fetch vehicle report data.' });
    }
});

app.get('/api/admin/reports/drivers', async (req, res) => {
    try {
        const { startDate, endDate, association_id, vehicle_type } = req.query;
        let whereClauses = [];
        let queryParams = [];

        if (startDate && endDate) {
            whereClauses.push('b.created_at BETWEEN ? AND ?');
            queryParams.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        if (association_id) {
            whereClauses.push('d.association_id = ?');
            queryParams.push(association_id);
        }

        if (vehicle_type) {
            whereClauses.push('LOWER(d.vehicle_type) = ?');
            queryParams.push(vehicle_type.toLowerCase());
        }

        let dateFilterOnJoin = whereClauses.length > 0 ? ` AND ${whereClauses.join(' AND ')}` : '';

        const sql = `
            SELECT 
                d.id as driver_id,
                d.name as driver_name,
                d.phone,
                d.car_model,
                d.car_number,
                COALESCE(d.vehicle_type, 'sedan') as vehicle_type,
                COALESCE(d.wallet_balance, 0) as wallet_balance,
                d.approval_status,
                d.is_blocked,
                COALESCE(a.name, 'Direct Platform') as association_name,
                COALESCE(a.city_name, 'All Region') as association_city,
                COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_rides,
                COUNT(DISTINCT CASE WHEN b.status = 'cancelled' THEN b.id END) as cancelled_rides,
                COUNT(DISTINCT b.id) as total_assigned_missions,
                COALESCE(SUM(CASE WHEN b.status = 'completed' THEN CAST(REPLACE(REPLACE(b.fare, '\u20B9', ''), ',', '') AS DECIMAL(10,2)) ELSE 0 END), 0) as total_earnings
            FROM taxi_drivers d
            LEFT JOIN taxi_associations a ON d.association_id = a.id
            LEFT JOIN taxi_bookings b ON d.id = b.driver_id ${dateFilterOnJoin}
            GROUP BY d.id, d.name, d.phone, d.car_model, d.car_number, d.vehicle_type, d.wallet_balance, d.approval_status, d.is_blocked, a.name, a.city_name
            ORDER BY total_earnings DESC, completed_rides DESC
        `;
        const [rows] = await db.query(sql, queryParams);
        res.json(rows);
    } catch (err) {
        console.error('Reports Drivers Error:', err);
        res.status(500).json({ error: 'Failed to fetch driver report data.' });
    }
});

app.post('/api/admin/create-association', async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const { name, city_name, admin_username, admin_password, commission_type, commission_value } = req.body;
        
        if (!name || !admin_username || !admin_password) {
            await conn.rollback();
            conn.release();
            return res.status(400).json({ error: 'Name, admin username, and password are required.' });
        }

        const [existing] = await conn.query('SELECT id FROM taxi_associations WHERE admin_username = ?', [admin_username]);
        if (existing.length > 0) {
            await conn.rollback();
            conn.release();
            return res.status(400).json({ error: 'Admin username is already taken. Please choose a different username.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(admin_password, salt);

        const sql = 'INSERT INTO taxi_associations (name, city_name, admin_username, admin_password, commission_type, commission_value) VALUES (?, ?, ?, ?, ?, ?)';
        const [result] = await conn.query(sql, [name, city_name || '', admin_username, hashedPassword, commission_type || 'fixed', commission_value || 0]);
        
        const newId = result.insertId;
        await conn.query('INSERT INTO taxi_association_wallets (association_id, balance) VALUES (?, 0)', [newId]);
        
        await conn.commit();
        res.json({ success: true, id: newId });
    } catch (err) {
        await conn.rollback();
        res.status(400).json({ error: err.message || 'Failed to create association.' });
    } finally {
        conn.release();
    }
});

app.post('/api/admin/update-association', async (req, res) => {
    try {
        const { id, name, city_name, commission_type, commission_value, is_active, admin_username, admin_password, radius_km } = req.body;
        if (!id) return res.status(400).json({ error: 'id is required.' });

        // Check username uniqueness if changing
        if (admin_username) {
            const [existing] = await db.query('SELECT id FROM taxi_associations WHERE admin_username = ? AND id != ?', [admin_username, id]);
            if (existing.length > 0) return res.status(400).json({ error: 'That admin username is already taken.' });
        }

        const fields = [];
        const params = [];
        if (name !== undefined)             { fields.push('name = ?');             params.push(name); }
        if (city_name !== undefined)        { fields.push('city_name = ?');        params.push(city_name); }
        if (commission_type !== undefined)  { fields.push('commission_type = ?');  params.push(commission_type); }
        if (commission_value !== undefined) { fields.push('commission_value = ?'); params.push(commission_value); }
        if (is_active !== undefined)        { fields.push('is_active = ?');        params.push(is_active ? 1 : 0); }
        if (radius_km !== undefined)        { fields.push('radius_km = ?');        params.push(radius_km); }
        if (admin_username !== undefined)   { fields.push('admin_username = ?');   params.push(admin_username); }

        if (admin_password && admin_password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            fields.push('admin_password = ?');
            params.push(await bcrypt.hash(admin_password.trim(), salt));
        }
        if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });
        params.push(id);
        await db.query(`UPDATE taxi_associations SET ${fields.join(', ')} WHERE id = ?`, params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Toggle Association Active/Inactive (Admin Only)
app.post('/api/admin/toggle-association', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'id required.' });
        const [rows] = await db.query('SELECT is_active FROM taxi_associations WHERE id = ?', [id]);
        if (!rows.length) return res.status(404).json({ error: 'Not found.' });
        const newStatus = rows[0].is_active ? 0 : 1;
        await db.query('UPDATE taxi_associations SET is_active = ? WHERE id = ?', [newStatus, id]);
        res.json({ success: true, is_active: newStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Association (Admin Only) — unlinks all drivers, purges wallet & tariff records
app.delete('/api/admin/delete-association/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
        const { id } = req.params;
        await conn.beginTransaction();
        await conn.query('UPDATE taxi_drivers SET association_id = NULL WHERE association_id = ?', [id]);
        await conn.query('DELETE FROM taxi_association_wallets WHERE association_id = ?', [id]);
        await conn.query('DELETE FROM taxi_association_wallet_transactions WHERE association_id = ?', [id]);
        await conn.query('DELETE FROM taxi_association_tariffs WHERE association_id = ?', [id]);
        await conn.query('DELETE FROM taxi_associations WHERE id = ?', [id]);
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.get('/api/driver/jobs/:driverId', async (req, res) => {
    try {
        const [driverRows] = await db.query('SELECT vehicle_type, seating_capacity, pref_loc_1, pref_loc_2, pref_loc_3, ride_local, ride_oneway, ride_round FROM taxi_drivers WHERE id = ?', [req.params.driverId]);
        if (driverRows.length === 0) return res.status(404).json({ error: 'Driver not found' });

        const driver = driverRows[0];
        const driverVehicleType = driver.vehicle_type;
        const driverSeatingCapacity = driver.seating_capacity || 5;
        const driverHasAllRideTypes = (driver.ride_local === 1 && driver.ride_oneway === 1 && driver.ride_round === 1);
        const prefLocations = [driver.pref_loc_1, driver.pref_loc_2, driver.pref_loc_3]
            .filter(Boolean)
            .map(loc => loc.toLowerCase().trim());

        const sql = `
            SELECT b.*, 
                   COALESCE(u.name, tu.name) as customer_name, 
                   COALESCE(u.phone, tu.phone) as customer_phone 
            FROM taxi_bookings b 
            LEFT JOIN passengers u ON b.user_id = u.id 
            LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
            WHERE b.status = 'pending' AND b.vehicle_type = ? AND (b.passengers IS NULL OR b.passengers = 0 OR b.passengers <= ?)
            ORDER BY b.created_at ASC
        `;
        const [rows] = await db.query(sql, [driverVehicleType, driverSeatingCapacity]);

        // --- Air Distance Restriction ---
        // Check if the admin has enabled this feature
        const [settingRows] = await db.query(
            "SELECT setting_key, setting_value FROM taxi_settings WHERE setting_key IN ('air_distance_restrict', 'air_distance_local_km', 'air_distance_outstation_km')"
        );

        let restrictEnabled = false;
        let localRadiusKm = 3;
        let outstationRadiusKm = 5;

        settingRows.forEach(row => {
            if (row.setting_key === 'air_distance_restrict' && row.setting_value === '1') restrictEnabled = true;
            if (row.setting_key === 'air_distance_local_km') localRadiusKm = parseFloat(row.setting_value) || 3;
            if (row.setting_key === 'air_distance_outstation_km') outstationRadiusKm = parseFloat(row.setting_value) || 5;
        });

        const driverLat = parseFloat(req.query.lat);
        const driverLng = parseFloat(req.query.lng);
        const driverLocationKnown = !isNaN(driverLat) && !isNaN(driverLng);

        // --- Driver Match Logic ---
        let resultRows = rows;

        if (!driverHasAllRideTypes) {
            // If missed any ride type, restrict ONLY to preferred locations (ignore air distance)
            resultRows = rows.filter(booking => {
                if (!booking.pickup_loc) return false;
                const pickupStr = booking.pickup_loc.toLowerCase();
                return prefLocations.some(loc => loc && pickupStr.includes(loc));
            });
            return res.json(resultRows);
        }

        // If selected ALL ride types, allow anywhere within air distance (plus single-ride temporary boost if added)
        if (restrictEnabled && driverLocationKnown) {
            resultRows = rows.filter(booking => {
                if (!booking.pickup_coords) return true; // No coords: always show
                const parts = booking.pickup_coords.split(',');
                if (parts.length < 2) return true;
                const pickupLng = parseFloat(parts[0]);
                const pickupLat = parseFloat(parts[1]);
                if (isNaN(pickupLat) || isNaN(pickupLng)) return true;

                const tripType = (booking.trip_type || '').toLowerCase();
                const baseRadiusKm = (tripType === 'local') ? localRadiusKm : outstationRadiusKm;
                const boostKm = parseFloat(booking.air_distance_boost_km || 0);
                const maxAllowedDist = baseRadiusKm + boostKm;

                const dist = getDistance(driverLat, driverLng, pickupLat, pickupLng);
                return dist <= maxAllowedDist;
            });
        }

        res.json(resultRows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4.4.1 Admin System Settings
app.get('/api/admin/settings', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_key, setting_value FROM taxi_settings');
        const settings = {};
        rows.forEach(r => {
            const key = r.setting_key;
            if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
                Reflect.set(settings, key, r.setting_value);
            }
        });
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- Promotional Offers APIs ---
app.get('/api/offers', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM taxi_offers 
            WHERE is_active = 1 
            AND (valid_until IS NULL OR valid_until > NOW())
            AND (total_uses_allowed IS NULL OR current_uses < total_uses_allowed)
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/offers', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_offers ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/offers', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const { 
            code, description, discount_type, discount_value, max_discount, 
            min_trip_amount, max_uses_per_user, total_uses_allowed, 
            valid_vehicle_types, valid_until 
        } = req.body;
        
        if (!code || !description || !discount_value) {
            return res.status(400).json({ error: 'Code, description, and discount value are required.' });
        }
        
        const sql = `
            INSERT INTO taxi_offers (
                code, description, discount_type, discount_value, max_discount, 
                min_trip_amount, max_uses_per_user, total_uses_allowed, 
                valid_vehicle_types, valid_until
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            code.toUpperCase(), 
            description, 
            discount_type || 'percentage', 
            parseFloat(discount_value) || 0,
            max_discount ? parseFloat(max_discount) : null,
            parseFloat(min_trip_amount) || 0,
            parseInt(max_uses_per_user) || 1,
            total_uses_allowed ? parseInt(total_uses_allowed) : null,
            valid_vehicle_types || 'ALL',
            valid_until || null
        ];

        await db.query(sql, values);
        res.json({ success: true, message: 'Offer created successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/offers/toggle', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const { id, is_active } = req.body;
        await db.query('UPDATE taxi_offers SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
        res.json({ success: true, message: 'Offer status updated.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/offers/:id', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        await db.query('DELETE FROM taxi_offers WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Offer deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Public / Driver Commission APIs ---
app.get('/api/commissions/active', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT * FROM taxi_commission_configs WHERE status = 'active' ORDER BY version DESC LIMIT 1");
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'No active commission configuration found.' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Admin Commission APIs ---
app.get('/api/admin/commissions', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_commission_configs ORDER BY version DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/commissions', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const {
            customer_commission_type,
            driver_commission_type,
            customer_commission_percent,
            driver_commission_percent,
            maintenance_percent,
            association_percent,
            cityride_percent,
            customer_commission_fixed,
            driver_commission_fixed,
            maintenance_fixed,
            association_fixed,
            cityride_fixed,
            effective_from
        } = req.body;

        const custType = customer_commission_type === 'fixed' ? 'fixed' : 'percentage';
        const drvType = driver_commission_type === 'fixed' ? 'fixed' : 'percentage';

        // Parse percentages
        const custPct = parseFloat(customer_commission_percent) || 0;
        const drvPct = parseFloat(driver_commission_percent) || 0;
        const totalPct = custPct + drvPct;
        const maintPct = parseFloat(maintenance_percent) || 0;
        const assocPct = parseFloat(association_percent) || 0;
        const cityPct = parseFloat(cityride_percent) || 0;

        // Parse fixed amounts
        const custFix = parseFloat(customer_commission_fixed) || 0;
        const drvFix = parseFloat(driver_commission_fixed) || 0;
        const totalFix = custFix + drvFix;
        const maintFix = parseFloat(maintenance_fixed) || 0;
        const assocFix = parseFloat(association_fixed) || 0;
        const cityFix = parseFloat(cityride_fixed) || 0;

        const effectiveDate = effective_from || new Date();

        // Check current version
        const [latestRows] = await db.query('SELECT version FROM taxi_commission_configs ORDER BY version DESC LIMIT 1');
        const nextVersion = latestRows.length > 0 ? latestRows[0].version + 1 : 1;

        if (latestRows.length > 0) {
            await db.query("UPDATE taxi_commission_configs SET status = 'archived', effective_to = NOW() WHERE status = 'active'");
        }

        await db.query(`
            INSERT INTO taxi_commission_configs 
            (version, customer_commission_type, driver_commission_type, customer_commission_percent, driver_commission_percent, total_commission_percent, maintenance_percent, association_percent, cityride_percent, customer_commission_fixed, driver_commission_fixed, total_commission_fixed, maintenance_fixed, association_fixed, cityride_fixed, effective_from, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            nextVersion, custType, drvType, custPct, drvPct, totalPct, maintPct, assocPct, cityPct, custFix, drvFix, totalFix, maintFix, assocFix, cityFix, effectiveDate, req.user.id
        ]);

        // Audit Log
        await db.query(`
            INSERT INTO taxi_audit_logs (admin_id, action, entity_type, entity_id, new_value, remark)
            VALUES (?, 'CREATE', 'COMMISSION_CONFIG', ?, ?, ?)
        `, [req.user.id, nextVersion, JSON.stringify(req.body), 'New commission configuration created']);

        res.json({ success: true, version: nextVersion });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/ledger', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const { district, association_id } = req.query;
        let query = `
            SELECT 
                b.id as booking_id,
                b.created_at,
                b.pickup_loc,
                b.drop_loc,
                b.distance,
                b.fare,
                b.status,
                d.district,
                a.id as association_id,
                a.name as association_name,
                COALESCE(b.vendor_markup, 0) as vendor_profit,
                (SELECT amount FROM taxi_association_wallet_transactions awt WHERE awt.booking_id = b.id LIMIT 1) as association_profit,
                5.00 as admin_profit
            FROM taxi_bookings b
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id
            LEFT JOIN taxi_associations a ON b.association_id = a.id
            WHERE b.status = 'finished'
        `;
        const params = [];
        if (district) {
            query += " AND d.district = ?";
            params.push(district);
        }
        if (association_id) {
            query += " AND b.association_id = ?";
            params.push(association_id);
        }
        query += " ORDER BY b.created_at DESC LIMIT 500";
        
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// -----------------------------

app.post('/api/admin/settings', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Setting key is required.' });
        await db.query(
            'INSERT INTO taxi_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
            [key, String(value)]
        );
        res.json({ success: true, message: `Setting "${key}" updated.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4.5 Transfer Ride (Admin Only)
app.post('/api/admin/transfer-ride', async (req, res) => {
    try {
        const { bookingId, newDriverId } = req.body;
        const [bookings] = await db.query('SELECT fare, status FROM taxi_bookings WHERE id = ?', [bookingId]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });

        await db.query('UPDATE taxi_bookings SET driver_id = ?, status = "assigned" WHERE id = ?', [newDriverId, bookingId]);

        res.json({ success: true, message: `Ride #B${bookingId} assigned/transferred successfully.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Helper for GPS distance calculation (Haversine formula)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ============================================================
// CENTRALIZED BUSINESS LOGIC HELPERS
// Global rule: Estimated Duration = Estimated Distance × 2 minutes
// Waiting rule: Allowed Duration = Trip Distance × 2 minutes (actual, not estimated)
// ============================================================

/**
 * Calculate estimated duration in minutes from distance.
 * Rule: 1 km = 2 minutes (global rule across all modules)
 * @param {number} distanceKm
 * @returns {number} minutes
 */
function calcEstimatedDurationMins(distanceKm) {
    return Math.ceil(parseFloat(distanceKm) || 0) * 2;
}

/**
 * Format duration minutes to human-readable string.
 * @param {number} mins
 * @returns {string} e.g. "20 min" or "1h 30m"
 */
function formatDurationMins(mins) {
    const m = Math.ceil(mins);
    if (m <= 0) return '0 min';
    if (m < 60) return `${m} min`;
    const hrs = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * Calculate waiting charge using ACTUAL trip distance (not estimated).
 * Rule: Allowed Duration = actualTripDistKm × 2 minutes
 *       Waiting Time = max(0, actualDurationMins - allowedMins)
 *       Charge = waitingMins × \u20B92/min
 * @param {number} actualTripDistKm - Actual odometer/GPS distance
 * @param {number} actualDurationMins - Actual ride duration in minutes
 * @returns {{ allowedMins: number, waitingMins: number, waitingCharge: number }}
 */
function calcWaitingCharge(actualTripDistKm, actualDurationMins) {
    const allowedMins = (parseFloat(actualTripDistKm) || 0) * 2;
    const waitingMins = Math.max(0, actualDurationMins - allowedMins);
    const waitingCharge = waitingMins * 2; // \u20B92 per minute
    return { allowedMins, waitingMins, waitingCharge };
}

/**
 * Parse a numeric value from a string that may include units like "\u20B9", "KM", etc.
 * @param {string|number} val
 * @returns {number}
 */
function parseNumeric(val) {
    if (val === null || val === undefined) return 0;
    return parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0;
}

// Retrieve or initialize the in-memory GPS Kalman filter state and cumulative distance for a booking
async function getOrInitGpsState(bookingId, startCoordsStr, journeyStartTime) {
    if (activeRidesGpsState.has(bookingId)) {
        return activeRidesGpsState.get(bookingId);
    }

    let actualDistKm = 0;
    let startCoords = startCoordsStr || null;
    if (startCoords === 'null,null') {
        startCoords = null;
    }

    // Fetch existing GPS logs in chronological order to reconstruct state
    const [gpsLogs] = await db.query(
        'SELECT latitude, longitude, accuracy, speed, created_at FROM taxi_ride_gps_logs WHERE booking_id = ? ORDER BY id ASC',
        [bookingId]
    );

    let startTimeMs = Date.now();
    if (journeyStartTime) {
        startTimeMs = new Date(journeyStartTime).getTime();
    } else {
        const [bookingRows] = await db.query(
            'SELECT journey_start_time FROM taxi_bookings WHERE id = ?',
            [bookingId]
        );
        if (bookingRows.length > 0 && bookingRows[0].journey_start_time) {
            startTimeMs = new Date(bookingRows[0].journey_start_time).getTime();
        }
    }

    const rawPoints = [];
    if (startCoords) {
        const [sLng, sLat] = startCoords.split(',').map(Number);
        if (!isNaN(sLng) && !isNaN(sLat)) {
            rawPoints.push({ lat: sLat, lng: sLng, acc: 5, time: startTimeMs });
        }
    }

    for (const log of gpsLogs) {
        const lat = parseFloat(log.latitude);
        const lng = parseFloat(log.longitude);
        const acc = parseFloat(log.accuracy) || 0;
        const logTime = log.created_at ? new Date(log.created_at).getTime() : Date.now();
        if (!isNaN(lat) && !isNaN(lng) && lat !== null && lng !== null) {
            rawPoints.push({ lat, lng, acc, time: logTime });
        }
    }

    const filteredPoints = rawPoints.filter(p => p.acc <= 200);

    let kfLat = 0;
    let kfLng = 0;
    let kfVariance = -1.0;
    let kfLastTime = 0;

    if (filteredPoints.length > 0) {
        const Q_metres_per_second = 4.0;
        let variance = -1.0;
        let lat = 0.0;
        let lng = 0.0;
        let lastTimeStamp = 0;

        let prevPoint = null;
        for (const p of filteredPoints) {
            if (variance < 0) {
                lat = p.lat;
                lng = p.lng;
                variance = p.acc * p.acc;
                lastTimeStamp = p.time;
                prevPoint = { lat, lng, time: p.time };
                continue;
            }

            const durationMs = p.time - lastTimeStamp;
            if (durationMs > 0) {
                variance += durationMs * (Q_metres_per_second / 1000.0) * (Q_metres_per_second / 1000.0);
                lastTimeStamp = p.time;
            }

            const K = variance / (variance + p.acc * p.acc);
            lat += K * (p.lat - lat);
            lng += K * (p.lng - lng);
            variance = (1.0 - K) * variance;

            if (prevPoint) {
                const segmentDist = getDistance(prevPoint.lat, prevPoint.lng, lat, lng);
                if (segmentDist > 0) {
                    const dtSeconds = Math.max(0.1, (p.time - prevPoint.time) / 1000.0);
                    const calculatedSpeedMPS = (segmentDist * 1000.0) / dtSeconds;

                    if (calculatedSpeedMPS <= 45.0 && segmentDist >= 0.001 && calculatedSpeedMPS >= 0.05) {
                        actualDistKm += segmentDist;
                        prevPoint = { lat, lng, time: p.time };
                    }
                }
            } else {
                prevPoint = { lat, lng, time: p.time };
            }
        }

        kfLat = lat;
        kfLng = lng;
        kfVariance = variance;
        kfLastTime = lastTimeStamp;
    }

    const state = {
        kfLat,
        kfLng,
        kfVariance,
        kfLastTime,
        cumulativeDistance: actualDistKm
    };

    activeRidesGpsState.set(bookingId, state);
    return state;
}

// Process a new GPS coordinate update incrementally using in-memory Kalman filter
async function processNewGpsPoint(bookingId, newLat, newLng, newAcc, newSpeed, startCoordsStr, journeyStartTime) {
    const state = await getOrInitGpsState(bookingId, startCoordsStr, journeyStartTime);
    const nowMs = Date.now();

    const Q_metres_per_second = 4.0;

    if (state.kfVariance < 0) {
        state.kfLat = newLat;
        state.kfLng = newLng;
        state.kfVariance = newAcc * newAcc;
        state.kfLastTime = nowMs;
        activeRidesGpsState.set(bookingId, state);
        return state.cumulativeDistance;
    }

    const durationMs = nowMs - state.kfLastTime;
    let tempVariance = state.kfVariance;
    if (durationMs > 0) {
        tempVariance += durationMs * (Q_metres_per_second / 1000.0) * (Q_metres_per_second / 1000.0);
    }

    const K = tempVariance / (tempVariance + newAcc * newAcc);
    const updatedLat = state.kfLat + K * (newLat - state.kfLat);
    const updatedLng = state.kfLng + K * (newLng - state.kfLng);
    const updatedVariance = (1.0 - K) * tempVariance;

    const segmentDist = getDistance(state.kfLat, state.kfLng, updatedLat, updatedLng);
    if (segmentDist > 0) {
        const dtSeconds = Math.max(0.1, durationMs / 1000.0);
        const calculatedSpeedMPS = (segmentDist * 1000.0) / dtSeconds;

        if (calculatedSpeedMPS <= 45.0 && segmentDist >= 0.001 && calculatedSpeedMPS >= 0.05) {
            state.cumulativeDistance += segmentDist;
            state.kfLat = updatedLat;
            state.kfLng = updatedLng;
            state.kfVariance = updatedVariance;
            state.kfLastTime = nowMs;
        }
    } else {
        state.kfVariance = updatedVariance;
        state.kfLastTime = nowMs;
    }

    activeRidesGpsState.set(bookingId, state);
    return state.cumulativeDistance;
}

function calculateLocalSlabFare(distance, config) {
    const minKm = (config && config.minKm) ? parseFloat(config.minKm) : 0;
    const baseFare = (config && config.base !== undefined) ? parseFloat(config.base) : 0;
    const d = Math.max(distance, minKm);

    let distanceFare = 0;

    const r1 = (config && config.slab1_rate !== undefined) ? parseFloat(config.slab1_rate) : (config.perKm || 20); // 0-5
    const r2 = (config && config.slab2_rate !== undefined) ? parseFloat(config.slab2_rate) : r1; // 6-10
    const r3 = (config && config.slab3_rate !== undefined) ? parseFloat(config.slab3_rate) : r2; // 11-20
    const r4 = (config && config.slab4_rate !== undefined) ? parseFloat(config.slab4_rate) : r3; // 21-30
    const r5 = (config && config.slab5_rate !== undefined) ? parseFloat(config.slab5_rate) : r4; // 31-40
    const r6 = (config && config.slab6_rate !== undefined) ? parseFloat(config.slab6_rate) : r5; // 41-50
    const r7 = (config && config.slab7_rate !== undefined) ? parseFloat(config.slab7_rate) : r6; // 51-60
    const r8 = (config && config.slab8_rate !== undefined) ? parseFloat(config.slab8_rate) : r7; // 61-70
    const r9 = (config && config.slab9_rate !== undefined) ? parseFloat(config.slab9_rate) : r8; // 71-80
    const r10 = (config && config.slab10_rate !== undefined) ? parseFloat(config.slab10_rate) : r9; // 81-90
    const r11 = (config && config.slab11_rate !== undefined) ? parseFloat(config.slab11_rate) : r10; // 91-100
    const rAbove100 = (config && config.above100_rate !== undefined) ? parseFloat(config.above100_rate) : (config.perKm || r11); // >100km

    let rem = d;
    if (rem > 100) { distanceFare += (rem - 100) * rAbove100; rem = 100; }
    if (rem > 90) { distanceFare += (rem - 90) * r11; rem = 90; }
    if (rem > 80) { distanceFare += (rem - 80) * r10; rem = 80; }
    if (rem > 70) { distanceFare += (rem - 70) * r9; rem = 70; }
    if (rem > 60) { distanceFare += (rem - 60) * r8; rem = 60; }
    if (rem > 50) { distanceFare += (rem - 50) * r7; rem = 50; }
    if (rem > 40) { distanceFare += (rem - 40) * r6; rem = 40; }
    if (rem > 30) { distanceFare += (rem - 30) * r5; rem = 30; }
    if (rem > 20) { distanceFare += (rem - 20) * r4; rem = 20; }
    if (rem > 10) { distanceFare += (rem - 10) * r3; rem = 10; }
    if (rem > 5) { distanceFare += (rem - 5) * r2; rem = 5; }
    if (rem > 0) { distanceFare += rem * r1; }

    return Math.round(Math.max(baseFare, distanceFare));
}

// Odometer-style distance calculator summing segments from logged coordinates
async function calculateOdometerDistance(bookingId, startCoordsStr, journeyStartTime, preFetchedGpsLogs) {
    try {
        let actualDistKm = 0;
        let startCoords = startCoordsStr || null;
        if (startCoords === 'null,null') {
            startCoords = null;
        }

        // Fetch all GPS logs in chronological order with speed and created_at if not pre-fetched
        const gpsLogs = preFetchedGpsLogs || (await db.query(
            'SELECT latitude, longitude, accuracy, speed, created_at FROM taxi_ride_gps_logs WHERE booking_id = ? ORDER BY id ASC',
            [bookingId]
        ))[0];

        let startTimeMs = Date.now();
        if (journeyStartTime) {
            startTimeMs = new Date(journeyStartTime).getTime();
        } else {
            // Fetch journey start time for start coordinates timestamp fallback
            const [bookingRows] = await db.query(
                'SELECT journey_start_time FROM taxi_bookings WHERE id = ?',
                [bookingId]
            );
            if (bookingRows.length > 0 && bookingRows[0].journey_start_time) {
                startTimeMs = new Date(bookingRows[0].journey_start_time).getTime();
            }
        }

        // Build list of raw points
        const rawPoints = [];
        if (startCoords) {
            const [sLng, sLat] = startCoords.split(',').map(Number);
            if (!isNaN(sLng) && !isNaN(sLat)) {
                // start point is assumed highly accurate (accuracy 5 meters)
                rawPoints.push({ lat: sLat, lng: sLng, acc: 5, time: startTimeMs });
            }
        }

        for (const log of gpsLogs) {
            const lat = parseFloat(log.latitude);
            const lng = parseFloat(log.longitude);
            const acc = parseFloat(log.accuracy) || 0;
            const logTime = log.created_at ? new Date(log.created_at).getTime() : Date.now();
            if (!isNaN(lat) && !isNaN(lng) && lat !== null && lng !== null) {
                rawPoints.push({ lat, lng, acc, time: logTime });
            }
        }

        if (rawPoints.length <= 1) {
            return 0;
        }

        // Filter out extreme accuracy outliers (acc > 200m is extremely noisy/unreliable)
        const filteredPoints = rawPoints.filter(p => p.acc <= 200);
        if (filteredPoints.length <= 1) {
            return 0;
        }

        // Kalman Filter Implementation
        class LatLngKalmanFilter {
            constructor(noise = 4.0) {
                this.Q_metres_per_second = noise;
                this.variance = -1.0;
                this.lat = 0.0;
                this.lng = 0.0;
                this.lastTimeStamp = 0;
            }

            process(lat, lng, accuracy, timeStampMs) {
                if (this.variance < 0) {
                    this.lat = lat;
                    this.lng = lng;
                    this.variance = accuracy * accuracy;
                    this.lastTimeStamp = timeStampMs;
                    return { lat, lng };
                }

                const durationMs = timeStampMs - this.lastTimeStamp;
                if (durationMs > 0) {
                    // Variance increase based on motion prediction uncertainty over time
                    this.variance += durationMs * (this.Q_metres_per_second / 1000.0) * (this.Q_metres_per_second / 1000.0);
                    this.lastTimeStamp = timeStampMs;
                }

                // Kalman gain
                const K = this.variance / (this.variance + accuracy * accuracy);
                this.lat += K * (lat - this.lat);
                this.lng += K * (lng - this.lng);
                this.variance = (1.0 - K) * this.variance;

                return { lat: this.lat, lng: this.lng };
            }
        }

        // Smooth all filtered points using the Kalman filter
        const kf = new LatLngKalmanFilter(4.0); // 4.0 m/s process noise
        const smoothedPoints = filteredPoints.map(p => {
            const smoothed = kf.process(p.lat, p.lng, p.acc, p.time);
            return {
                lat: smoothed.lat,
                lng: smoothed.lng,
                time: p.time
            };
        });

        // Sum distances with speed sanity checks
        let prevPoint = smoothedPoints.at(0);
        for (let i = 1; i < smoothedPoints.length; i++) {
            const currentPoint = smoothedPoints.at(i);
            const dtSeconds = Math.max(0.1, (currentPoint.time - prevPoint.time) / 1000.0);
            const segmentDist = getDistance(prevPoint.lat, prevPoint.lng, currentPoint.lat, currentPoint.lng); // in KM

            if (segmentDist > 0) {
                const calculatedSpeedMPS = (segmentDist * 1000.0) / dtSeconds; // meters per second

                // Sanity Checks:
                // 1. Filter out impossible teleportation jumps (speed > 45 m/s or 162 km/h)
                if (calculatedSpeedMPS > 45.0) {
                    continue; // Skip this anomalous jump
                }

                // 2. Ignore tiny jitter noise when stationary
                // (e.g. movements < 1 meter or extremely slow speed < 0.05 m/s or 0.18 km/h)
                if (segmentDist < 0.001 || calculatedSpeedMPS < 0.05) {
                    continue;
                }

                actualDistKm += segmentDist;
                prevPoint = currentPoint;
            }
        }

        console.log(`[High-Accuracy Odometer #${bookingId}] Calculated total distance: ${actualDistKm.toFixed(3)} KM (smoothed ${smoothedPoints.length} points)`);
        return actualDistKm;
    } catch (err) {
        console.error(`Error in calculateOdometerDistance for booking #${bookingId}:`, err);
        return 0;
    }
}

// Helper for Peak Multiplier matching client side
function getPeakMultiplier(timeStr, peakRules) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    const tm = parts[0] * 60 + parts[1];

    let highestSurcharge = 0;
    peakRules.forEach(rule => {
        const startParts = rule.start_time.split(':').map(Number);
        const endParts = rule.end_time.split(':').map(Number);
        const stm = startParts[0] * 60 + startParts[1];
        const etm = endParts[0] * 60 + endParts[1];

        let inPeak = false;
        if (stm <= etm) {
            inPeak = (tm >= stm && tm <= etm);
        } else {
            // wraps around midnight (e.g. 22:00 to 06:00)
            inPeak = (tm >= stm || tm <= etm);
        }

        if (inPeak) {
            const surcharge = parseFloat(rule.surcharge_percentage) / 100;
            if (surcharge > highestSurcharge) highestSurcharge = surcharge;
        }
    });
    return highestSurcharge;
}
// 4.9 Driver Dashboard Stats
app.get('/api/driver/dashboard-stats/:driverId', async (req, res) => {
    try {
        const driverId = req.params.driverId;

        // Total completed rides & earnings
        const [completedStats] = await db.query(
            `SELECT COUNT(*) as total_rides, 
                    COALESCE(SUM(CAST(REPLACE(REPLACE(fare, '\u20B9', ''), ',', '') AS DECIMAL(10,2))), 0) as total_earnings
             FROM taxi_bookings WHERE driver_id = ? AND status IN ('completed', 'finished')`, [driverId]
        );

        // Today's stats
        const [todayStats] = await db.query(
            `SELECT COUNT(*) as today_rides, 
                    COALESCE(SUM(CAST(REPLACE(REPLACE(fare, '\u20B9', ''), ',', '') AS DECIMAL(10,2))), 0) as today_earnings
             FROM taxi_bookings WHERE driver_id = ? AND status IN ('completed', 'finished') AND DATE(COALESCE(journey_end_time, created_at)) = CURDATE()`, [driverId]
        );

        // This week's stats
        const [weekStats] = await db.query(
            `SELECT COUNT(*) as week_rides, 
                    COALESCE(SUM(CAST(REPLACE(REPLACE(fare, '\u20B9', ''), ',', '') AS DECIMAL(10,2))), 0) as week_earnings
             FROM taxi_bookings WHERE driver_id = ? AND status IN ('completed', 'finished') AND COALESCE(journey_end_time, created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`, [driverId]
        );

        // Ride counts by status
        const [statusCounts] = await db.query(
            `SELECT status, COUNT(*) as count FROM taxi_bookings WHERE driver_id = ? GROUP BY status`, [driverId]
        );

        // Recent ride history (last 50 completed, finished, and cancelled rides with customer details)
        const { startDate, endDate } = req.query;
        let historyQuery = `SELECT b.id, b.pickup_loc, b.drop_loc, b.fare, b.distance, b.actual_distance, b.vehicle_type, b.trip_type, 
                    b.journey_start_time, b.journey_end_time, b.status, b.pickup_date, b.pickup_time, b.created_at,
                    COALESCE(b.passenger_name, u.name, tu.name) as customer_name,
                    COALESCE(b.passenger_phone, u.phone, tu.phone) as customer_phone
             FROM taxi_bookings b
             LEFT JOIN passengers u ON b.user_id = u.id
             LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
             WHERE b.driver_id = ? AND b.status IN ('completed', 'finished', 'cancelled')`;

        const historyParams = [driverId];

        if (startDate && endDate) {
            historyQuery += ` AND DATE(COALESCE(b.journey_end_time, b.created_at)) >= ? AND DATE(COALESCE(b.journey_end_time, b.created_at)) <= ?`;
            historyParams.push(startDate, endDate);
            historyQuery += ` ORDER BY COALESCE(b.journey_end_time, b.created_at) ASC`; // Ascending order when viewing specific date range for charts
        } else {
            historyQuery += ` AND DATE(COALESCE(b.journey_end_time, b.created_at)) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) ORDER BY COALESCE(b.journey_end_time, b.created_at) DESC`; // Default view
        }

        const [rideHistory] = await db.query(historyQuery, historyParams);

        // Average rating & total ratings count
        const [ratingStats] = await db.query(
            `SELECT AVG(rating) as avg_rating, COUNT(rating) as total_ratings 
             FROM taxi_bookings WHERE driver_id = ? AND rating IS NOT NULL`, [driverId]
        );
        const avgRating = ratingStats[0].avg_rating ? parseFloat(ratingStats[0].avg_rating).toFixed(1) : '5.0';
        const totalRatings = ratingStats[0].total_ratings || 0;

        res.json({
            totals: completedStats[0],
            today: todayStats[0],
            week: weekStats[0],
            statusCounts: statusCounts,
            rideHistory: rideHistory,
            rating: {
                average: avgRating,
                count: totalRatings
            }
        });
    } catch (err) {
        console.error('Driver dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
    }
});

app.post('/api/bookings/reached-pickup', authenticateJWT, requireRole(['driver']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId } = req.body;
        if (!bookingId) return res.status(400).json({ error: 'Booking ID is required.' });

        const nowStr = new Date().toISOString();
        await db.query(
            'UPDATE taxi_bookings SET reached_pickup_time = NOW() WHERE id = ?',
            [bookingId]
        );

        const [[bRow]] = await db.query(
            'SELECT b.user_id, b.driver_id, b.journey_otp, d.name as driver_name FROM taxi_bookings b LEFT JOIN taxi_drivers d ON b.driver_id = d.id WHERE b.id = ?',
            [bookingId]
        );

        const notifData = {
            bookingId: parseInt(bookingId),
            id: parseInt(bookingId),
            status: 'reached_pickup',
            reached_pickup_time: nowStr,
            reached_elapsed_seconds: 0,
            driver_name: bRow?.driver_name || 'Your Driver',
            otp: bRow?.journey_otp || '',
            message: 'Your captain has arrived at your pickup location!',
            ts: Date.now()
        };

        if (bRow && bRow.user_id) {
            emitEvent(`user:${bRow.user_id}`, 'reached_pickup', notifData);
            emitEvent(`user:${bRow.user_id}`, 'booking_status_update', notifData);
        }
        if (bRow && bRow.driver_id) {
            emitEvent(`driver:${bRow.driver_id}`, 'reached_pickup', notifData);
            emitEvent(`driver:${bRow.driver_id}`, 'booking_status_update', notifData);
        }
        emitEvent(`booking:${bookingId}`, 'reached_pickup', notifData);
        emitEvent(`booking:${bookingId}`, 'booking_status_update', notifData);
        emitEvent('admin', 'booking_status_update', notifData);
        io.emit('booking_status_update', notifData);
        io.emit('reached_pickup', notifData);

        res.json({ success: true, message: 'Driver reached pickup location.' });
    } catch (err) {
        console.error('Error in reached-pickup:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint: Change Pickup Location (Max 3 times per booking)
app.post('/api/user/update-pickup', async (req, res) => {
    try {
        const { bookingId, userId, newPickupLoc, newPickupCoords } = req.body;
        if (!bookingId || !newPickupLoc) {
            return res.status(400).json({ error: 'Booking ID and new pickup location are required.' });
        }

        // Auto-add column if not exists
        try {
            await db.query(`ALTER TABLE taxi_bookings ADD COLUMN pickup_change_count INT DEFAULT 0`);
        } catch (e) { }

        // Fetch booking
        const [rows] = await db.query('SELECT * FROM taxi_bookings WHERE id = ?', [bookingId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Booking not found.' });
        }

        const booking = rows[0];
        if (userId && String(booking.user_id) !== String(userId)) {
            return res.status(403).json({ error: 'Unauthorized to modify this booking.' });
        }

        // Verify status: only pending or assigned rides can change pickup location
        if (!['pending', 'assigned'].includes(booking.status)) {
            return res.status(400).json({ error: 'Pickup location can only be changed before the trip starts.' });
        }

        // Verify change count limit (max 3)
        const currentCount = booking.pickup_change_count || 0;
        if (currentCount >= 3) {
            return res.status(400).json({ error: 'Maximum limit of 3 pickup location changes reached for this ride.' });
        }

        const newCount = currentCount + 1;
        const remaining = 3 - newCount;

        // Geocode new address if coords not supplied
        let coordsStr = newPickupCoords || booking.pickup_coords;
        if (!newPickupCoords && newPickupLoc) {
            try {
                const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newPickupLoc.trim())}&limit=1`, {
                    headers: { 'User-Agent': 'CityRideTaxi/2.0' },
                    timeout: 4000
                });
                if (geoRes.data && geoRes.data.length > 0) {
                    coordsStr = `${geoRes.data[0].lon},${geoRes.data[0].lat}`;
                }
            } catch (e) { }
        }

        // Update database
        await db.query(
            'UPDATE taxi_bookings SET pickup_loc = ?, pickup_coords = ?, pickup_change_count = ? WHERE id = ?',
            [newPickupLoc.trim(), coordsStr, newCount, bookingId]
        );

        // Notify socket rooms & driver
        const updatePayload = {
            bookingId: booking.id,
            newPickupLoc: newPickupLoc.trim(),
            newPickupCoords: coordsStr,
            pickupChangeCount: newCount,
            remainingChanges: remaining
        };
        io.to(`booking:${booking.id}`).emit('pickup_location_updated', updatePayload);
        if (booking.driver_id) {
            io.to(`driver:${booking.driver_id}`).emit('pickup_location_updated', updatePayload);
        }

        res.json({
            success: true,
            message: 'Pickup location updated successfully.',
            pickup_change_count: newCount,
            remainingChanges: remaining,
            newPickupLoc: newPickupLoc.trim(),
            newPickupCoords: coordsStr
        });
    } catch (err) {
        console.error('Error updating pickup location:', err);
        res.status(500).json({ error: 'Failed to update pickup location.' });
    }
});

// Endpoint: Rate Ride & Submit Customer Feedback
app.post('/api/user/rate-ride', async (req, res) => {
    try {
        const { bookingId, rating, comment } = req.body;
        if (!bookingId || !rating) {
            return res.status(400).json({ error: 'Booking ID and rating are required.' });
        }

        // Auto-add rating and rating_comment columns if missing
        try { await db.query(`ALTER TABLE taxi_bookings ADD COLUMN rating INT DEFAULT NULL`); } catch (e) { }
        try { await db.query(`ALTER TABLE taxi_bookings ADD COLUMN rating_comment TEXT DEFAULT NULL`); } catch (e) { }

        await db.query(
            'UPDATE taxi_bookings SET rating = ?, rating_comment = ? WHERE id = ?',
            [Math.min(5, Math.max(1, parseInt(rating))), (comment || '').trim(), bookingId]
        );

        res.json({ success: true, message: 'Rating submitted successfully.' });
    } catch (err) {
        console.error('Error submitting rating:', err);
        res.status(500).json({ error: 'Failed to submit rating.' });
    }
});

// 5. Update Booking Status & Odometer/Timer Logic
app.post('/api/bookings/start-journey', authenticateJWT, requireRole(['driver']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId, startOdometer, latitude, longitude, otp } = req.body;
        if (!bookingId) return res.status(400).json({ error: 'Booking ID is required.' });

        // Fetch booking details from cached request context
        const booking = req.booking;
        const isVendorBooking = !!booking.vendor_id;

        if (!isVendorBooking) {
            if (!otp) return res.status(400).json({ error: 'Passenger OTP is required to start the ride.' });
            if (String(booking.journey_otp || '').trim() !== String(otp).trim()) {
                return res.status(400).json({ error: 'Invalid passenger OTP. Please double-check with the passenger.' });
            }
        }

        // Determine start coordinates from driver's actual GPS or fallback to booking pickup coords
        let startCoords = null;
        if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
            startCoords = `${longitude},${latitude}`;
        } else {
            startCoords = booking.pickup_coords || null;
        }

        // === DYNAMIC DISTANCE CALCULATION ===
        // The ride fare is calculated only for the distance travelled. Start distance is 0.
        let dynamicDistKm = 0;

        // === DYNAMIC FARE CALCULATION ===
        let dynamicFare = 0;
        let dynamicFareStr = booking.fare; // default to original if calc fails
        let dynamicDistStr = `${dynamicDistKm.toFixed(3)} KM`;

        if (booking.trip_type !== 'rental' && dynamicDistKm >= 0) {
            // Fetch tariff config (check vendor tariff first, then system fallback) and peak rules in parallel
            let pricingConfig = null;
            let vendorTariffPromise = Promise.resolve([[]]);
            if (booking.vendor_id) {
                vendorTariffPromise = db.query('SELECT config FROM taxi_vendor_tariffs WHERE vendor_id = ? AND vehicle_type = ? AND category = ?', [booking.vendor_id, booking.vehicle_type, booking.trip_type]);
            }
            const tariffPromise = db.query('SELECT config FROM taxi_tariffs WHERE vehicle_type = ? AND category = ?', [booking.vehicle_type, booking.trip_type]);
            const peakRulesPromise = db.query('SELECT * FROM taxi_peak_rules WHERE is_active = 1');
            const specialChargePromise = booking.special_place_type
                ? db.query('SELECT surcharge_percentage FROM taxi_special_location_charges WHERE place_type = ? AND is_active = 1', [booking.special_place_type])
                : Promise.resolve([[]]);

            const [[vendorTariffRows], [tariffRows], [peakRules], [spChargeRows]] = await Promise.all([vendorTariffPromise, tariffPromise, peakRulesPromise, specialChargePromise]);

            if (vendorTariffRows.length > 0) {
                pricingConfig = typeof vendorTariffRows[0].config === 'string' ? JSON.parse(vendorTariffRows[0].config) : vendorTariffRows[0].config;
            } else if (tariffRows.length > 0) {
                pricingConfig = typeof tariffRows[0].config === 'string' ? JSON.parse(tariffRows[0].config) : tariffRows[0].config;
            }

            const peakMult = getPeakMultiplier(booking.pickup_time, peakRules);
            const specialSurchargePct = spChargeRows.length > 0 ? (parseFloat(spChargeRows[0].surcharge_percentage) / 100) : 0;

            let extraDropsCharge = 0;
            try {
                if (booking.extra_drops) {
                    const stops = typeof booking.extra_drops === 'string' ? JSON.parse(booking.extra_drops) : booking.extra_drops;
                    if (Array.isArray(stops)) {
                        if (booking.trip_type === 'local') {
                            extraDropsCharge = stops.length * 50;
                        } else if (booking.trip_type === 'oneway') {
                            extraDropsCharge = stops.length * 50;
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to parse extra_drops in start-trip dynamic calculation", e);
            }

            if (booking.trip_type === 'local') {
                const config = pricingConfig || { base: 150, perKm: 20, minKm: 0 };
                const minKm = typeof config.minKm === 'number' ? config.minKm : 0;
                const billableDist = Math.max(dynamicDistKm, minKm);
                const baseKmFare = calculateLocalSlabFare(billableDist, config);
                const peakCharge = baseKmFare * peakMult;
                const specialCharge = baseKmFare * specialSurchargePct;
                dynamicFare = (baseKmFare + peakCharge + specialCharge + extraDropsCharge) + 5;
            } else if (booking.trip_type === 'oneway') {
                const config = pricingConfig || { base: 0, perKm: 13, minKm: 130 };
                const baseFare = config.base || 0;
                const minKm = typeof config.minKm === 'number' ? config.minKm : 130;
                const billableDist = Math.max(dynamicDistKm, minKm);
                const distanceFare = billableDist * (config.perKm || 13);
                const baseKmFare = Math.max(baseFare, distanceFare);
                const driverAllowance = billableDist > 250 ? 600 : 400;
                const specialCharge = baseKmFare * specialSurchargePct;
                dynamicFare = (baseKmFare + (booking.vehicle_type === 'bike' ? 0 : driverAllowance) + specialCharge + extraDropsCharge) + 5;
            } else if (booking.trip_type === 'round') {
                const config = pricingConfig || { base: 0, perKm: 12, minKmPerDay: 250 };
                const baseFare = config.base || 0;
                let tripDays = 1;
                if (booking.return_date && booking.pickup_date) {
                    const start = new Date(booking.pickup_date);
                    const end = new Date(booking.return_date);
                    if (end > start) {
                        const diffTime = Math.abs(end - start);
                        tripDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                    }
                }
                const minKmForTrip = (typeof config.minKmPerDay === 'number' ? config.minKmPerDay : 250) * tripDays;
                const billableDist = Math.max(dynamicDistKm, minKmForTrip);
                const distanceFare = billableDist * (config.perKm || 12);
                const baseKmFare = Math.max(baseFare, distanceFare);
                const driverAllowance = billableDist > 250 ? 600 : 400;
                const specialCharge = baseKmFare * specialSurchargePct;
                dynamicFare = ((baseKmFare + (booking.vehicle_type === 'bike' ? 0 : driverAllowance * tripDays) + specialCharge)) + 5;
            }

            dynamicFareStr = `\u20B9${Math.ceil(dynamicFare)}`;
        }

        // === UPDATE DATABASE (Combined into a single query to eliminate multiple round trips) ===
        let queryStr = `
            UPDATE taxi_bookings 
            SET status = "ongoing", 
                journey_start_time = NOW(), 
                start_gps_coords = ?, 
                dynamic_distance = ?, 
                dynamic_fare = ?, 
                fare = ?, 
                distance = ?,
                original_fare = COALESCE(original_fare, ?),
                estimated_distance = COALESCE(estimated_distance, ?),
                estimated_fare = COALESCE(estimated_fare, ?)
        `;
        const params = [
            startCoords,
            dynamicDistStr,
            dynamicFareStr,
            dynamicFareStr,
            dynamicDistStr,
            booking.fare,
            booking.distance || '0 KM',
            booking.fare || '\u20B90'
        ];

        if (startOdometer) {
            queryStr += `, start_odometer = ?`;
            params.push(startOdometer);
        }

        queryStr += ` WHERE id = ?`;
        params.push(bookingId);

        await db.query(queryStr, params);

        console.log(`[Start Journey #${bookingId}] Estimated: ${booking.distance} / ${booking.fare} → Dynamic: ${dynamicDistStr} / ${dynamicFareStr}`);

        // 🔴 Socket.IO: Notify user their journey has started
        const userId = booking.user_id;
        if (userId) {
            emitEvent(`user:${userId}`, 'booking_status_update', {
                bookingId,
                status: 'ongoing',
                dynamicFare: dynamicFareStr,
                dynamicDistance: dynamicDistStr
            });
        }
        emitEvent(`booking:${bookingId}`, 'booking_status_update', { bookingId, status: 'ongoing' });
        emitEvent('admin', 'booking_status_update', { bookingId, status: 'ongoing', driverId: booking.driver_id });

        res.json({
            success: true,
            message: 'Journey started. GPS tracking is now active.',
            estimatedDistance: booking.distance,
            estimatedFare: booking.fare,
            dynamicDistance: dynamicDistStr,
            dynamicFare: dynamicFareStr
        });
    } catch (err) {
        console.error('Error in start-journey:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookings/update-status', authenticateJWT, requireRole(['driver', 'user', 'admin']), verifyBookingAccess, async (req, res) => {
    try {
        const { status, bookingId, otp, endOdometer } = req.body;

        // If completing, we no longer verify OTP
        if (status === 'completed') {
            const booking = req.booking;

            // --- ATOMIC VENDOR WALLET PROFIT TRANSFER ON COMPLETION ---
            const updatePromises = [];
            let vendorProfitDeducted = 0;

            if (booking.vendor_id && parseFloat(booking.vendor_markup) > 0 && !['completed', 'finished'].includes(booking.status)) {
                vendorProfitDeducted = parseFloat(booking.vendor_markup);
                const vendId = booking.vendor_id;
                const drId = booking.driver_id;
                const profit = vendorProfitDeducted;

                try {
                    // Deduct from driver wallet
                    updatePromises.push(db.query(
                        'UPDATE taxi_drivers SET wallet_balance = wallet_balance - ? WHERE id = ?',
                        [profit, drId]
                    ));
                    // Upsert vendor wallet balance + total_earned
                    updatePromises.push(db.query(
                        `INSERT INTO taxi_vendor_wallets (vendor_id, balance, total_earned)
                         VALUES (?, ?, ?)
                         ON DUPLICATE KEY UPDATE balance = balance + ?, total_earned = total_earned + ?, updated_at = NOW()`,
                        [vendId, profit, profit, profit, profit]
                    ));
                    // Audit transaction log
                    updatePromises.push(db.query(
                        `INSERT INTO taxi_vendor_wallet_transactions (vendor_id, booking_id, driver_id, amount, type, note)
                         VALUES (?, ?, ?, ?, 'credit', ?)`,
                        [vendId, bookingId, drId, profit, `Vendor profit share from Ride #B${bookingId}`]
                    ));
                    console.log(`[FINANCE] \u20B9${profit} vendor profit transferred: Driver #${drId} → Vendor #${vendId} for Ride #B${bookingId}`);
                } catch (walletErr) {
                    console.error('[WALLET TRANSFER ERROR]', walletErr.message);
                }
            } else if (!['completed', 'finished'].includes(booking.status) && booking.driver_id) {
                // If ride is attached to an association, calculate commission and transfer it to the Association wallet
                if (booking.association_id) {
                    try {
                        const [assocRows] = await db.query('SELECT commission_type, commission_value FROM taxi_associations WHERE id = ?', [booking.association_id]);
                        if (assocRows.length > 0) {
                            const { commission_type, commission_value } = assocRows[0];
                            let commAmount = 0; // no fallback - use only configured association commission
                            const rawFare = parseFloat(String(booking.fare).replace(/[^0-9.]/g, '')) || 0;
                            
                            if (commission_type === 'percent') {
                                commAmount = (rawFare * (parseFloat(commission_value) || 0)) / 100;
                            } else {
                                commAmount = parseFloat(commission_value) || 0;
                            }
                            
                            // Prevent negative or zero commission
                            commAmount = Math.max(0, commAmount);
                            
                            if (commAmount > 0) {
                                // Deduct from Driver
                                updatePromises.push(db.query('UPDATE taxi_drivers SET wallet_balance = wallet_balance - ? WHERE id = ?', [commAmount, booking.driver_id]));
                                
                                // Credit to Association
                                updatePromises.push(db.query(
                                    `INSERT INTO taxi_association_wallets (association_id, balance) 
                                     VALUES (?, ?) 
                                     ON DUPLICATE KEY UPDATE balance = balance + ?, updated_at = NOW()`,
                                    [booking.association_id, commAmount, commAmount]
                                ));
                                
                                // Log Transaction
                                updatePromises.push(db.query(
                                    `INSERT INTO taxi_association_wallet_transactions (association_id, booking_id, driver_id, amount, type, note) 
                                     VALUES (?, ?, ?, ?, 'credit', ?)`,
                                    [booking.association_id, bookingId, booking.driver_id, commAmount, `Commission share from Ride #B${bookingId}`]
                                ));
                                console.log(`[FINANCE] \u20B9${commAmount.toFixed(2)} transferred to Association #${booking.association_id} from Driver #${booking.driver_id} (Ride #B${bookingId})`);
                            }
                        }
                    } catch (assocErr) {
                        console.error('[ASSOCIATION FINANCE ERROR]', assocErr.message);
                    }
                } else {
                    // Commission is now deducted upfront during ride acceptance.
                }
            }

            // Update booking status + journey end time
            if (booking.trip_type === 'rental') {
                if (!booking.journey_end_time) {
                    updatePromises.push(db.query('UPDATE taxi_bookings SET status = ?, journey_end_time = NOW() WHERE id = ?', [status, bookingId]));
                } else {
                    updatePromises.push(db.query('UPDATE taxi_bookings SET status = ? WHERE id = ?', [status, bookingId]));
                }
            } else {
                updatePromises.push(db.query('UPDATE taxi_bookings SET status = ?, journey_end_time = NOW() WHERE id = ?', [status, bookingId]));
            }

            await Promise.all(updatePromises);

            // Clean up GPS state cache
            activeRidesGpsState.delete(bookingId);

            // 🔴 Socket.IO: Trip completed — notify customer, admin, vendor
            if (booking.user_id) {
                emitEvent(`user:${booking.user_id}`, 'booking_status_update', { bookingId, status: 'completed', finalFare: booking.fare });
            }
            if (booking.vendor_id && vendorProfitDeducted > 0) {
                emitEvent(`vendor:${booking.vendor_id}`, 'ride_completed_payment', {
                    bookingId: parseInt(bookingId),
                    profit: vendorProfitDeducted,
                    totalFare: booking.fare,
                    driverId: booking.driver_id,
                    message: `\u20B9${vendorProfitDeducted.toFixed(2)} credited to your wallet for Ride #B${bookingId}`
                });
            }
            emitEvent('admin', 'booking_status_update', { bookingId, status: 'completed', driverId: booking.driver_id });
            emitEvent(`booking:${bookingId}`, 'booking_status_update', { bookingId, status: 'completed' });

            return res.json({
                success: true,
                vendorProfit: vendorProfitDeducted,
                totalFare: booking.fare,
                baseFare: (parseFloat(String(booking.fare).replace(/[^0-9.]/g, '')) || 0) - vendorProfitDeducted
            });
        }

        if (status === 'cancelled') {
            const bkForCancel = req.booking;
            await db.query('UPDATE taxi_bookings SET status = ?, driver_id = NULL WHERE id = ?', [status, bookingId]);
            // Clean up GPS state cache to prevent memory leaks
            activeRidesGpsState.delete(bookingId);
            // Notify vendor if this is a vendor ride cancelled by driver
            if (bkForCancel && bkForCancel.vendor_id) {
                const [drvRows] = await db.query('SELECT name FROM taxi_drivers WHERE id = ?', [bkForCancel.driver_id]);
                const cancelDriverName = drvRows[0]?.name || 'Driver';
                emitEvent(`vendor:${bkForCancel.vendor_id}`, 'driver_cancelled', {
                    bookingId: parseInt(bookingId),
                    driverName: cancelDriverName,
                    pickup: bkForCancel.pickup_loc,
                    drop: bkForCancel.drop_loc,
                    fare: bkForCancel.fare,
                    reason: 'Ride cancelled',
                    status: 'cancelled',
                    ts: Date.now()
                });
            }
        } else {
            await db.query('UPDATE taxi_bookings SET status = ? WHERE id = ?', [status, bookingId]);
        }

        // 🔴 Socket.IO: Generic status update broadcast
        const bk = req.booking;
        if (bk && bk.user_id) {
            emitEvent(`user:${bk.user_id}`, 'booking_status_update', { bookingId, status });
        }
        emitEvent('admin', 'booking_status_update', { bookingId, status });
        emitEvent(`booking:${bookingId}`, 'booking_status_update', { bookingId, status });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });

    }
});

app.post('/api/bookings/rate-driver', authenticateJWT, requireRole(['user']), async (req, res) => {
    try {
        const { bookingId, rating, comment } = req.body;
        if (!bookingId || rating === undefined) {
            return res.status(400).json({ error: 'bookingId and rating are required.' });
        }
        const parsedRating = parseInt(rating);
        if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
            return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
        }

        const [bookings] = await db.query('SELECT driver_id FROM taxi_bookings WHERE id = ?', [bookingId]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });

        const booking = bookings[0];
        if (!booking.driver_id) {
            return res.status(400).json({ error: 'No driver is assigned to this booking.' });
        }

        await db.query('UPDATE taxi_bookings SET rating = ?, rating_comment = ? WHERE id = ?', [parsedRating, comment || null, bookingId]);
        res.json({ success: true, message: 'Thank you for your rating!' });
    } catch (err) {
        console.error('Error in rate-driver:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2.8 Finish Trip (Odometer Input & Fare Calculation / GPS finalization)
app.post('/api/bookings/finish-trip', authenticateJWT, requireRole(['driver']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId, endOdometer, latitude, longitude, clientDistance } = req.body;
        const booking = req.booking;

        let endCoords = null;
        if (latitude !== undefined && longitude !== undefined) {
            endCoords = longitude + ',' + latitude;
        }

        let distanceCovered = 0;
        let durationMins = 0;
        const startTime = new Date(booking.journey_start_time);
        const endTime = new Date();
        durationMins = (endTime - startTime) / (1000 * 60);

        // Fetch GPS logs for distance fallback
        const [gpsLogs] = await db.query('SELECT latitude, longitude, accuracy, speed, created_at FROM taxi_ride_gps_logs WHERE booking_id = ? ORDER BY id ASC', [bookingId]);
        
        if (!endCoords && gpsLogs.length > 0) {
            const lastLog = gpsLogs[gpsLogs.length - 1];
            endCoords = lastLog.longitude + ',' + lastLog.latitude;
        }

        // Distance Resolution Logic (Priority: Odometer -> GPS -> Client Odometer)
        if (endOdometer && booking.start_odometer && /^\d{1,6}$/.test(String(endOdometer).trim())) {
            distanceCovered = parseInt(endOdometer) - parseInt(booking.start_odometer);
            if (distanceCovered < 0) distanceCovered = 0;
        } else if (booking.trip_type !== 'rental') {
            let startCoords = booking.start_gps_coords || null;
            if (startCoords === 'null,null') startCoords = null;

            let serverDistance = 0;
            const cachedState = activeRidesGpsState.get(bookingId);
            if (cachedState) {
                serverDistance = cachedState.cumulativeDistance;
            } else {
                serverDistance = await calculateOdometerDistance(bookingId, startCoords, booking.journey_start_time, gpsLogs);
            }
            distanceCovered = serverDistance;

            if (clientDistance !== undefined && clientDistance !== null) {
                const parsedClientDist = parseFloat(clientDistance);
                if (!isNaN(parsedClientDist) && parsedClientDist > 0) {
                    if (gpsLogs.length < 3) {
                        distanceCovered = Math.min(parsedClientDist, 200);
                    } else {
                        const maxAllowed = serverDistance * 1.15 + 2.0;
                        if (parsedClientDist <= maxAllowed) distanceCovered = parsedClientDist;
                    }
                }
            }
        } else {
            distanceCovered = clientDistance || 0;
        }

        // Determine Category Dynamically
        const finalCategory = await pricingEngine.resolveRideCategory(db, distanceCovered, booking.trip_type);
        
        // Calculate pre-ride waiting
        let preRideWaitingCharge = 0;
        if (booking.reached_pickup_time && booking.journey_start_time) {
            const reachedTime = new Date(booking.reached_pickup_time);
            const journeyStartTime = new Date(booking.journey_start_time);
            const preRideElapsedMins = (journeyStartTime - reachedTime) / (1000 * 60);
            if (preRideElapsedMins > 5) {
                preRideWaitingCharge = Math.max(0, Math.ceil((preRideElapsedMins - 5) * 2));
            }
        }

        // Fare Calculation via Canonical Engine
        const fareDetails = await pricingEngine.calculateCanonicalFare(db, {
            distanceKm: distanceCovered,
            durationMins,
            vehicleType: booking.vehicle_type,
            category: finalCategory,
            pickupTime: booking.pickup_time ? new Date(booking.pickup_date + ' ' + booking.pickup_time) : new Date(),
            extraDrops: booking.extra_drops,
            specialPlaceType: booking.special_place_type,
            vendorId: booking.vendor_id,
            rentalPackage: booking.rental_package,
            returnDate: booking.return_date,
            pickupDate: booking.pickup_date,
            preRideWaitingCharge
        });

        // Settle financials atomically
        let vendorMarkup = 0;
        if (booking.vendor_id && parseFloat(booking.vendor_markup) > 0) {
            vendorMarkup = parseFloat(booking.vendor_markup);
        }

        // --- Hybrid Association Commission Overrides ---
        let assocCustomerOverrideAmount = 0;
        if (booking.driver_id) {
            const [drvRows] = await db.query('SELECT association_id FROM taxi_drivers WHERE id = ?', [booking.driver_id]);
            if (drvRows.length > 0 && drvRows[0].association_id) {
                const [assocRows] = await db.query('SELECT commission_customer_pct, commission_customer_fixed FROM taxi_associations WHERE id = ?', [drvRows[0].association_id]);
                if (assocRows.length > 0) {
                    const custPct = parseFloat(assocRows[0].commission_customer_pct) || 0;
                    const custFixed = parseFloat(assocRows[0].commission_customer_fixed) || 0;
                    if (custPct > 0 || custFixed > 0) {
                        assocCustomerOverrideAmount = (fareDetails.finalFare * (custPct / 100)) + custFixed;
                        fareDetails.finalFare = fareDetails.finalFare + Math.ceil(assocCustomerOverrideAmount);
                    }
                }
            }
        }
        
        const finalFareStr = "₹" + fareDetails.finalFare;
        const distanceStr = distanceCovered.toFixed(3) + " KM";

        await commissionEngine.settleRideFinancials(db, {
            bookingId,
            distanceKm: distanceCovered,
            category: finalCategory,
            vehicleType: booking.vehicle_type,
            baseKmFare: fareDetails.baseKmFare,
            waitingCharge: fareDetails.waitingCharge,
            extraDropsCharge: fareDetails.extraDropsCharge,
            peakCharge: fareDetails.peakCharge,
            specialCharge: fareDetails.specialCharge,
            finalFare: fareDetails.finalFare,
            vendorMarkup,
            driverId: booking.driver_id,
            vendorId: booking.vendor_id,
            associationId: booking.association_id,
            assocCustomerOverrideAmount
        });

        // Update booking status
        const nextStatus = (booking.vendor_id || finalCategory === 'local') ? "completed" : "finished";
        await db.query(
            'UPDATE taxi_bookings SET status = ?, end_odometer = ?, journey_end_time = NOW(), fare = ?, actual_distance = ?, distance = ?, end_gps_coords = ?, trip_type = ? WHERE id = ?',
            [nextStatus, endOdometer || null, finalFareStr, distanceStr, distanceStr, endCoords, finalCategory, bookingId]
        );

        activeRidesGpsState.delete(bookingId);

        if (booking.user_id) {
            emitEvent(`user:${booking.user_id}`, 'booking_status_update', { bookingId, status: nextStatus, finalFare: finalFareStr });
        }
        emitEvent('admin', 'booking_status_update', { bookingId, status: nextStatus, driverId: booking.driver_id });
        emitEvent(`booking:${bookingId}`, 'booking_status_update', { bookingId, status: nextStatus });

        return res.json({
            success: true,
            finalFare: finalFareStr,
            distance: distanceCovered.toFixed(3),
            duration: durationMins.toFixed(1),
            waitingCharge: fareDetails.waitingCharge,
            vendorProfit: vendorMarkup,
            status: nextStatus
        });
    } catch (err) {
        console.error("finish-trip error:", err);
        res.status(500).json({ error: err.message });
    }
});

const lastGpsDbUpdate = {};

// GPS tracking & deviation calculations in real-time
app.post('/api/bookings/update-gps-location', authenticateJWT, requireRole(['driver']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId, latitude, longitude, accuracy, speed, clientDistance } = req.body;
        if (!bookingId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'bookingId, latitude, and longitude are required.' });
        }

        const now = Date.now();
        const lastUpdate = lastGpsDbUpdate[bookingId] || 0;

        // Fast-path: Broadcast live location in ms without heavy DB recalculations if within 10s throttle window
        if (now - lastUpdate < 10000) {
            const [fastBookings] = await db.query('SELECT user_id, driver_id, status FROM taxi_bookings WHERE id = ?', [bookingId]);
            if (fastBookings.length > 0) {
                const bk = fastBookings[0];
                if (bk.status === 'ongoing') {
                    if (bk.user_id) emitEvent(`user:${bk.user_id}`, 'driver_location', { bookingId, latitude, longitude });
                    emitEvent(`booking:${bookingId}`, 'driver_location', { bookingId, latitude, longitude });
                }
            }
            return res.json({ success: true, message: 'Fast GPS broadcasted (DB throttled)', isDeviated: false });
        }

        lastGpsDbUpdate[bookingId] = now;

        // 1. Insert into logs table
        await db.query(
            'INSERT INTO taxi_ride_gps_logs (booking_id, latitude, longitude, accuracy, speed) VALUES (?, ?, ?, ?, ?)',
            [bookingId, latitude, longitude, accuracy || 0, speed || 0]
        );

        // 2. Fetch booking details
        const [bookings] = await db.query('SELECT * FROM taxi_bookings WHERE id = ?', [bookingId]);
        if (bookings.length === 0) return res.status(404).json({ error: 'Booking not found.' });
        const booking = bookings[0];

        // Only recalculate if ongoing
        if (booking.status !== 'ongoing') {
            return res.json({ success: true, message: 'GPS logged, booking is not ongoing.', isDeviated: false });
        }

        // Gracefully ignore null or NaN coordinate updates for calculations
        if (latitude === null || longitude === null || isNaN(latitude) || isNaN(longitude)) {
            return res.json({
                success: true,
                message: 'GPS logged, but invalid coordinates ignored for recalculations.',
                isDeviated: false,
                newFare: booking.fare,
                totalDistance: booking.distance,
                actualDistance: booking.actual_distance || '0.0 KM',
                elapsedMins: 0,
                allowedMins: 0,
                waitingCharge: 0
            });
        }

        // 3. Calculate actual distance traveled so far (odometer-style) using cached Kalman filter state
        let startCoords = booking.start_gps_coords || null;
        if (startCoords === 'null,null') {
            startCoords = null;
        }

        let serverDistKm = 0;
        try {
            serverDistKm = await processNewGpsPoint(
                bookingId,
                parseFloat(latitude),
                parseFloat(longitude),
                parseFloat(accuracy || 0),
                parseFloat(speed || 0),
                startCoords,
                booking.journey_start_time
            );
        } catch (e) {
            console.error(`[GPS Cache Error #${bookingId}] Falling back to DB distance calculation:`, e.message);
            serverDistKm = await calculateOdometerDistance(bookingId, startCoords, booking.journey_start_time);
        }

        let actualDistKm = serverDistKm;

        if (clientDistance !== undefined && clientDistance !== null) {
            const parsedClientDist = parseFloat(clientDistance);
            if (!isNaN(parsedClientDist) && parsedClientDist > 0) {
                // Security check: driver's client distance should be within 15% + 2km of server-calculated distance
                const maxAllowedClientDist = serverDistKm * 1.15 + 2.0;
                if (parsedClientDist <= maxAllowedClientDist) {
                    actualDistKm = parsedClientDist;
                }
            }
        }

        // 4. Check for deviation from planned route - Disabled to ignore initial location selection
        let isDeviated = 0;

        // 5. Calculate remaining distance to destination - Disabled to base fare strictly on actual distance traveled
        let remainingDistKm = 0;

        const totalDistance = actualDistKm;

        // Calculate pre-ride waiting charge (5 min grace time, then \u20B92/min)
        let preRideWaitingCharge = 0;
        if (booking.reached_pickup_time && booking.journey_start_time) {
            const reachedTime = new Date(booking.reached_pickup_time);
            const startTime = new Date(booking.journey_start_time);
            if (startTime > reachedTime) {
                const preRideElapsedMins = (startTime - reachedTime) / (1000 * 60);
                preRideWaitingCharge = Math.max(0, Math.ceil((preRideElapsedMins - 5) * 2));
            }
        }

        // 5.1 Calculate elapsed time and waiting charge
        let elapsedMins = 0;
        if (booking.journey_start_time) {
            const startTime = new Date(booking.journey_start_time);
            const durationMs = new Date() - startTime;
            elapsedMins = Math.max(0, durationMs / (1000 * 60));
        }
        let allowedMins = 0;
        let waitingCharge = 0;
        if (booking.trip_type === 'rental') {
            const packageVal = booking.rental_package || '2-20';
            const [pMaxHrs] = packageVal.split('-').map(Number);
            allowedMins = pMaxHrs * 60;
            if (elapsedMins > allowedMins) {
                waitingCharge = (elapsedMins - allowedMins) * 2;
            }
        } else if (['local', 'oneway', 'round'].includes(booking.trip_type)) {
            waitingCharge = preRideWaitingCharge;
        }

        // 6. Recalculate Fare (check vendor tariff first, then system fallback)
        let totalFare = 0;
        let pricingConfig = null;
        const categoryKey = booking.trip_type === 'rental' ? 'rental' : booking.trip_type;
        if (booking.vendor_id) {
            const [vendorTariffRows] = await db.query('SELECT config FROM taxi_vendor_tariffs WHERE vendor_id = ? AND vehicle_type = ? AND category = ?', [booking.vendor_id, booking.vehicle_type, categoryKey]);
            if (vendorTariffRows.length > 0) {
                pricingConfig = typeof vendorTariffRows[0].config === 'string' ? JSON.parse(vendorTariffRows[0].config) : vendorTariffRows[0].config;
            }
        }
        if (!pricingConfig) {
            const [tariffRows] = await db.query('SELECT config FROM taxi_tariffs WHERE vehicle_type = ? AND category = ?', [booking.vehicle_type, categoryKey]);
            if (tariffRows.length > 0) {
                pricingConfig = typeof tariffRows[0].config === 'string' ? JSON.parse(tariffRows[0].config) : tariffRows[0].config;
            }
        }

        const [peakRules] = await db.query('SELECT * FROM taxi_peak_rules WHERE is_active = 1');
        const peakMult = getPeakMultiplier(booking.pickup_time, peakRules);

        let extraDropsCharge = 0;
        try {
            if (booking.extra_drops) {
                const stops = typeof booking.extra_drops === 'string' ? JSON.parse(booking.extra_drops) : booking.extra_drops;
                if (Array.isArray(stops)) {
                    if (booking.trip_type === 'local') {
                        extraDropsCharge = stops.length * 50;
                    } else if (booking.trip_type === 'oneway') {
                        extraDropsCharge = stops.length * 50;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to parse extra_drops in GPS-update calculation", e);
        }

        if (booking.trip_type === 'local') {
            const config = pricingConfig || { base: 150, perKm: 20, minKm: 0 };
            const minKm = typeof config.minKm === 'number' ? config.minKm : 0;
            const billableDist = Math.max(totalDistance, minKm);
            const baseKmFare = calculateLocalSlabFare(billableDist, config);
            const peakCharge = baseKmFare * peakMult;
            totalFare = (baseKmFare + peakCharge + waitingCharge + extraDropsCharge) + 5;
        } else if (booking.trip_type === 'oneway') {
            const config = pricingConfig || { base: 0, perKm: 13, minKm: 130 };
            const baseFare = config.base || 0;
            const minKm = typeof config.minKm === 'number' ? config.minKm : 130;
            const billableDist = Math.max(totalDistance, minKm);
            const distanceFare = billableDist * (config.perKm || 13);
            const baseKmFare = Math.max(baseFare, distanceFare);
            const driverAllowance = billableDist > 250 ? 600 : 400;
            totalFare = (baseKmFare + (booking.vehicle_type === 'bike' ? 0 : driverAllowance) + waitingCharge + extraDropsCharge) + 5;
        } else if (booking.trip_type === 'round') {
            const config = pricingConfig || { base: 0, perKm: 12, minKmPerDay: 250 };
            const baseFare = config.base || 0;
            let tripDays = 1;
            if (booking.return_date && booking.pickup_date) {
                const start = new Date(booking.pickup_date);
                const end = new Date(booking.return_date);
                if (end > start) {
                    const diffTime = Math.abs(end - start);
                    tripDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                }
            }
            const minKmForTrip = (typeof config.minKmPerDay === 'number' ? config.minKmPerDay : 250) * tripDays;
            const billableDist = Math.max(totalDistance, minKmForTrip);
            const distanceFare = billableDist * (config.perKm || 12);
            const baseKmFare = Math.max(baseFare, distanceFare);
            const driverAllowance = billableDist > 250 ? 600 : 400;
            totalFare = ((baseKmFare + (booking.vehicle_type === 'bike' ? 0 : driverAllowance * tripDays)) + waitingCharge) + 5;
        } else if (booking.trip_type === 'rental') {
            const packageVal = booking.rental_package || '2-20';
            const [pMaxHrs, pMaxKm] = packageVal.split('-').map(Number);
            const packageConfig = (pricingConfig && pricingConfig[packageVal]) || { base: 600, extraKm: 18, extraHour: 150 };

            const extraKm = Math.max(0, actualDistKm - pMaxKm);
            const extraKmCharge = extraKm * packageConfig.extraKm;

            const startTime = new Date(booking.journey_start_time);
            const durationMs = new Date() - startTime;
            const durationHrs = durationMs / (1000 * 60 * 60);
            const extraHrs = Math.max(0, Math.ceil(durationHrs - pMaxHrs));
            const extraHourCharge = extraHrs * packageConfig.extraHour;

            totalFare = (packageConfig.base + extraKmCharge + extraHourCharge + waitingCharge) + 5;
        }

        // --- Hybrid Association Commission Overrides ---
        let assocCustomerOverrideAmount = 0;
        if (booking.driver_id) {
            const [drvRows] = await db.query('SELECT association_id FROM taxi_drivers WHERE id = ?', [booking.driver_id]);
            if (drvRows.length > 0 && drvRows[0].association_id) {
                const [assocRows] = await db.query('SELECT commission_customer_pct, commission_customer_fixed FROM taxi_associations WHERE id = ?', [drvRows[0].association_id]);
                if (assocRows.length > 0) {
                    const custPct = parseFloat(assocRows[0].commission_customer_pct) || 0;
                    const custFixed = parseFloat(assocRows[0].commission_customer_fixed) || 0;
                    if (custPct > 0 || custFixed > 0) {
                        assocCustomerOverrideAmount = (totalFare * (custPct / 100)) + custFixed;
                        totalFare = totalFare + assocCustomerOverrideAmount;
                    }
                }
            }
        }

        const finalFare = `\u20B9${Math.ceil(totalFare)}`;
        const distanceStr = `${totalDistance.toFixed(3)} KM`;

        await db.query(
            'UPDATE taxi_bookings SET fare = ?, actual_distance = ?, is_deviated = ? WHERE id = ?',
            [finalFare, `${actualDistKm.toFixed(3)} KM`, isDeviated, bookingId]
        );

        // 🔴 Socket.IO: Push driver GPS position and live fare to passenger
        const userId = booking.user_id;
        if (userId && latitude !== undefined && longitude !== undefined) {
            emitEvent(`user:${userId}`, 'driver_location', {
                bookingId,
                latitude,
                longitude,
                newFare: finalFare,
                actualDistance: `${actualDistKm.toFixed(3)} KM`,
                waitingCharge: Math.ceil(waitingCharge)
            });
        }
        emitEvent(`booking:${bookingId}`, 'driver_location', { bookingId, latitude, longitude, newFare: finalFare });

        res.json({
            success: true,
            isDeviated: isDeviated === 1,
            newFare: finalFare,
            totalDistance: booking.estimated_distance || booking.distance || '0 KM',
            actualDistance: `${actualDistKm.toFixed(3)} KM`,
            elapsedMins: Math.ceil(elapsedMins),
            allowedMins: Math.ceil(allowedMins),
            waitingCharge: Math.ceil(waitingCharge)
        });

    } catch (err) {
        console.error('Error in update-gps-location:', err);
        res.status(500).json({ error: err.message });
    }
});

// Bulk upload GPS logs collected offline
app.post('/api/bookings/upload-gps-logs-bulk', authenticateJWT, requireRole(['driver']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId, logs } = req.body;
        if (!bookingId || !Array.isArray(logs) || logs.length === 0) {
            return res.json({ success: true, message: 'No offline logs to sync.' });
        }

        const values = logs.map(log => [
            bookingId,
            log.latitude,
            log.longitude,
            log.accuracy || 0,
            log.speed || 0,
            log.time ? new Date(log.time) : new Date()
        ]);

        await db.query(
            'INSERT INTO taxi_ride_gps_logs (booking_id, latitude, longitude, accuracy, speed, created_at) VALUES ?',
            [values]
        );

        console.log(`[Offline Sync #${bookingId}] Bulk inserted ${logs.length} GPS logs.`);
        res.json({ success: true, message: `Successfully synced ${logs.length} offline GPS logs.` });
    } catch (err) {
        console.error('Error in upload-gps-logs-bulk:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bookings/nearby-drivers/:bookingId', authenticateJWT, requireRole(['user']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const [bookingRows] = await db.query('SELECT pickup_loc_lat, pickup_loc_lng, vehicle_type FROM taxi_bookings WHERE id = ?', [bookingId]);
        if (bookingRows.length === 0) return res.json([]);
        const booking = bookingRows[0];
        const pickupLat = parseFloat(booking.pickup_loc_lat);
        const pickupLng = parseFloat(booking.pickup_loc_lng);
        const vType = String(booking.vehicle_type || 'sedan').toLowerCase();

        if (isNaN(pickupLat) || isNaN(pickupLng)) return res.json([]);

        const [drivers] = await db.query(
            "SELECT id, latitude, longitude FROM taxi_drivers WHERE is_online = 1 AND is_blocked = 0 AND latitude IS NOT NULL AND longitude IS NOT NULL AND LOWER(vehicle_type) = ?",
            [vType]
        );

        const nearbyDrivers = [];
        drivers.forEach(d => {
            const dLat = parseFloat(d.latitude);
            const dLng = parseFloat(d.longitude);
            if (!isNaN(dLat) && !isNaN(dLng)) {
                const dist = getDistance(dLat, dLng, pickupLat, pickupLng);
                if (dist <= 15) nearbyDrivers.push({ id: d.id, latitude: dLat, longitude: dLng });
            }
        });
        res.json(nearbyDrivers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bookings/driver-location/:bookingId', authenticateJWT, requireRole(['driver', 'user', 'admin']), verifyBookingAccess, async (req, res) => {
    try {
        const { bookingId } = req.params;
        const [rows] = await db.query('SELECT latitude, longitude, accuracy, speed, created_at FROM taxi_ride_gps_logs WHERE booking_id = ? ORDER BY id DESC LIMIT 1', [bookingId]);
        if (rows.length === 0) {
            return res.json({ latitude: null, longitude: null, accuracy: null, speed: 0 });
        }
        res.json({
            latitude: parseFloat(rows[0].latitude),
            longitude: parseFloat(rows[0].longitude),
            accuracy: parseFloat(rows[0].accuracy),
            speed: parseFloat(rows[0].speed) || 0,
            timestamp: rows[0].created_at
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- GEOCODING PROXY (To avoid CORS issues with Photon API) ---
// --- Typo correction map for common Indian location names ---
const LOCATION_CORRECTIONS = {
    // Chennai variants
    'chenai': 'Chennai', 'chenni': 'Chennai', 'chenna': 'Chennai', 'chnai': 'Chennai',
    'chennnai': 'Chennai', 'chennaai': 'Chennai', 'chneai': 'Chennai', 'cheanai': 'Chennai',
    'madras': 'Chennai',
    // Bangalore/Bengaluru
    'bangalor': 'Bengaluru', 'bangalore': 'Bengaluru', 'bangaluru': 'Bengaluru',
    'bangalr': 'Bengaluru', 'banglore': 'Bengaluru', 'bengalur': 'Bengaluru',
    // Mumbai
    'bomby': 'Mumbai', 'bombay': 'Mumbai', 'mumbay': 'Mumbai', 'mumba': 'Mumbai',
    // Delhi
    'dilli': 'Delhi', 'new delh': 'New Delhi', 'newdelhi': 'New Delhi', 'dehli': 'Delhi',
    // Hyderabad
    'hydrabad': 'Hyderabad', 'heydrabad': 'Hyderabad', 'hyderbad': 'Hyderabad',
    // Coimbatore
    'coimbator': 'Coimbatore', 'coimbatour': 'Coimbatore', 'kovai': 'Coimbatore', 'cbe': 'Coimbatore',
    'koimbatore': 'Coimbatore',
    // Madurai
    'madura': 'Madurai', 'maduarai': 'Madurai',
    // Trichy/Tiruchirappalli
    'trichy': 'Tiruchirappalli', 'tiruchi': 'Tiruchirappalli', 'tiruchy': 'Tiruchirappalli',
    // Salem
    'salm': 'Salem',
    // Tirupati
    'tirupathi': 'Tirupati', 'thirupati': 'Tirupati', 'thirupathi': 'Tirupati',
    // Vellore
    'velor': 'Vellore', 'vellor': 'Vellore',
    // Pondicherry
    'pondi': 'Puducherry', 'pondicherry': 'Puducherry', 'puduchery': 'Puducherry',
    // Kolkata
    'calcuta': 'Kolkata', 'calcutta': 'Kolkata', 'kolkatta': 'Kolkata',
    // Ahmedabad
    'ahmedab': 'Ahmedabad', 'ahemdabad': 'Ahmedabad', 'amdavad': 'Ahmedabad',
    // Pune
    'poona': 'Pune', 'puna': 'Pune',
    // Jaipur
    'jaipour': 'Jaipur', 'jaypur': 'Jaipur',
    // Common place type misspellings
    'airpot': 'airport', 'ariport': 'airport', 'airprt': 'airport', 'airoport': 'airport',
    'aeropot': 'airport', 'airprot': 'airport',
    'staion': 'station', 'staiton': 'station', 'staton': 'station', 'railwy': 'railway',
    'busstand': 'bus stand', 'busstadn': 'bus stand', 'bustand': 'bus stand',
    'hospitol': 'hospital', 'hosptal': 'hospital',
    'colege': 'college', 'collge': 'college',
    'universty': 'university', 'univercity': 'university',
    'tempple': 'temple', 'templ': 'temple',
    'shoping': 'shopping', 'shooping': 'shopping',
};

function correctLocationSpelling(query) {
    let corrected = query.toLowerCase().trim();
    let wasCorrected = false;
    for (const [typo, correction] of Object.entries(LOCATION_CORRECTIONS)) {
        if (corrected.includes(typo)) {
            corrected = corrected.replace(new RegExp(typo, 'gi'), correction);
            wasCorrected = true;
        }
    }
    return { corrected, wasCorrected, original: query };
}

function mapNominatimFeature(item) {
    const addr = item.address || {};
    const name = item.name || addr.shop || addr.amenity || addr.tourism || addr.aeroway || addr.building || '';
    const road = addr.road || addr.pedestrian || addr.footway || '';
    const suburb = addr.suburb || addr.neighbourhood || addr.quarter || '';
    const village = addr.village || addr.hamlet || '';
    const city = addr.city || addr.town || addr.county || addr.state_district || '';
    const state = addr.state || '';
    return {
        geometry: { coordinates: [parseFloat(item.lon), parseFloat(item.lat)] },
        properties: { name, road, suburb, village, city, state, display_name: item.display_name }
    };
}

app.get('/api/proxy/geocode', async (req, res) => {
    try {
        const { q, limit } = req.query;
        const apiLimit = parseInt(limit) || 8;

        let allResults = [];
        let correctedQuery = null;

        // Run Photon and Nominatim in PARALLEL for speed
        const [photonResult, nominatimResult] = await Promise.allSettled([
            // --- SOURCE 1: Photon (Komoot) — returns villages, shops, hamlets, POIs ---
            (async () => {
                // Location-bias towards India center (lat=20.5, lon=78.9) — no invalid filter params
                const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${Math.min(apiLimit + 4, 15)}&lang=en&lat=20.5937&lon=78.9629`;
                const photonRes = await axios.get(photonUrl, { headers: { 'User-Agent': 'CityRideTaxiApp/1.0' }, timeout: 5000 });
                return photonRes.data;
            })(),
            // --- SOURCE 2: Nominatim — structured addresses, good fallback ---
            (async () => {
                // Do NOT append ", India" — it kills shop/POI name matches
                const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=${apiLimit}&countrycodes=in&dedupe=1`;
                const nomRes = await axios.get(nomUrl, { headers: { 'User-Agent': 'CityRideTaxiApp/1.0' }, timeout: 8000 });
                return nomRes.data;
            })()
        ]);

        // Process Photon results
        if (photonResult.status === 'fulfilled' && photonResult.value && photonResult.value.features) {
            const features = photonResult.value.features.filter(f => {
                const country = (f.properties.country || '').toLowerCase();
                return country === 'india' || country === '';
            });
            features.forEach(f => {
                const p = f.properties;
                const coords = f.geometry.coordinates; // [lng, lat]
                allResults.push({
                    geometry: { coordinates: coords },
                    properties: {
                        name: p.name || '',
                        road: p.street || '',
                        suburb: p.district || p.locality || '',
                        city: p.city || p.county || '',
                        state: p.state || '',
                        village: p.locality || '',
                        display_name: [p.name, p.street, p.locality, p.district, p.city, p.state].filter(Boolean).join(', ')
                    }
                });
            });
        } else {
            console.warn('Photon geocode failed:', photonResult.reason?.message || 'unknown');
        }

        // Process Nominatim results
        if (nominatimResult.status === 'fulfilled' && nominatimResult.value && nominatimResult.value.length > 0) {
            nominatimResult.value.forEach(item => {
                allResults.push(mapNominatimFeature(item));
            });
        } else if (nominatimResult.status === 'fulfilled') {
            // No Nominatim results — try spell correction
            const { corrected, wasCorrected } = correctLocationSpelling(q);
            if (wasCorrected) {
                try {
                    const nomUrl2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(corrected)}&format=json&addressdetails=1&limit=${apiLimit}&countrycodes=in&dedupe=1`;
                    const nomRes2 = await axios.get(nomUrl2, { headers: { 'User-Agent': 'CityRideTaxiApp/1.0' }, timeout: 8000 });
                    if (nomRes2.data && nomRes2.data.length > 0) {
                        nomRes2.data.forEach(item => allResults.push(mapNominatimFeature(item)));
                        correctedQuery = corrected.replace(/, india$/i, '').trim();
                    }
                } catch (e2) { /* ignore */ }
            }
        }

        // --- DEDUPLICATE by coordinates (~100m precision) ---
        const seen = new Set();
        const unique = [];
        for (const f of allResults) {
            const key = `${f.geometry.coordinates[0].toFixed(3)},${f.geometry.coordinates[1].toFixed(3)}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(f);
            }
        }

        res.json({ features: unique.slice(0, apiLimit), correctedQuery });
    } catch (err) {
        console.error('Geocode Proxy Error:', err.message);
        res.status(500).json({ error: 'Geocoding service unavailable via proxy.' });
    }
});

app.get('/api/proxy/reverse', async (req, res) => {
    try {
        const { lon, lat } = req.query;
        const url = `https://nominatim.openstreetmap.org/reverse?lon=${lon}&lat=${lat}&format=json&addressdetails=1`;
        const response = await axios.get(url, { headers: { 'User-Agent': 'CityRideTaxiApp/1.0' }, timeout: 8000 });

        const item = response.data;
        if (item.error) { return res.json({ features: [] }); }

        const addr = item.address || {};
        const name = item.name || addr.aeroway || addr.amenity || addr.building || '';
        const road = addr.road || addr.pedestrian || addr.footway || '';
        const suburb = addr.suburb || addr.neighbourhood || addr.quarter || '';
        const city = addr.city || addr.town || addr.village || addr.county || addr.state_district || '';
        const state = addr.state || '';

        const features = [{
            geometry: { coordinates: [parseFloat(item.lon), parseFloat(item.lat)] },
            properties: { name, road, suburb, city, state, display_name: item.display_name }
        }];
        res.json({ features });
    } catch (err) {
        console.error('Reverse Geocode Proxy Error:', err.message);
        res.status(500).json({ error: 'Reverse geocoding service unavailable via proxy.' });
    }
});

app.get('/api/proxy/route', async (req, res) => {
    try {
        const { pickup, drop, extraDrops } = req.query;
        let coordsStr = pickup;
        if (extraDrops) {
            coordsStr += ';' + extraDrops;
        }
        coordsStr += ';' + drop;
        // Fetch full route geometry for map drawing
        const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (err) {
        console.error('Route Proxy Error:', err.message);
        res.status(500).json({ error: 'Routing service unavailable via proxy.' });
    }
});

// --- CONFIGURATION & UTILITIES ---
app.get('/api/config/maps-key', (req, res) => {
    res.json({ mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || '' });
});

// --- RATE TARIFF CONTROLLER ---
app.get('/api/tariffs', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        let associationId = null;

        // If location is provided, find if it falls within any Association's jurisdiction
        if (lat && lng) {
            const sqlAssoc = `
                SELECT id, name, commission_type, commission_value,
                    ( 6371 * acos( cos( radians(?) ) * cos( radians( lat ) ) * cos( radians( lng ) - radians(?) ) + sin( radians(?) ) * sin( radians( lat ) ) ) ) AS distance 
                FROM taxi_associations 
                WHERE is_active = 1
                HAVING distance <= radius_km 
                ORDER BY distance ASC 
                LIMIT 1
            `;
            const [assocs] = await db.query(sqlAssoc, [lat, lng, lat]);
            if (assocs.length > 0) {
                associationId = assocs[0].id;
                // We return the association details in headers so the frontend knows
                res.setHeader('X-Association-ID', associationId);
                res.setHeader('X-Association-Name', assocs[0].name);
            }
        }

        if (associationId) {
            // Fetch association specific tariffs
            const [assocTariffs] = await db.query('SELECT * FROM taxi_association_tariffs WHERE association_id = ?', [associationId]);
            if (assocTariffs.length > 0) {
                return res.json(assocTariffs);
            }
        }

        // Fallback to global tariffs if no association found, or association has no custom tariffs configured yet
        const [rows] = await db.query('SELECT * FROM taxi_tariffs');
        res.json(rows);
    } catch (err) {
        console.error('Tariffs error:', err.message);
        res.status(500).json({ error: 'Failed to fetch tariffs' });
    }
});

app.post('/api/admin/update-tariff', async (req, res) => {
    try {
        const { id, config } = req.body;
        if (!id || !config) return res.status(400).json({ error: 'ID and config are required.' });

        await db.query('UPDATE taxi_tariffs SET config = ? WHERE id = ?', [JSON.stringify(config), id]);
        res.json({ success: true, message: 'Tariff updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update tariff.' });
    }
});

// --- LIVE MONITOR API ---

// SSE Stream for real-time log events
app.get('/api/monitor/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Purely live stream — no historical replay on connect

    // Add this client
    monitorClients.add(res);

    // Keep-alive ping every 25 seconds
    const keepAlive = setInterval(() => {
        try { res.write(':ping\n\n'); } catch (e) { clearInterval(keepAlive); }
    }, 25000);

    req.on('close', () => {
        clearInterval(keepAlive);
        monitorClients.delete(res);
    });
});

// DB Stats - get row counts for all main tables
app.get('/api/monitor/stats', async (req, res) => {
    try {
        const tables = [
            'taxi_bookings', 'taxi_drivers', 'taxi_passengers', 'passengers',
            'taxi_vendors', 'taxi_tariffs', 'taxi_peak_rules', 'taxi_special_location_charges'
        ];
        const stats = {};
        for (const table of tables) {
            try {
                const [[row]] = await db.query(`SELECT COUNT(*) as count FROM \`${table}\``);
                Reflect.set(stats, table, row.count);
            } catch (e) { Reflect.set(stats, table, 0); }
        }

        // Recent activity counts (last 24h)
        const [[bookings24h]] = await db.query(`SELECT COUNT(*) as count FROM taxi_bookings WHERE created_at >= NOW() - INTERVAL 24 HOUR`).catch(() => [[{ count: 0 }]]);
        const [[activeDrivers]] = await db.query(`SELECT COUNT(*) as count FROM taxi_drivers WHERE status = 'active'`).catch(() => [[{ count: 0 }]]);

        res.json({
            tables: stats,
            bookings24h: bookings24h.count,
            activeDrivers: activeDrivers.count,
            connectedClients: monitorClients.size,
            logBufferSize: activityLog.length,
            authStats
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Full log history dump
app.get('/api/monitor/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    res.json(activityLog.slice(0, limit));
});

// --- PEAK RULES CONTROLLER ---
app.get('/api/peak-rules', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_peak_rules ORDER BY start_time ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch peak rules' });
    }
});

app.post('/api/admin/peak-rules/add', async (req, res) => {
    try {
        const { start_time, end_time, surcharge_percentage } = req.body;
        await db.query('INSERT INTO taxi_peak_rules (start_time, end_time, surcharge_percentage) VALUES (?, ?, ?)',
            [start_time, end_time, surcharge_percentage]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add peak rule' });
    }
});

app.post('/api/admin/peak-rules/update', async (req, res) => {
    try {
        const { id, start_time, end_time, surcharge_percentage } = req.body;
        await db.query('UPDATE taxi_peak_rules SET start_time = ?, end_time = ?, surcharge_percentage = ? WHERE id = ?',
            [start_time, end_time, surcharge_percentage, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update peak rule' });
    }
});

app.post('/api/admin/peak-rules/delete', async (req, res) => {
    try {
        const { id } = req.body;
        await db.query('DELETE FROM taxi_peak_rules WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete peak rule' });
    }
});

// --- SPECIAL LOCATION CHARGES CONTROLLER ---
app.get('/api/special-location-charges', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM taxi_special_location_charges ORDER BY id ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch special location charges' });
    }
});

app.post('/api/admin/special-location-charges/add', async (req, res) => {
    try {
        const { place_type, display_name, surcharge_percentage } = req.body;
        if (!place_type || !display_name) return res.status(400).json({ error: 'place_type and display_name are required.' });
        const safePlaceType = String(place_type).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        await db.query(
            'INSERT INTO taxi_special_location_charges (place_type, display_name, surcharge_percentage) VALUES (?, ?, ?)',
            [safePlaceType, display_name, parseFloat(surcharge_percentage) || 0]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('ADD SPECIAL CHARGE ERR:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.json({ error: 'This place type already exists. Please edit it instead of adding a new one.' });
        }
        res.json({ error: 'Failed to add special location charge.' });
    }
});

app.post('/api/admin/special-location-charges/update', async (req, res) => {
    try {
        const { id, display_name, surcharge_percentage, is_active } = req.body;
        if (!id) return res.status(400).json({ error: 'ID is required.' });
        await db.query(
            'UPDATE taxi_special_location_charges SET display_name = ?, surcharge_percentage = ?, is_active = ? WHERE id = ?',
            [display_name, parseFloat(surcharge_percentage) || 0, is_active ? 1 : 0, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update special location charge.' });
    }
});

app.post('/api/admin/special-location-charges/toggle', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID is required.' });
        await db.query('UPDATE taxi_special_location_charges SET is_active = NOT is_active WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle special location charge.' });
    }
});

app.post('/api/admin/special-location-charges/delete', async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID is required.' });
        await db.query('DELETE FROM taxi_special_location_charges WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete special location charge.' });
    }
});

// --- TESTING UTILITIES ---
// Trigger the Daily Report manually for testing
app.get('/api/test/daily-report', async (req, res) => {
    console.log('--- MANUAL TEST REPORT TRIGGERED ---');
    try {
        await sendDailyReport();
        res.json({ success: true, message: 'Intel report triggered. Check sureshit2005@gmail.com inbox or check server console for status.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// --- DATABASE MANAGER API ---
// ============================================================

// Allowlist of manageable tables (excludes sensitive ones)
const MANAGEABLE_TABLES = [
    'taxi_bookings',
    'taxi_drivers',
    'taxi_passengers',
    'passengers',
    'taxi_admins',
    'taxi_vendors',
    'taxi_tariffs',
    'taxi_peak_rules',
    'taxi_driver_applications',
    'taxi_otps',
    'taxi_abort_rejections',
    'abort_rejections',
    'taxi_ride_gps_logs',
    'tariffs',
    'taxi_vendor_tariffs'
];

// Columns that should never be directly editable
const PROTECTED_COLUMNS = ['password', 'token', 'otp', 'secret'];

function isManageableTable(table) {
    return MANAGEABLE_TABLES.includes(table);
}

// GET /api/dbmanager/tables - list all tables with row counts
app.get('/api/dbmanager/tables', async (req, res) => {
    try {
        const result = [];
        for (const table of MANAGEABLE_TABLES) {
            try {
                const [[row]] = await db.query(`SELECT COUNT(*) as count FROM \`${table}\``);
                result.push({ name: table, rows: row.count });
            } catch (e) {
                result.push({ name: table, rows: 0, error: true });
            }
        }
        broadcastLog({ type: 'DB_MANAGER', op: 'LIST_TABLES', status: 'OK', ts: Date.now() });
        res.json({ tables: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dbmanager/schema/:table - get column definitions for a table
app.get('/api/dbmanager/schema/:table', async (req, res) => {
    const { table } = req.params;
    if (!isManageableTable(table)) return res.status(403).json({ error: 'Access denied to this table.' });
    try {
        const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
        // Mask protected columns info
        const safe = cols.map(c => ({
            field: c.Field,
            type: c.Type,
            nullable: c.Null === 'YES',
            key: c.Key,
            default: c.Default,
            extra: c.Extra,
            protected: PROTECTED_COLUMNS.some(p => c.Field.toLowerCase().includes(p))
        }));
        res.json({ columns: safe });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/dbmanager/rows/:table - get paginated rows
app.get('/api/dbmanager/rows/:table', async (req, res) => {
    const { table } = req.params;
    if (!isManageableTable(table)) return res.status(403).json({ error: 'Access denied to this table.' });
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const sortCol = req.query.sort || 'id';
    const sortDir = req.query.dir === 'desc' ? 'DESC' : 'ASC';

    try {
        // Get column names to validate sort column
        const [cols] = await db.query(`SHOW COLUMNS FROM \`${table}\``);
        const colNames = cols.map(c => c.Field);
        const safeSortCol = colNames.includes(sortCol) ? sortCol : (colNames.includes('id') ? 'id' : colNames[0]);

        let rows, total;

        if (search && colNames.length > 0) {
            // Build a LIKE search across text-like columns
            const textCols = cols.filter(c => /varchar|text|char|enum/i.test(c.Type)).map(c => `\`${c.Field}\` LIKE ?`);
            const whereClause = textCols.length > 0 ? `WHERE ${textCols.join(' OR ')}` : '';
            const searchParams = textCols.map(() => search);

            [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM \`${table}\` ${whereClause}`, searchParams);
            [rows] = await db.query(
                `SELECT * FROM \`${table}\` ${whereClause} ORDER BY \`${safeSortCol}\` ${sortDir} LIMIT ? OFFSET ?`,
                [...searchParams, limit, offset]
            );
        } else {
            [[{ total }]] = await db.query(`SELECT COUNT(*) as total FROM \`${table}\``);
            [rows] = await db.query(`SELECT * FROM \`${table}\` ORDER BY \`${safeSortCol}\` ${sortDir} LIMIT ? OFFSET ?`, [limit, offset]);
        }

        // Mask protected fields in response
        const safeRows = rows.map(row => {
            const safe = { ...row };
            for (const key of Object.keys(safe)) {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
                const val = Reflect.get(safe, key);
                if (PROTECTED_COLUMNS.some(p => key.toLowerCase().includes(p))) {
                    Reflect.set(safe, key, '***PROTECTED***');
                } else if (typeof val === 'string' && val.length > 500) {
                    Reflect.set(safe, key, val.substring(0, 80) + '... [TRUNCATED]');
                }
            }
            return safe;
        });

        res.json({ rows: safeRows, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/dbmanager/insert/:table - insert a new row
app.post('/api/dbmanager/insert/:table', async (req, res) => {
    const { table } = req.params;
    if (!isManageableTable(table)) return res.status(403).json({ error: 'Access denied to this table.' });
    const data = req.body;
    if (!data || Object.keys(data).length === 0) return res.status(400).json({ error: 'No data provided.' });

    // Remove protected fields from insert
    const cleanData = {};
    for (const [k, v] of Object.entries(data)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (!PROTECTED_COLUMNS.some(p => k.toLowerCase().includes(p))) {
            Reflect.set(cleanData, k, v === '' ? null : v);
        }
    }

    // Remove id (auto-increment)
    delete cleanData.id;

    const cols = Object.keys(cleanData);
    const vals = Object.values(cleanData);
    if (cols.length === 0) return res.status(400).json({ error: 'No valid columns to insert.' });

    try {
        const placeholders = cols.map(() => '?').join(', ');
        const [result] = await db.query(
            `INSERT INTO \`${table}\` (\`${cols.join('`, `')}\`) VALUES (${placeholders})`,
            vals
        );
        broadcastLog({ type: 'DB_MANAGER', op: 'INSERT', table, affectedId: result.insertId, status: 'OK', ts: Date.now() });
        res.json({ success: true, insertId: result.insertId });
    } catch (err) {
        broadcastLog({ type: 'DB_MANAGER', op: 'INSERT', table, status: 'ERROR', error: err.message, ts: Date.now() });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dbmanager/update/:table/:id - update a row by primary key
app.put('/api/dbmanager/update/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!isManageableTable(table)) return res.status(403).json({ error: 'Access denied to this table.' });
    const data = req.body;
    if (!data || Object.keys(data).length === 0) return res.status(400).json({ error: 'No data provided.' });

    // Remove protected + id fields
    const cleanData = {};
    for (const [k, v] of Object.entries(data)) {
        if (k === 'id' || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (!PROTECTED_COLUMNS.some(p => k.toLowerCase().includes(p))) {
            Reflect.set(cleanData, k, v === '' ? null : v);
        }
    }

    const cols = Object.keys(cleanData);
    const vals = Object.values(cleanData);
    if (cols.length === 0) return res.status(400).json({ error: 'No valid columns to update.' });

    try {
        const setParts = cols.map(c => `\`${c}\` = ?`).join(', ');
        const [result] = await db.query(`UPDATE \`${table}\` SET ${setParts} WHERE id = ?`, [...vals, id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Row not found.' });
        broadcastLog({ type: 'DB_MANAGER', op: 'UPDATE', table, affectedId: id, status: 'OK', ts: Date.now() });
        res.json({ success: true, affectedRows: result.affectedRows });
    } catch (err) {
        broadcastLog({ type: 'DB_MANAGER', op: 'UPDATE', table, affectedId: id, status: 'ERROR', error: err.message, ts: Date.now() });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/dbmanager/delete/:table/:id - delete a row by primary key
app.delete('/api/dbmanager/delete/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!isManageableTable(table)) return res.status(403).json({ error: 'Access denied to this table.' });
    try {
        const [result] = await db.query(`DELETE FROM \`${table}\` WHERE id = ?`, [id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Row not found.' });
        broadcastLog({ type: 'DB_MANAGER', op: 'DELETE', table, affectedId: id, status: 'OK', ts: Date.now() });
        res.json({ success: true });
    } catch (err) {
        broadcastLog({ type: 'DB_MANAGER', op: 'DELETE', table, affectedId: id, status: 'ERROR', error: err.message, ts: Date.now() });
        res.status(500).json({ error: err.message });
    }
});

// Tables that have credentials fields we allow managing
const PASSWORD_TABLES = ['taxi_passengers', 'passengers', 'taxi_drivers', 'taxi_admins', 'taxi_vendors', 'taxi_driver_applications'];

// GET /api/dbmanager/password/:table/:id - get the hashed credential for a row (for display)
app.get('/api/dbmanager/password/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!isManageableTable(table) || !PASSWORD_TABLES.includes(table)) {
        return res.status(403).json({ error: 'Password access not available for this table.' });
    }
    try {
        // Only fetch the credential column
        const [rows] = await db.query(`SELECT id, password FROM \`${table}\` WHERE id = ?`, [id]);
        if (!rows || rows.length === 0) return res.status(404).json({ error: 'Row not found.' });
        broadcastLog({ type: 'DB_MANAGER', op: 'VIEW_PASSWORD', table, affectedId: id, status: 'OK', ts: Date.now() });
        res.json({ id: rows[0].id, passwordHash: rows[0].password || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/dbmanager/password/:table/:id - update credential for a row (accepts plaintext, stores bcrypt hash)
app.put('/api/dbmanager/password/:table/:id', async (req, res) => {
    const { table, id } = req.params;
    if (!isManageableTable(table) || !PASSWORD_TABLES.includes(table)) {
        return res.status(403).json({ error: 'Password update not available for this table.' });
    }
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
        return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(newPassword.trim(), salt);
        const [result] = await db.query(`UPDATE \`${table}\` SET password = ? WHERE id = ?`, [hashed, id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Row not found.' });
        broadcastLog({ type: 'DB_MANAGER', op: 'UPDATE_PASSWORD', table, affectedId: id, status: 'OK', ts: Date.now() });
        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        broadcastLog({ type: 'DB_MANAGER', op: 'UPDATE_PASSWORD', table, affectedId: id, status: 'ERROR', error: err.message, ts: Date.now() });
        res.status(500).json({ error: err.message });
    }
});

// Route for DB Manager HTML
app.get('/dbmanager', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dbmanager.html')));

// --- ASSOCIATION ADMIN ROUTES ---
app.post('/api/association/login', authRateLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await db.query('SELECT * FROM taxi_associations WHERE admin_username = ?', [username]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });

        const assoc = rows[0];
        if (!assoc.is_active) return res.status(403).json({ error: 'Association account deactivated.' });

        const validPassword = await bcrypt.compare(password, assoc.admin_password);
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials.' });

        const token = jwt.sign({ id: assoc.id, role: 'association_admin', name: assoc.name }, JWT_SECRET, { expiresIn: '12h' });
        await setAuthCookie(res, req, { id: assoc.id, name: assoc.name }, 'association_admin');
        logAuthEvent({ event: 'LOGIN_SUCCESS', role: 'association_admin', identifier: username, status: 'OK', ip: req.ip, message: `Association admin logged in: ${assoc.name}` });
        res.json({ token, assocId: assoc.id, assocName: assoc.name });
    } catch (err) {
        res.status(500).json({ error: 'Login failed.' });
    }
});

app.get('/api/association/ledger', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const adminId = req.user.id;
        const [assocRows] = await db.query('SELECT id, city_name FROM taxi_associations WHERE admin_username = (SELECT username FROM taxi_admins WHERE id = ?)', [adminId]);
        if (assocRows.length === 0) return res.status(403).json({ error: 'Association profile not found' });
        const assocId = assocRows[0].id;

        const query = `
            SELECT 
                b.id as booking_id,
                b.created_at,
                b.pickup_loc,
                b.drop_loc,
                b.distance,
                b.fare,
                b.status,
                d.district,
                COALESCE(awt.amount, 0) as association_profit
            FROM taxi_bookings b
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id
            LEFT JOIN taxi_association_wallet_transactions awt ON awt.booking_id = b.id AND awt.type = 'credit'
            WHERE b.status = 'finished' AND b.association_id = ?
            ORDER BY b.created_at DESC LIMIT 500
        `;
        
        const [rows] = await db.query(query, [assocId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/association/stats', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [bookingRows] = await db.query(`
            SELECT status, COUNT(*) as count 
            FROM taxi_bookings 
            WHERE association_id = ? 
            GROUP BY status
        `, [assocId]);
        
        let stats = { pending: 0, assigned: 0, completed: 0, cancelled: 0 };
        bookingRows.forEach(row => {
            if (row.status === 'completed' || row.status === 'finished') stats.completed += row.count;
            else if (row.status === 'cancelled' || row.status === 'cancel_requested') stats.cancelled += row.count;
            else if (['pending', 'vendor_assigned'].includes(row.status)) stats.pending += row.count;
            else stats.assigned += row.count;
        });

        const [driverRows] = await db.query('SELECT COUNT(*) as count FROM taxi_drivers WHERE association_id = ?', [assocId]);
        stats.activePilots = driverRows[0].count;

        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load stats.' });
    }
});

app.get('/api/association/wallet', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [walletRows] = await db.query('SELECT * FROM taxi_association_wallets WHERE association_id = ?', [assocId]);
        if (walletRows.length === 0) return res.json({ balance: 0, total_earned: 0 });
        res.json(walletRows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load wallet.' });
    }
});

app.get('/api/association/transactions', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query('SELECT * FROM taxi_association_wallet_transactions WHERE association_id = ? ORDER BY created_at DESC LIMIT 50', [assocId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load transactions.' });
    }
});

app.get('/api/association/rides', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query(`
            SELECT b.*, 
                   COALESCE(u.name, tu.name) as customer_name, 
                   COALESCE(u.phone, tu.phone) as customer_phone,
                   d.name as driver_name,
                   d.phone as driver_phone
            FROM taxi_bookings b
            LEFT JOIN passengers u ON b.user_id = u.id
            LEFT JOIN taxi_passengers tu ON b.user_id = tu.id
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id
            WHERE b.association_id = ?
            ORDER BY b.created_at DESC LIMIT 100
        `, [assocId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load rides.' });
    }
});

app.get('/api/association/drivers', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query(`
            SELECT id, name, email, phone, car_model, car_number, vehicle_type, seating_capacity, 
                   ride_local, ride_oneway, ride_round, 
                   IF(is_blocked = 0, 1, 0) as is_active, 
                   is_online as is_available, 
                   wallet_balance, created_at
            FROM taxi_drivers
            WHERE association_id = ?
            ORDER BY created_at DESC
        `, [assocId]);
        res.json(rows);
    } catch (err) {
        console.error('Error in /api/association/drivers:', err);
        res.status(500).json({ error: 'Failed to load drivers: ' + err.message });
    }
});

app.post('/api/association/tariffs', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { vehicle_type, trip_type, config } = req.body;
        const vt = vehicle_type || 'sedan';
        const tt = trip_type || 'local';
        const configStr = typeof config === 'string' ? config : JSON.stringify(config);

        // Ensure updated_at exists or update config without relying on it
        try {
            await db.query('ALTER TABLE taxi_association_tariffs ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        } catch (e) {}

        await db.query(
            `INSERT INTO taxi_association_tariffs (association_id, trip_type, vehicle_type, config)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE config = ?`,
            [assocId, tt, vt, configStr, configStr]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating tariffs:', err);
        res.status(500).json({ error: 'Failed to update tariffs: ' + err.message });
    }
});

app.get('/api/association/tariffs', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query('SELECT trip_type, vehicle_type, config FROM taxi_association_tariffs WHERE association_id = ?', [assocId]);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching tariffs:', err);
        res.status(500).json({ error: err.message });
    }
});

// Association Admin: Wallet Top-Up/Deduct for drivers in their association
app.post('/api/association/wallet/adjust', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { driverId, amount, type, note } = req.body; // type: 'credit' or 'debit'
        if (!driverId || !amount || !type) return res.status(400).json({ error: 'driverId, amount, and type required.' });

        // Verify driver belongs to this association
        const [driverCheck] = await db.query('SELECT id, wallet_balance FROM taxi_drivers WHERE id = ? AND association_id = ?', [driverId, assocId]);
        if (driverCheck.length === 0) return res.status(403).json({ error: 'Driver not in your association.' });

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Invalid amount.' });

        if (type === 'credit') {
            await db.query('UPDATE taxi_drivers SET wallet_balance = wallet_balance + ? WHERE id = ?', [parsedAmount, driverId]);
        } else if (type === 'debit') {
            if (parseFloat(driverCheck[0].wallet_balance) < parsedAmount) {
                return res.status(400).json({ error: 'Insufficient driver wallet balance.' });
            }
            await db.query('UPDATE taxi_drivers SET wallet_balance = wallet_balance - ? WHERE id = ?', [parsedAmount, driverId]);
        } else {
            return res.status(400).json({ error: 'Invalid type. Use credit or debit.' });
        }

        await db.query(
            `INSERT INTO taxi_association_wallet_transactions (association_id, booking_id, driver_id, amount, type, note) VALUES (?, NULL, ?, ?, ?, ?)`,
            [assocId, driverId, parsedAmount, type, note || `Manual ${type} by Association Admin`]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Wallet adjustment failed: ' + err.message });
    }
});

// Association Admin: Create driver in their association
app.post('/api/association/drivers', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { name, email, password, phone, car_model, car_number, vehicle_type } = req.body;
        if (!name || !email || !password || !phone) return res.status(400).json({ error: 'Required fields missing.' });

        const [existing] = await db.query('SELECT id FROM taxi_drivers WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already in use.' });

        const hashedPwd = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            `INSERT INTO taxi_drivers (name, email, password, phone, car_model, car_number, vehicle_type, association_id, is_blocked, wallet_balance, approval_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'approved')`,
            [name, email, hashedPwd, phone, car_model || '', car_number || '', vehicle_type || 'sedan', assocId]
        );
        res.json({ success: true, driverId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create driver: ' + err.message });
    }
});

// Association Admin: Toggle driver active/inactive
app.post('/api/association/drivers/toggle', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { driverId } = req.body;

        const [check] = await db.query('SELECT id, is_blocked FROM taxi_drivers WHERE id = ? AND association_id = ?', [driverId, assocId]);
        if (check.length === 0) return res.status(403).json({ error: 'Driver not in your association.' });

        const newBlocked = check[0].is_blocked ? 0 : 1;
        await db.query('UPDATE taxi_drivers SET is_blocked = ? WHERE id = ?', [newBlocked, driverId]);
        res.json({ success: true, is_active: newBlocked === 0 ? 1 : 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle driver: ' + err.message });
    }
});

// Association Admin: Cancel a ride in their association
app.post('/api/association/bookings/cancel', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { bookingId } = req.body;

        const [check] = await db.query('SELECT id, status FROM taxi_bookings WHERE id = ? AND association_id = ?', [bookingId, assocId]);
        if (check.length === 0) return res.status(403).json({ error: 'Booking not in your association.' });
        if (['completed', 'finished', 'cancelled'].includes(check[0].status)) {
            return res.status(400).json({ error: 'Cannot cancel a ride that is already ' + check[0].status });
        }

        await db.query('UPDATE taxi_bookings SET status = ?, driver_id = NULL WHERE id = ?', ['cancelled', bookingId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to cancel booking.' });
    }
});

// --- ENTERPRISE ASSOCIATION ADMIN EXTENSIONS ---

// 1. Live GPS Radar (Map Data)
app.get('/api/association/live-pilots', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query(`
            SELECT id, name, phone, car_model, car_number, vehicle_type, latitude, longitude, is_online, is_blocked,
                   IF(is_blocked = 0, 1, 0) as is_active
            FROM taxi_drivers
            WHERE association_id = ?
        `, [assocId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch live pilots: ' + err.message });
    }
});

// 2. Pending Pilot Applications for District/Association
app.get('/api/association/applications', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [assocInfo] = await db.query('SELECT city_name FROM taxi_associations WHERE id = ?', [assocId]);
        const cityName = assocInfo[0] ? assocInfo[0].city_name : '';

        const [rows] = await db.query(`
            SELECT * FROM taxi_driver_applications
            WHERE association_id = ? OR district = ? OR district LIKE ?
            ORDER BY created_at DESC
        `, [assocId, cityName, `%${cityName}%`]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch applications: ' + err.message });
    }
});

// 3. Application Approval/Rejection by Association Admin
app.post('/api/association/applications/decision', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { appId, status, note } = req.body;
        if (!appId || !['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'appId and valid status required.' });
        }

        const [appRows] = await db.query('SELECT * FROM taxi_driver_applications WHERE id = ?', [appId]);
        if (appRows.length === 0) return res.status(404).json({ error: 'Application not found.' });
        const appObj = appRows[0];

        await db.query('UPDATE taxi_driver_applications SET status = ?, admin_note = ? WHERE id = ?', [status, note || '', appId]);

        if (status === 'approved') {
            const [existing] = await db.query('SELECT id FROM taxi_drivers WHERE email = ?', [appObj.email]);
            if (existing.length === 0) {
                // The password in taxi_driver_applications is already hashed during registration.
                await db.query(`
                    INSERT INTO taxi_drivers (name, profile_photo, email, password, phone, car_model, car_number, vehicle_type, seating_capacity, association_id, district, association_name, is_blocked, wallet_balance, approval_status, dl_front, dl_back, pvc, aadhar_front, aadhar_back, rc_book, insurance, pollution, permit, association_id_card)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    appObj.name, appObj.profile_photo, appObj.email, appObj.password, appObj.phone,
                    appObj.car_model || '', appObj.car_number || '', appObj.vehicle_type || 'sedan',
                    appObj.seating_capacity || 5, assocId, appObj.district || '', appObj.association_name || 'District Association',
                    appObj.dl_front, appObj.dl_back, appObj.pvc, appObj.aadhar_front, appObj.aadhar_back,
                    appObj.rc_book, appObj.insurance, appObj.pollution, appObj.permit, appObj.association_id_card
                ]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Application decision failed: ' + err.message });
    }
});

// 4. District Broadcast Alert to Pilots
app.post('/api/association/broadcast', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { title, message, priority } = req.body;
        if (!title || !message) return res.status(400).json({ error: 'Title and message required.' });

        if (io) {
            io.to(`assoc:${assocId}`).emit('district_broadcast', {
                title,
                message,
                priority: priority || 'normal',
                sender: 'District Association Admin',
                timestamp: Date.now()
            });
        }
        res.json({ success: true, message: 'Broadcast dispatched to district pilots.' });
    } catch (err) {
        res.status(500).json({ error: 'Broadcast failed: ' + err.message });
    }
});

// 5. Association Treasury Bank Payout Request
app.post('/api/association/payout-request', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { amount, method, account_details, notes } = req.body;
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Invalid amount.' });

        const [wRows] = await db.query('SELECT balance FROM taxi_association_wallets WHERE association_id = ?', [assocId]);
        const curBal = wRows[0] ? parseFloat(wRows[0].balance) : 0;
        if (curBal < parsedAmount) return res.status(400).json({ error: 'Insufficient association treasury balance.' });

        await db.query(`
            INSERT INTO taxi_association_wallet_transactions (association_id, booking_id, driver_id, amount, type, note)
            VALUES (?, NULL, NULL, ?, 'debit', ?)
        `, [assocId, parsedAmount, `Treasury Payout Request (${method}): ${notes || ''}`]);

        await db.query('UPDATE taxi_association_wallets SET balance = balance - ? WHERE association_id = ?', [parsedAmount, assocId]);

        res.json({ success: true, newBalance: curBal - parsedAmount });
    } catch (err) {
        res.status(500).json({ error: 'Payout request failed: ' + err.message });
    }
});

// 6. District Deep Analytics & Vehicle Breakdown
app.get('/api/association/reports/analytics', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        
        const [fleetDist] = await db.query(`
            SELECT vehicle_type, COUNT(*) as count, SUM(IF(is_online = 1, 1, 0)) as online_count
            FROM taxi_drivers WHERE association_id = ?
            GROUP BY vehicle_type
        `, [assocId]);

        const [leaderboard] = await db.query(`
            SELECT d.id, d.name, d.phone, d.vehicle_type, COUNT(b.id) as completed_rides, COALESCE(SUM(b.fare), 0) as total_revenue
            FROM taxi_drivers d
            LEFT JOIN taxi_bookings b ON d.id = b.driver_id AND b.status IN ('completed', 'finished')
            WHERE d.association_id = ?
            GROUP BY d.id
            ORDER BY completed_rides DESC LIMIT 10
        `, [assocId]);

        res.json({ fleetDist, leaderboard });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate analytics: ' + err.message });
    }
});

// 7. Driver Digital ID Card Data
app.get('/api/association/driver-id-card/:id', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const driverId = req.params.id;
        const [dRows] = await db.query(`
            SELECT d.*, a.city_name, a.name as association_name
            FROM taxi_drivers d
            LEFT JOIN taxi_associations a ON d.association_id = a.id
            WHERE d.id = ? AND d.association_id = ?
        `, [driverId, assocId]);
        if (!dRows.length) return res.status(404).json({ error: 'Driver not found in your association.' });
        res.json(dRows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch ID card data: ' + err.message });
    }
});

// 8. Expiring Documents Tracker
app.get('/api/association/documents/expiring', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query(`
            SELECT id, name, phone, car_model, car_number, vehicle_type, created_at
            FROM taxi_drivers
            WHERE association_id = ?
            ORDER BY created_at ASC LIMIT 10
        `, [assocId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch document status.' });
    }
});

// 9. District SOS Emergency Feed & Control
app.get('/api/association/sos/active', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query(`
            SELECT user_name as name, user_phone as phone, latitude, longitude
            FROM taxi_sos_alerts
            WHERE association_id = ? AND status = 'active'
            ORDER BY created_at DESC LIMIT 10
        `, [assocId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch SOS alerts.' });
    }
});

// 10. District Association Support & Dispute Desk
app.get('/api/association/support/tickets', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query(`
            SELECT st.booking_id, st.issue_text as issue, st.status, b.fare, COALESCE(u.name, tu.name) as customer_name, COALESCE(u.phone, tu.phone) as customer_phone, d.name as driver_name
            FROM taxi_association_support_tickets st
            LEFT JOIN taxi_bookings b ON st.booking_id = b.id
            LEFT JOIN passengers u ON st.customer_id = u.id
            LEFT JOIN taxi_passengers tu ON st.customer_id = tu.id
            LEFT JOIN taxi_drivers d ON st.driver_id = d.id
            WHERE st.association_id = ?
            ORDER BY st.created_at DESC LIMIT 15
        `, [assocId]);
        res.json(rows);
    } catch (err) {
        console.error('Error in support tickets:', err);
        res.status(500).json({ error: 'Failed to fetch support tickets: ' + err.message });
    }
});

// 11. Driver Incentive Targets & Welfare Fund
app.get('/api/association/incentives', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [welfareBal] = await db.query('SELECT balance FROM taxi_association_wallets WHERE association_id = ?', [assocId]);
        const bal = welfareBal[0] ? parseFloat(welfareBal[0].balance) : 0;
        
        const [targets] = await db.query('SELECT id, title, target_rides as target, bonus_amount as bonus, period FROM taxi_association_incentives WHERE association_id = ? AND is_active = 1', [assocId]);
        
        res.json({
            welfareFund: (bal * 0.05).toFixed(2),
            currentBalance: bal.toFixed(2),
            targets: targets.length > 0 ? targets : [
                { id: 1, title: 'Daily Peak Performer', target: 12, bonus: 250, period: 'Daily' },
                { id: 2, title: 'Weekly Super Captain', target: 75, bonus: 1500, period: 'Weekly' }
            ]
        });
    } catch (err) {
        console.error('Error in incentives:', err);
        res.status(500).json({ error: 'Failed to fetch incentives: ' + err.message });
    }
});

// 12. District Surge & Bata Override
app.get('/api/association/surge', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const [rows] = await db.query('SELECT multiplier as surgeMultiplier, night_surcharge_percent as nightSurchargePercent, bata_per_day as driverBataPerDay, is_active as active FROM taxi_association_surge_config WHERE association_id = ?', [assocId]);
        
        if (rows.length > 0) {
            res.json({ assocId, ...rows[0], active: rows[0].active === 1 });
        } else {
            res.json({
                assocId,
                surgeMultiplier: 1.2,
                nightSurchargePercent: 15,
                driverBataPerDay: 400,
                active: false
            });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch surge settings.' });
    }
});

app.post('/api/association/surge/toggle', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const assocId = req.user.id;
        const { multiplier, active, nightSurcharge, bata } = req.body;
        
        await db.query(`
            INSERT INTO taxi_association_surge_config (association_id, multiplier, night_surcharge_percent, bata_per_day, is_active)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE multiplier = VALUES(multiplier), night_surcharge_percent = VALUES(night_surcharge_percent), bata_per_day = VALUES(bata_per_day), is_active = VALUES(is_active)
        `, [assocId, multiplier || 1.2, nightSurcharge || 15, bata || 400, active ? 1 : 0]);
        
        res.json({ success: true, multiplier: multiplier || 1.2, active: !!active, nightSurcharge: nightSurcharge || 15, bata: bata || 400 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update surge.' });
    }
});

// --- PROFIT LEDGER ROUTES ---
app.get('/api/admin/ledger', authenticateJWT, requireRole(['admin']), async (req, res) => {
    try {
        const { associationId, district } = req.query;
        let query = `
            SELECT b.id as booking_id, b.status, b.trip_type, b.vehicle_type, b.fare, 
                   b.distance, b.pickup_loc, b.drop_loc, b.journey_end_time,
                   d.name as driver_name, d.association_id,
                   a.district, a.name as association_name, a.commission_customer_pct, a.commission_customer_fixed,
                   p.name as passenger_name, p.phone as passenger_phone,
                   f.amount as total_fare, f.vendor_profit, f.association_profit, f.platform_fee,
                   f.driver_net_earnings
            FROM taxi_bookings b
            LEFT JOIN taxi_drivers d ON b.driver_id = d.id
            LEFT JOIN taxi_associations a ON d.association_id = a.id
            LEFT JOIN taxi_passengers p ON b.user_id = p.id
            LEFT JOIN taxi_financial_ledger f ON b.id = f.booking_id AND f.type = 'ride_completed'
            WHERE b.status IN ('completed', 'finished')
        `;
        const params = [];
        if (associationId) {
            query += ' AND a.id = ?';
            params.push(associationId);
        }
        if (district) {
            query += ' AND a.district = ?';
            params.push(district);
        }
        query += ' ORDER BY b.journey_end_time DESC LIMIT 500';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Admin ledger error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/association/ledger', authenticateJWT, requireRole(['association_admin']), async (req, res) => {
    try {
        const associationId = req.user.associationId || req.user.id;
        const query = `
            SELECT b.id as booking_id, b.status, b.trip_type, b.vehicle_type, b.fare, 
                   b.distance, b.pickup_loc, b.drop_loc, b.journey_end_time,
                   d.name as driver_name,
                   f.amount as total_fare, f.association_profit
            FROM taxi_bookings b
            JOIN taxi_drivers d ON b.driver_id = d.id
            LEFT JOIN taxi_financial_ledger f ON b.id = f.booking_id AND f.type = 'ride_completed'
            WHERE b.status IN ('completed', 'finished') AND d.association_id = ?
            ORDER BY b.journey_end_time DESC LIMIT 500
        `;
        const [rows] = await db.query(query, [associationId]);
        res.json(rows);
    } catch (err) {
        console.error('Association ledger error:', err);
        res.status(500).json({ error: err.message });
    }
});



// Serve association admin panel
app.get('/association-admin', (req, res) => res.sendFile(require('path').join(__dirname, 'public', 'association-admin.html')));


// --- CENTRALIZED ERROR HANDLING MIDDLEWARE ---
app.use((err, req, res, next) => {
    console.error('❌ Centralized Error Handler:', err);
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(err.status || 500).json({
        error: isProduction ? 'Internal Server Error' : err.message,
        ...(isProduction ? {} : { stack: err.stack })
    });
});

startServer();
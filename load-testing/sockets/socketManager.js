const { io } = require('socket.io-client');
const config = require('../config');

/**
 * Creates and returns a configured Socket.IO client instance.
 * @param {string} token - The authentication token.
 * @param {string} role - 'customer' or 'driver'.
 * @param {Object} monitor - Monitor instance to record metrics.
 * @returns {Socket}
 */
function createSocketConnection(token, role, monitor) {
  const socket = io(config.api.socketUrl, {
    auth: { token },
    query: { role },
    transports: ['websocket', 'polling'], // Prefer websocket
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10
  });

  socket.on('connect', () => {
    monitor.recordSocketEvent('connect');
  });

  socket.on('disconnect', (reason) => {
    monitor.recordSocketEvent('disconnect');
  });

  socket.on('connect_error', (err) => {
    monitor.recordSocketEvent('error');
  });

  // Catch-all for events to measure throughput
  socket.onAny((event, ...args) => {
    monitor.recordSocketEvent('message');
  });

  return socket;
}

module.exports = {
  createSocketConnection
};

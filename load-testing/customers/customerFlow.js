const axios = require('axios');
const { performance } = require('perf_hooks');
const config = require('../config');
const { createSocketConnection } = require('../sockets/socketManager');

class CustomerFlow {
  constructor(id, monitor) {
    this.id = id;
    this.monitor = monitor;
    this.client = axios.create({ baseURL: config.api.baseUrl });
    this.token = null;
    this.socket = null;
    this.currentRideId = null;
    this.isRunning = false;
  }

  async runFlow() {
    this.isRunning = true;
    try {
      await this.registerAndLogin();
      this.connectSocket();

      while (this.isRunning) {
        await this.simulateUserSession();
        // Wait between sessions
        await this.sleep(5000 + Math.random() * 10000);
      }
    } catch (err) {
      // Monitor already tracking failures via measureRequest
    }
  }

  stop() {
    this.isRunning = false;
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  async measureRequest(method, url, data = null) {
    const start = performance.now();
    let success = false;
    try {
      const response = await this.client({
        method,
        url,
        data,
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {}
      });
      success = response.status >= 200 && response.status < 400;
      return response.data;
    } catch (err) {
      success = false;
      throw err;
    } finally {
      const duration = performance.now() - start;
      this.monitor.recordRequest(duration, success);
    }
  }

  async registerAndLogin() {
    const email = `customer_test_${this.id}_${Date.now()}@test.cityride.local`;
    const password = 'password123';
    
    // Attempt Register
    try {
      await this.measureRequest('POST', '/api/customers/register', {
        name: `Test Customer ${this.id}`,
        email,
        password,
        phone: `+1000${this.id.toString().padStart(7, '0')}`
      });
    } catch (e) { /* Ignore if already exists */ }

    // Login
    const loginRes = await this.measureRequest('POST', '/api/customers/login', {
      email,
      password
    });
    this.token = loginRes.token || 'mock-customer-token';
  }

  connectSocket() {
    this.socket = createSocketConnection(this.token, 'customer', this.monitor);
    
    this.socket.on('booking_update', (data) => {
      if (data.status === 'completed' || data.status === 'cancelled') {
        this.currentRideId = null;
      }
    });
  }

  async simulateUserSession() {
    try {
      // Refresh Dashboard & View Nearby Drivers
      await this.measureRequest('GET', '/api/customers/dashboard');
      await this.measureRequest('GET', '/api/drivers/nearby?lat=40.7128&lng=-74.0060');
      
      // Calculate Fare
      await this.measureRequest('POST', '/api/rides/estimate', {
        pickup: { lat: 40.7128, lng: -74.0060 },
        dropoff: { lat: 40.7580, lng: -73.9855 }
      });

      // Create Booking
      const rideRes = await this.measureRequest('POST', '/api/rides/book', {
        pickup: { lat: 40.7128, lng: -74.0060 },
        dropoff: { lat: 40.7580, lng: -73.9855 },
        type: 'standard'
      });
      this.currentRideId = rideRes.rideId || `ride_${Date.now()}`;

      // Simulate tracking driver live for 30 seconds
      let trackingTime = 0;
      while (this.currentRideId && trackingTime < 30) {
        await this.measureRequest('GET', `/api/rides/${this.currentRideId}/status`);
        await this.sleep(3000);
        trackingTime += 3;
      }

      // If ride is still active, maybe cancel randomly (10% chance)
      if (this.currentRideId && Math.random() < 0.1) {
        await this.measureRequest('POST', `/api/rides/${this.currentRideId}/cancel`);
        this.currentRideId = null;
      }

      // View history
      await this.measureRequest('GET', '/api/customers/history');

    } catch (err) {
      // Flow interruption, wait before retry
      await this.sleep(2000);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CustomerFlow;

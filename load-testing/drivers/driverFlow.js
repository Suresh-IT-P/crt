const axios = require('axios');
const { performance } = require('perf_hooks');
const config = require('../config');
const { createSocketConnection } = require('../sockets/socketManager');

class DriverFlow {
  constructor(id, monitor) {
    this.id = id;
    this.monitor = monitor;
    this.client = axios.create({ baseURL: config.api.baseUrl });
    this.token = null;
    this.socket = null;
    this.currentRideId = null;
    this.isRunning = false;
    this.isOnline = false;
  }

  async runFlow() {
    this.isRunning = true;
    try {
      await this.registerAndLogin();
      this.connectSocket();

      while (this.isRunning) {
        await this.simulateDriverSession();
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
    const email = `driver_test_${this.id}_${Date.now()}@test.cityride.local`;
    const password = 'password123';
    
    try {
      await this.measureRequest('POST', '/api/drivers/register', {
        name: `Test Driver ${this.id}`,
        email,
        password,
        vehicle: 'Toyota Prius',
        plate: `TEST${this.id}`
      });
    } catch (e) { /* Ignore if already exists */ }

    const loginRes = await this.measureRequest('POST', '/api/drivers/login', {
      email,
      password
    });
    this.token = loginRes.token || 'mock-driver-token';
  }

  connectSocket() {
    this.socket = createSocketConnection(this.token, 'driver', this.monitor);
    
    this.socket.on('booking_request', async (data) => {
      if (!this.currentRideId && this.isOnline) {
        try {
          await this.measureRequest('POST', `/api/rides/${data.rideId}/accept`);
          this.currentRideId = data.rideId;
        } catch (e) {
          // Failed to accept or already taken
        }
      }
    });
  }

  async simulateDriverSession() {
    try {
      // Go Online
      await this.measureRequest('POST', '/api/drivers/status', { status: 'online' });
      this.isOnline = true;
      
      let sessionTime = 0;
      // Stay online for a while, updating GPS
      while (this.isRunning && sessionTime < 60) {
        await this.measureRequest('POST', '/api/drivers/location', {
          lat: 40.7128 + (Math.random() * 0.01),
          lng: -74.0060 + (Math.random() * 0.01)
        });
        
        if (this.socket) {
          this.socket.emit('location_update', { lat: 40.7128, lng: -74.0060 });
        }

        if (this.currentRideId) {
          await this.handleRide();
        }

        await this.sleep(3000); // GPS Update every 3 seconds
        sessionTime += 3;
      }

      // Go Offline
      await this.measureRequest('POST', '/api/drivers/status', { status: 'offline' });
      this.isOnline = false;
      await this.sleep(10000); // Wait before going online again

    } catch (err) {
      await this.sleep(2000);
    }
  }

  async handleRide() {
    try {
      // Simulate driving to pickup
      await this.sleep(5000);
      await this.measureRequest('POST', `/api/rides/${this.currentRideId}/status`, { status: 'arrived' });
      
      await this.sleep(2000);
      await this.measureRequest('POST', `/api/rides/${this.currentRideId}/status`, { status: 'started' });
      
      // Simulate ride
      await this.sleep(10000);
      await this.measureRequest('POST', `/api/rides/${this.currentRideId}/status`, { status: 'completed' });
      
    } catch (e) {} finally {
      this.currentRideId = null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DriverFlow;

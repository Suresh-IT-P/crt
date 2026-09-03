const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

class Dashboard {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server);
    this.latestMetrics = {};

    this.setupRoutes();
    this.setupSocket();
  }

  setupRoutes() {
    this.app.get('/', (req, res) => {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CityRide Realtime Load Testing Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #121212; color: #ffffff; margin: 0; padding: 20px; }
        h1 { text-align: center; color: #00d2ff; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .card { background: #1e1e1e; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); text-align: center; border-top: 3px solid #00d2ff; }
        .value { font-size: 2em; font-weight: bold; margin-top: 10px; color: #00d2ff; }
        .chart-container { background: #1e1e1e; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <h1>CityRide Realtime Capacity Testing</h1>
    <div class="grid">
        <div class="card">Customers<div class="value" id="val-customers">0</div></div>
        <div class="card">Drivers<div class="value" id="val-drivers">0</div></div>
        <div class="card">Active Rides<div class="value" id="val-rides">0</div></div>
        <div class="card">Socket Conns<div class="value" id="val-sockets">0</div></div>
        <div class="card">Requests / Sec<div class="value" id="val-rps">0</div></div>
        <div class="card">CPU Usage<div class="value" id="val-cpu">0%</div></div>
        <div class="card">Memory Usage<div class="value" id="val-mem">0%</div></div>
        <div class="card">DB Latency<div class="value" id="val-db">0ms</div></div>
    </div>
    
    <div class="grid">
        <div class="chart-container"><canvas id="loadChart"></canvas></div>
        <div class="chart-container"><canvas id="resourceChart"></canvas></div>
    </div>

    <script>
        const socket = io();
        
        const loadCtx = document.getElementById('loadChart').getContext('2d');
        const loadChart = new Chart(loadCtx, {
            type: 'line',
            data: { labels: [], datasets: [
                { label: 'RPS', borderColor: '#ffce56', data: [] },
                { label: 'Sockets', borderColor: '#4bc0c0', data: [] }
            ]},
            options: { responsive: true, animation: false, scales: { x: { display: false } } }
        });

        const resourceCtx = document.getElementById('resourceChart').getContext('2d');
        const resourceChart = new Chart(resourceCtx, {
            type: 'line',
            data: { labels: [], datasets: [
                { label: 'CPU %', borderColor: '#ff6384', data: [] },
                { label: 'Memory %', borderColor: '#36a2eb', data: [] }
            ]},
            options: { responsive: true, animation: false, scales: { x: { display: false }, y: { min: 0, max: 100 } } }
        });

        function updateChart(chart, dataArr) {
            chart.data.labels.push('');
            if (chart.data.labels.length > 20) chart.data.labels.shift();
            
            chart.data.datasets.forEach((dataset, i) => {
                dataset.data.push(dataArr[i]);
                if (dataset.data.length > 20) dataset.data.shift();
            });
            chart.update();
        }

        socket.on('metrics', (m) => {
            document.getElementById('val-customers').innerText = m.onlineCustomers;
            document.getElementById('val-drivers').innerText = m.onlineDrivers;
            document.getElementById('val-rides').innerText = m.activeRides;
            document.getElementById('val-sockets').innerText = m.maxSocketConnections;
            document.getElementById('val-rps').innerText = m.maxRequestsPerSecond.toFixed(1);
            document.getElementById('val-cpu').innerText = m.cpu.toFixed(1) + '%';
            document.getElementById('val-mem').innerText = m.memory.toFixed(1) + '%';
            document.getElementById('val-db').innerText = m.dbLatency.toFixed(1) + 'ms';

            updateChart(loadChart, [m.maxRequestsPerSecond, m.maxSocketConnections]);
            updateChart(resourceChart, [m.cpu, m.memory]);
        });
    </script>
</body>
</html>
      `);
    });
  }

  setupSocket() {
    this.io.on('connection', (socket) => {
      socket.emit('metrics', this.latestMetrics);
    });
  }

  updateMetrics(metrics) {
    this.latestMetrics = metrics;
    this.io.emit('metrics', metrics);
  }

  start(port = 4000) {
    this.server.listen(port, () => {
      console.log(`\n📊 Realtime Metrics Dashboard running at http://localhost:${port}\n`);
    });
  }
}

module.exports = new Dashboard();

const { parentPort } = require('worker_threads');
const dashboard = require('./dashboard');

dashboard.start(4000);

parentPort.on('message', (msg) => {
  if (msg.type === 'metrics') {
    dashboard.updateMetrics(msg.data);
  }
});

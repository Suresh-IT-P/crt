const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('database.sqlite');
db.all("PRAGMA table_info('taxi_bookings')", (err, rows) => {
    console.log(JSON.stringify(rows.map(r => r.name)));
});

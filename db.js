const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./tasks.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      assigned_to TEXT,
      due_date INTEGER,
      subtasks TEXT,
      channel_id TEXT,
      reminders TEXT
    )
  `);
});

module.exports = db;
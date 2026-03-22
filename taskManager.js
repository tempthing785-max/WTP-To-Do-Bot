const db = require("./db");

function createTask(data) {
  return new Promise((resolve) => {
    db.run(
      `INSERT INTO tasks (title, assigned_to, due_date, subtasks, channel_id, reminders)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.assigned_to,
        data.due_date,
        JSON.stringify(data.subtasks),
        data.channel_id,
        JSON.stringify({ "24h": false, "1h": false, overdue: false })
      ],
      function () { resolve(this.lastID); }
    );
  });
}

function getTasks(channel_id) {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM tasks WHERE channel_id = ?`, [channel_id], (err, rows) => resolve(rows));
  });
}

function updateTask(id, updates) {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(", ");
  const values = Object.values(updates);

  return new Promise((resolve) => {
    db.run(`UPDATE tasks SET ${fields} WHERE id = ?`, [...values, id], () => resolve());
  });
}

function deleteTask(id) {
  return new Promise((resolve) => {
    db.run(`DELETE FROM tasks WHERE id = ?`, [id], () => resolve());
  });
}

module.exports = { createTask, getTasks, updateTask, deleteTask };
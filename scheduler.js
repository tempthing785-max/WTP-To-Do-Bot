const db = require("./db");

module.exports = function(client) {
  setInterval(async () => {
    const now = Date.now();

    db.all(`SELECT * FROM tasks`, async (err, tasks) => {
      if (err || !tasks) return;

      // ----------------------------
      // Filter only tasks that need reminders
      // ----------------------------
      const dueSoonTasks = tasks.filter(task => {
        const due = task.due_date;
        if (!due || isNaN(due)) return false;

        let reminders;
        try {
          reminders = JSON.parse(task.reminders || "{}");
        } catch {
          reminders = {};
        }

        const needs1h = !reminders["1h"] && (due - now < 3600000 && due > now);
        const needsOverdue = !reminders.overdue && now > due;
        return needs1h || needsOverdue;
      });

      // ----------------------------
      // Process only filtered tasks
      // ----------------------------
      for (const task of dueSoonTasks) {
        let reminders;
        try {
          reminders = JSON.parse(task.reminders || "{}");
        } catch (err) {
          console.error(`Failed to parse reminders for task ${task.id}`, err);
          reminders = {};
        }

        try {
          // --------------------------
          // 1-hour reminder
          // --------------------------
          if (!reminders["1h"] && task.due_date - now < 3600000 && task.due_date > now) {
            if (task.assigned_to) {
              const user = await client.users.fetch(task.assigned_to).catch(() => null);
              if (user) {
                await user.send(`⏰ Task **${task.title}** is due in 1 hour!`).catch(() => {});
              }
            }
            reminders["1h"] = true;
          }

          // --------------------------
          // Overdue reminder
          // --------------------------
          if (!reminders.overdue && now > task.due_date) {
            if (task.assigned_to) {
              const user = await client.users.fetch(task.assigned_to).catch(() => null);
              if (user) {
                await user.send(`⚠️ Task **${task.title}** is OVERDUE!`).catch(() => {});
              }
            }
            reminders.overdue = true;
          }

          // --------------------------
          // Save updated reminder flags
          // --------------------------
          db.run(`UPDATE tasks SET reminders = ? WHERE id = ?`, [JSON.stringify(reminders), task.id]);

        } catch (err) {
          console.error(`Scheduler error for task ${task.id}:`, err);
        }
      }
    });
  }, 60000); // every minute
};

const db = require("./db");

module.exports = function(client) {
  setInterval(async () => {
    const now = Date.now();

    db.all(`SELECT * FROM tasks`, async (err, tasks) => {
      if (err || !tasks) return;

      for (const task of tasks) {
        const due = task.due_date;
        if (!due || isNaN(due)) continue;

        let reminders;
        try {
          reminders = JSON.parse(task.reminders || "{}");
        } catch (err) {
          console.error(`Failed to parse reminders for task ${task.id}`, err);
          reminders = {};
        }

        // 1-hour reminder (DM ONLY)
        if (!reminders["1h"] && due - now < 3600000 && due > now) {
          const user = await client.users.fetch(task.assigned_to).catch(() => null);

          const msg = `⏰ Task **${task.title}** is due in 1 hour!`;

          if (user) user.send(msg).catch(() => {});
          reminders["1h"] = true;
        }

        // Overdue reminder (DM ONLY)
        if (!reminders.overdue && now > due) {
          const user = await client.users.fetch(task.assigned_to).catch(() => null);

          const msg = `⚠️ Task **${task.title}** is OVERDUE!`;

          if (user) user.send(msg).catch(() => {});
          reminders.overdue = true;
        }

        // Save updated reminder flags
        db.run(
          `UPDATE tasks SET reminders = ? WHERE id = ?`,
          [JSON.stringify(reminders), task.id]
        );
      }
    });
  }, 60000);
};

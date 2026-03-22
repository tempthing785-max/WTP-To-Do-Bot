const db = require("./db");

module.exports = function(client) {
  setInterval(async () => {
    const now = Date.now();

    db.all(`SELECT * FROM tasks`, async (err, tasks) => {
      if (err || !tasks) return;

      // Only process tasks that are overdue and not yet marked
      const overdueTasks = tasks.filter(task => {
        const due = task.due_date;
        if (!due || isNaN(due)) return false;

        let reminders;
        try {
          reminders = JSON.parse(task.reminders || "{}");
        } catch {
          reminders = {};
        }

        return !reminders.overdue && now > due;
      });

      for (const task of overdueTasks) {
        let reminders;
        try {
          reminders = JSON.parse(task.reminders || "{}");
        } catch {
          reminders = {};
        }

        try {
          if (task.assigned_to) {
            const user = await client.users.fetch(task.assigned_to).catch(() => null);
            if (user) {
              await user.send(`⚠️ Task **${task.title}** is OVERDUE!`).catch(() => {});
            }
          }
          // Mark as reminded
          reminders.overdue = true;

          db.run(
            `UPDATE tasks SET reminders = ? WHERE id = ?`,
            [JSON.stringify(reminders), task.id]
          );

        } catch (err) {
          console.error(`Scheduler error for task ${task.id}:`, err);
        }
      }
    });
  }, 60000); // every minute
};

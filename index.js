require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  REST,
  Routes,
  InteractionType
} = require("discord.js");

const fs = require("fs");
const token = process.env.TOKEN;
if (!token) {
  console.error("❌ TOKEN is missing in .env file");
  process.exit(1);
}

const { createTask, getTasks, updateTask, deleteTask } = require("./taskManager");
const startScheduler = require("./scheduler");
const { command: setupCommand, handle: setupHandler } = require("./setup");
const { renderPanel } = require("./panel");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// =====================
// CONFIG LOADER
// =====================
function loadConfig() {
  if (!fs.existsSync("./config.json")) return { panels: [] };
  const data = JSON.parse(fs.readFileSync("./config.json"));
  if (!data.panels) data.panels = [];
  return data;
}

function getPanel(channelId) {
  const config = loadConfig();
  return config.panels.find(p => p.channelId === channelId);
}

function hasStaffPermission(interaction) {
  const panel = getPanel(interaction.channelId);
  return panel && interaction.member.roles.cache.some(role => panel.staffRoles.includes(role.id));
}

// =====================
// INTERACTIONS
// =====================
client.on("interactionCreate", async (interaction) => {
  try {
    console.debug(`[DEBUG] Interaction received: type=${interaction.type}, customId=${interaction.customId || interaction.commandName}`);

    // -----------------
    // Slash commands
    // -----------------
    if (interaction.isChatInputCommand() && interaction.commandName === "setup") {
      return setupHandler(interaction);
    }

    const panel = getPanel(interaction.channelId);
    if (!panel) return; // only operate in configured panels

    // -----------------
    // Buttons
    // -----------------
    if (interaction.isButton()) {
      const restricted = ["create", "edit", "delete"];
      if (restricted.includes(interaction.customId) && !hasStaffPermission(interaction)) {
        return interaction.reply({ content: "❌ You don’t have permission.", ephemeral: true });
      }

      const [btnAction, taskId] = interaction.customId.split("_");

      switch (btnAction) {
        case "create": {
          const modal = new ModalBuilder().setCustomId("create_task").setTitle("Create Task");
          const fields = [
            ["title", "Task Title"],
            ["assign", "Assign User ID"],
            ["due", "Due (day/month/year hh:mm)"],
            ["details", "Subtasks (one per line)", TextInputStyle.Paragraph]
          ];
          modal.addComponents(fields.map(([id,label,style]) =>
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style||TextInputStyle.Short)
            )
          ));
          return interaction.showModal(modal);
        }

        case "view":
        case "edit":
        case "delete": {
          const tasks = await getTasks(interaction.channel.id);
          if (!tasks.length) return interaction.reply({ content: `No tasks to ${btnAction}.`, ephemeral: true });

          const menu = new StringSelectMenuBuilder()
            .setCustomId(`${btnAction}_select`)
            .setPlaceholder(`Select task to ${btnAction}`)
            .addOptions(tasks.map(t => ({ label: t.title, value: String(t.id) })));

          return interaction.reply({ content: `Select a task to ${btnAction}:`, components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        case "refresh":
          await renderPanel(interaction.channel, interaction.client);
          return interaction.reply({ content: "✅ Panel refreshed!", ephemeral: true });

        case "complete":
        case "reset": {
          const task = (await getTasks(interaction.channel.id)).find(t => t.id == taskId);
          if (!task) return interaction.reply({ content: "Task not found.", ephemeral: true });

          const subs = JSON.parse(task.subtasks);
          subs.forEach(s => s.done = (btnAction === "complete"));
          await updateTask(task.id, { subtasks: JSON.stringify(subs) });

          await renderPanel(interaction.channel, interaction.client);
          return interaction.reply({ content: `Task ${btnAction === "complete" ? "completed" : "reset"}!`, ephemeral: true });
        }
      }
    }

    // -----------------
    // Modals
    // -----------------
    if (interaction.type === InteractionType.ModalSubmit) {
      if (interaction.customId === "create_task") {
        const subtasks = interaction.fields.getTextInputValue("details")
          .split("\n").filter(x => x.trim()).map(x => ({ name: x, done: false }));

        await createTask({
          title: interaction.fields.getTextInputValue("title"),
          assigned_to: interaction.fields.getTextInputValue("assign"),
          due_date: Date.parse(interaction.fields.getTextInputValue("due")),
          subtasks,
          channel_id: interaction.channel.id
        });

        await renderPanel(interaction.channel, interaction.client);
        return interaction.reply({ content: "Task created!", ephemeral: true });
      }

      if (interaction.customId.startsWith("edit_modal_")) {
        const taskId = interaction.customId.split("_")[2];
        const subtasks = interaction.fields.getTextInputValue("details")
          .split("\n").filter(x => x.trim()).map(x => ({ name: x, done: false }));

        await updateTask(taskId, {
          title: interaction.fields.getTextInputValue("title"),
          assigned_to: interaction.fields.getTextInputValue("assign"),
          due_date: Date.parse(interaction.fields.getTextInputValue("due")),
          subtasks: JSON.stringify(subtasks)
        });

        await renderPanel(interaction.channel, interaction.client);
        return interaction.reply({ content: "Task updated!", ephemeral: true });
      }
    }

    // -----------------
    // Select menus
    // -----------------
    if (interaction.isStringSelectMenu()) {
      const [action] = interaction.customId.split("_");
      const taskId = interaction.values[0];

      const task = (await getTasks(interaction.channel.id)).find(t => t.id == taskId);
      if (!task) return interaction.reply({ content: "Task not found.", ephemeral: true });

      if (action === "view") {
        const subs = JSON.parse(task.subtasks);

        const embed = new EmbedBuilder()
          .setTitle(task.title)
          .setDescription(subs.map(s => `${s.done ? "✅" : "⬜"} ${s.name}`).join("\n"));

        const toggleMenu = new StringSelectMenuBuilder()
          .setCustomId(`toggle_${task.id}`)
          .setPlaceholder("Toggle subtask")
          .addOptions(subs.map((s, i) => ({ label: s.name, value: String(i) })));

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`complete_${task.id}`).setLabel("✅ All").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`reset_${task.id}`).setLabel("🔄 Reset").setStyle(ButtonStyle.Secondary)
        );

        return interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(toggleMenu), buttons] });
      }

      if (action === "edit") {
        const modal = new ModalBuilder().setCustomId(`edit_modal_${task.id}`).setTitle("Edit Task");
        const fields = [
          ["title", "Task Title", task.title],
          ["assign", "Assign User ID", task.assigned_to],
          ["due", "Due (day/month/year hh:mm)", new Date(task.due_date).toISOString().slice(0,16)],
          ["details", "Subtasks (one per line)", JSON.parse(task.subtasks).map(s => s.name).join("\n")]
        ];
        modal.addComponents(fields.map(([id, label, value]) => new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(id).setLabel(label)
            .setStyle(id === "details" ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setValue(value)
        )));
        return interaction.showModal(modal);
      }

      if (action === "delete") {
        await deleteTask(task.id);
        await renderPanel(interaction.channel, interaction.client);
        return interaction.reply({ content: "Task deleted!", ephemeral: true });
      }

      if (action === "toggle") {
        const index = parseInt(interaction.values[0], 10);
        const subs = JSON.parse(task.subtasks);
        subs[index].done = !subs[index].done;
        await updateTask(task.id, { subtasks: JSON.stringify(subs) });

        await renderPanel(interaction.channel, interaction.client);
        return interaction.reply({ content: "Subtask updated!", ephemeral: true });
      }
    }

  } catch (err) {
    console.error("Interaction error:", err);
    if (!interaction.replied) interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
  }
});

// =====================
// STARTUP
// =====================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [setupCommand.toJSON()] });
    console.log("Slash commands registered globally.");
  } catch (err) {
    console.error(err);
  }
  startScheduler(client);
});

client.login(token);

module.exports = { renderPanel, createTask, getTasks, updateTask, deleteTask };
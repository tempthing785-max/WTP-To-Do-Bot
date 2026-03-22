const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getTasks } = require("./taskManager");
const fs = require("fs");

async function renderPanel(channel, client) {
  // Load panel config for this channel
  let config = { panels: [] };
  if (fs.existsSync("./config.json")) {
    config = JSON.parse(fs.readFileSync("./config.json"));
  }
  const panelConfig = config.panels.find(p => p.channelId === channel.id);

  if (!panelConfig) return;

  const tasks = await getTasks(channel.id);
  let pending = "", completed = "";

  for (let t of tasks) {
    const subs = JSON.parse(t.subtasks);
    const done = subs.filter(s => s.done).length;
    const total = subs.length;
    const emoji = done === 0 ? "🔴" : done === total ? "🟢" : "🟡";
    const line = `${emoji} ${t.title} (${done}/${total}) <@${t.assigned_to}>\n`;
    if (done === total) completed += line; else pending += line;
  }

  const embed = new EmbedBuilder()
    .setTitle(panelConfig.header || "📝 Staff To-Do List")
    .setDescription(`🔴 Pending\n${pending || "None"}\n\n🟢 Completed\n${completed || "None"}`)
    .setColor(panelConfig.color || "#0099ff")
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("create").setLabel("➕ Create").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("view").setLabel("📖 View").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("edit").setLabel("✏️ Edit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("delete").setLabel("❌ Delete").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("refresh").setLabel("🔄").setStyle(ButtonStyle.Secondary)
  );

  // Fetch last 10 messages in the channel and update existing panel
  const messages = await channel.messages.fetch({ limit: 10 });
  const existing = messages.find(m => m.author.id === client.user.id);

  if (existing) await existing.edit({ embeds: [embed], components: [row] });
  else await channel.send({ embeds: [embed], components: [row] });
}

module.exports = { renderPanel };
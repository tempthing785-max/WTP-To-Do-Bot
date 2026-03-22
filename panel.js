const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { getTasks } = require("./taskManager");
const fs = require("fs");

// ---------------------
// Helper: load config
// ---------------------
function loadConfig() {
  if (!fs.existsSync("./config.json")) return { panels: [] };
  const data = JSON.parse(fs.readFileSync("./config.json"));
  if (!data.panels) data.panels = [];
  return data;
}

// ---------------------
// Render the panel
// ---------------------
async function renderPanel(channel, client) {
  const config = loadConfig();
  const panelConfig = config.panels.find(p => p.channelId === channel.id);
  if (!panelConfig) return; // no panel configured for this channel

  const tasks = await getTasks(channel.id);
  let pending = "", completed = "";

  for (const t of tasks) {
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

  if (panelConfig.imageUrl) embed.setImage(panelConfig.imageUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("create").setLabel("➕ Create").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("view").setLabel("📖 View").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("edit").setLabel("✏️ Edit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("delete").setLabel("❌ Delete").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("refresh").setLabel("🔄").setStyle(ButtonStyle.Secondary)
  );

  // ---------------------
  // Fetch the panel message by saved ID
  // ---------------------
  let existing = null;
  if (panelConfig.messageId) {
    try {
      existing = await channel.messages.fetch(panelConfig.messageId);
    } catch { existing = null; }
  }

  if (existing) {
    // edit existing panel
    await existing.edit({ embeds: [embed], components: [row] });
  } else {
    // send new panel and save its message ID
    const msg = await channel.send({ embeds: [embed], components: [row] });
    panelConfig.messageId = msg.id;

    // update config.json with messageId
    const fullConfig = loadConfig();
    const index = fullConfig.panels.findIndex(p => p.channelId === channel.id);
    if (index >= 0) fullConfig.panels[index] = panelConfig;
    fs.writeFileSync("./config.json", JSON.stringify(fullConfig, null, 2));
  }
}

module.exports = { renderPanel };

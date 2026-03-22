const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const { renderPanel } = require("./panel");

// ---------------------
// Predefined safe colors
// ---------------------
const COLORS = {
  Blue: "#0099ff",
  Green: "#00ff00",
  Red: "#ff0000",
  Yellow: "#ffff00",
  Purple: "#800080",
  Orange: "#ffa500"
};

// ---------------------
// Command Definitions
// ---------------------
const setupCommand = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Setup or update a to-do panel")
  .addRoleOption(option =>
    option.setName("staffrole")
      .setDescription("Staff role")
      .setRequired(true))
  .addChannelOption(option =>
    option.setName("channel")
      .setDescription("Channel for panel")
      .setRequired(true))
  .addStringOption(option =>
    option.setName("header")
      .setDescription("Panel header text")
      .setRequired(false))
  .addStringOption(option =>
    option.setName("color")
      .setDescription("Panel color")
      .setRequired(true)
      .addChoices(
        ...Object.entries(COLORS).map(([name, hex]) => ({ name, value: hex }))
      )
  );

const removePanelCommand = new SlashCommandBuilder()
  .setName("removepanel")
  .setDescription("Remove a to-do panel")
  .addChannelOption(option => option.setName("channel").setDescription("Channel to remove").setRequired(true));

const listPanelsCommand = new SlashCommandBuilder()
  .setName("listpanels")
  .setDescription("List all configured to-do panels");

// ---------------------
// Handler
// ---------------------
async function handle(interaction) {
  let config = { panels: [] };
  if (fs.existsSync("./config.json")) {
    config = JSON.parse(fs.readFileSync("./config.json"));
  }
  if (!config.panels) config.panels = [];

  if (interaction.commandName === "setup") {
    const role = interaction.options.getRole("staffrole");
    const channel = interaction.options.getChannel("channel");
    const header = interaction.options.getString("header") || "📝 Staff To-Do List";
    const color = interaction.options.getString("color");

    const existingIndex = config.panels.findIndex(p => p.channelId === channel.id);
    const panelData = {
      channelId: channel.id,
      staffRoles: [role.id],
      header,
      color
    };

    if (existingIndex >= 0) config.panels[existingIndex] = panelData;
    else config.panels.push(panelData);

    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));

    // Render panel
    const targetChannel = await interaction.guild.channels.fetch(channel.id);
    await renderPanel(targetChannel, interaction.client);

    return interaction.reply(`✅ Panel setup complete!\nChannel: ${channel.name}\nHeader: ${header}\nColor: ${color}`);
  }

  else if (interaction.commandName === "removepanel") {
    const channel = interaction.options.getChannel("channel");
    const index = config.panels.findIndex(p => p.channelId === channel.id);
    if (index < 0) return interaction.reply({ content: "❌ Panel not found for this channel.", ephemeral: true });

    config.panels.splice(index, 1);
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));

    return interaction.reply({ content: `✅ Panel removed from channel: ${channel.name}`, ephemeral: true });
  }

  else if (interaction.commandName === "listpanels") {
    if (!config.panels.length) return interaction.reply({ content: "No panels configured yet.", ephemeral: true });

    const lines = config.panels.map(p => {
      return `• Channel: <#${p.channelId}>\n  Header: ${p.header}\n  Color: ${p.color}\n  Staff Roles: ${p.staffRoles.map(r => `<@&${r}>`).join(", ")}`;
    }).join("\n\n");

    return interaction.reply({ content: `📋 Configured Panels:\n\n${lines}`, ephemeral: true });
  }
}

module.exports = {
  command: setupCommand,
  handle,
  removePanelCommand,
  listPanelsCommand
};

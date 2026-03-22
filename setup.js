const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
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
  .addRoleOption(option => option.setName("staffrole").setDescription("Staff role").setRequired(true))
  .addChannelOption(option => option.setName("channel").setDescription("Channel for panel").setRequired(true))
  .addStringOption(option => option.setName("header").setDescription("Panel header text").setRequired(false));

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

    // Create color selection menu
    const colorMenu = new StringSelectMenuBuilder()
      .setCustomId(`setup_color_${channel.id}_${role.id}_${header.replace(/ /g,"_")}`)
      .setPlaceholder("Select a panel color")
      .addOptions(Object.entries(COLORS).map(([name, hex]) => ({
        label: name,
        value: hex
      })));

    return interaction.reply({
      content: "Select a color for the panel:",
      components: [new ActionRowBuilder().addComponents(colorMenu)],
      ephemeral: true
    });
  }

  // Remove panel
  else if (interaction.commandName === "removepanel") {
    const channel = interaction.options.getChannel("channel");
    const index = config.panels.findIndex(p => p.channelId === channel.id);
    if (index < 0) return interaction.reply({ content: "❌ Panel not found for this channel.", ephemeral: true });

    config.panels.splice(index, 1);
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));

    return interaction.reply({ content: `✅ Panel removed from channel: ${channel.name}`, ephemeral: true });
  }

  // List panels
  else if (interaction.commandName === "listpanels") {
    if (!config.panels.length) return interaction.reply({ content: "No panels configured yet.", ephemeral: true });

    const lines = config.panels.map(p => {
      return `• Channel: <#${p.channelId}>\n  Header: ${p.header}\n  Color: ${p.color}\n  Staff Roles: ${p.staffRoles.map(r => `<@&${r}>`).join(", ")}`;
    }).join("\n\n");

    return interaction.reply({ content: `📋 Configured Panels:\n\n${lines}`, ephemeral: true });
  }
}

// ---------------------
// Color selection interaction handler
// ---------------------
async function handleColorSelect(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith("setup_color_")) return;

  const parts = interaction.customId.split("_"); // setup_color_channelId_roleId_header
  const channelId = parts[2];
  const roleId = parts[3];
  const header = parts.slice(4).join("_").replace(/_/g," ");

  const selectedColor = interaction.values[0];

  // Load config
  let config = { panels: [] };
  if (fs.existsSync("./config.json")) {
    config = JSON.parse(fs.readFileSync("./config.json"));
  }
  if (!config.panels) config.panels = [];

  const existingIndex = config.panels.findIndex(p => p.channelId === channelId);
  const panelData = {
    channelId,
    staffRoles: [roleId],
    header,
    color: selectedColor
  };

  if (existingIndex >= 0) config.panels[existingIndex] = panelData;
  else config.panels.push(panelData);

  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));

  // Fetch channel and render
  const guild = interaction.guild;
  const targetChannel = await guild.channels.fetch(channelId);
  await renderPanel(targetChannel, interaction.client);

  return interaction.update({
    content: `✅ Panel setup complete!\nChannel: <#${channelId}>\nHeader: ${header}\nColor: ${selectedColor}`,
    components: [],
    ephemeral: true
  });
}

module.exports = {
  command: setupCommand,
  handle,
  handleColorSelect,
  removePanelCommand,
  listPanelsCommand
};

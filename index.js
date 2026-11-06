
import 'dotenv/config';

import {
    Client,
    GatewayIntentBits,
    Partials,
    SlashCommandBuilder,
    REST,
    Routes,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';

/*
|--------------------------------------------------------------------------
| SPECTRE DISCORD BOT
|--------------------------------------------------------------------------
| Single-file reaction role bot
| Node.js 20+
| Discord.js v14
|--------------------------------------------------------------------------
*/

const {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
    process.exit(1);
}

const MAX_OPTIONS = 25;
const SESSION_TIMEOUT = 30 * 60 * 1000;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [
        Partials.GuildMember,
    ],
});

/*
|--------------------------------------------------------------------------
| SETUP STORAGE
|--------------------------------------------------------------------------
*/

const sessions = new Map();

const buttonStyles = {
    blue: ButtonStyle.Primary,
    primary: ButtonStyle.Primary,

    grey: ButtonStyle.Secondary,
    gray: ButtonStyle.Secondary,
    secondary: ButtonStyle.Secondary,

    green: ButtonStyle.Success,
    success: ButtonStyle.Success,

    red: ButtonStyle.Danger,
    danger: ButtonStyle.Danger,

    1: ButtonStyle.Primary,
    2: ButtonStyle.Secondary,
    3: ButtonStyle.Success,
    4: ButtonStyle.Danger,
};

const styleNames = {
    [ButtonStyle.Primary]: 'Blue',
    [ButtonStyle.Secondary]: 'Grey',
    [ButtonStyle.Success]: 'Green',
    [ButtonStyle.Danger]: 'Red',
};

/*
|--------------------------------------------------------------------------
| SLASH COMMAND
|--------------------------------------------------------------------------
*/

const reactionRoleCommand = new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create and manage reaction role panels.')
    .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageRoles
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('setup')
            .setDescription('Open the reaction role setup panel.')
    );

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getSession(userId) {
    const session = sessions.get(userId);

    if (!session) return null;

    if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
        sessions.delete(userId);
        return null;
    }

    return session;
}

function validColour(value) {
    return /^#?[0-9a-fA-F]{6}$/.test(value);
}

function convertColour(value) {
    return parseInt(value.replace('#', ''), 16);
}

function makeInput(id, label, options = {}) {
    return new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(
                options.paragraph
                    ? TextInputStyle.Paragraph
                    : TextInputStyle.Short
            )
            .setRequired(options.required ?? true)
            .setMaxLength(options.maxLength ?? 1000)
            .setPlaceholder(options.placeholder ?? '')
    );
}

/*
|--------------------------------------------------------------------------
| SETUP DASHBOARD
|--------------------------------------------------------------------------
*/

function buildSetupContent(session) {
    const options = session.options.length
        ? session.options.map((option, index) =>
            `**${index + 1}. ${option.name}** → <@&${option.roleId}> (${option.styleName})`
        ).join('\n')
        : '*No options added yet.*';

    return [
        '# Spectre Reaction Role Builder',
        '',
        '**Customize your reaction role panel below.**',
        '',
        `**Heading:** ${session.heading}`,
        `**Body:** ${session.body || 'Not set'}`,
        `**Side colour:** ${session.colour}`,
        `**Image:** ${session.image || 'None'}`,
        `**Footer:** ${session.footer || 'None'}`,
        `**Channel:** <#${session.channelId}>`,
        '',
        `## Options (${session.options.length}/${MAX_OPTIONS})`,
        options,
        '',
        'Use the buttons below to customize your panel.',
    ].join('\n');
}

function buildSetupComponents(session) {
    const editRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rrsetup:heading')
            .setLabel('Heading')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('rrsetup:body')
            .setLabel('Body')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('rrsetup:colour')
            .setLabel('Side Colour')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('rrsetup:image')
            .setLabel('Image')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('rrsetup:footer')
            .setLabel('Footer')
            .setStyle(ButtonStyle.Secondary),
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rrsetup:add')
            .setLabel('Add Option')
            .setStyle(ButtonStyle.Success)
            .setDisabled(session.options.length >= MAX_OPTIONS),

        new ButtonBuilder()
            .setCustomId('rrsetup:publish')
            .setLabel('Publish Panel')
            .setStyle(ButtonStyle.Success)
            .setDisabled(session.options.length === 0),

        new ButtonBuilder()
            .setCustomId('rrsetup:cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger),
    );

    return [editRow, actionRow];
}

/*
|--------------------------------------------------------------------------
| BUILD FINAL PANEL
|--------------------------------------------------------------------------
*/

function buildPanelEmbed(session) {
    const description = [
        session.body,
        '',
        ...session.options.map((option, index) =>
            `**${index + 1}. ${option.name}**`
        ),
    ].join('\n');

    if (description.length > 4096) {
        throw new Error(
            'Panel description is too long. Shorten your body or options.'
        );
    }

    const embed = new EmbedBuilder()
        .setColor(convertColour(session.colour))
        .setTitle(session.heading)
        .setDescription(description);

    if (session.image) {
        embed.setImage(session.image);
    }

    if (session.footer) {
        embed.setFooter({
            text: session.footer,
        });
    }

    return embed;
}

/*
|--------------------------------------------------------------------------
| BUILD ROLE BUTTONS
|--------------------------------------------------------------------------
*/

function buildRoleButtons(options) {
    const rows = [];

    for (let i = 0; i < options.length; i += 5) {
        const row = new ActionRowBuilder();

        for (const option of options.slice(i, i + 5)) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`rrrole:${option.roleId}`)
                    .setLabel(option.name)
                    .setStyle(option.style)
            );
        }

        rows.push(row);
    }

    return rows;
}

/*
|--------------------------------------------------------------------------
| COMMAND EXECUTION
|--------------------------------------------------------------------------
*/

async function executeReactionRole(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({
            content: 'This command can only be used in a server.',
            ephemeral: true,
        });
    }

    if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageRoles
    )) {
        return interaction.reply({
            content: 'You need Manage Roles permission.',
            ephemeral: true,
        });
    }

    const botMember = await interaction.guild.members.fetchMe();

    if (!botMember.permissions.has(
        PermissionFlagsBits.ManageRoles
    )) {
        return interaction.reply({
            content: 'I need Manage Roles permission.',
            ephemeral: true,
        });
    }

    const channel = interaction.channel;

    if (
        !channel?.isTextBased() ||
        !channel.permissionsFor(botMember)?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
        ])
    ) {
        return interaction.reply({
            content: 'I need permission to view and send messages in this channel, and embed links.',
            ephemeral: true,
        });
    }

    const session = {
        ownerId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        createdAt: Date.now(),

        heading: 'Reaction Roles',
        body: 'Choose the roles you would like to receive.',
        colour: '#F8D568',
        image: '',
        footer: "Don't spam the buttons",

        options: [],
    };

    sessions.set(interaction.user.id, session);

    return interaction.reply({
        content: buildSetupContent(session),
        components: buildSetupComponents(session),
        ephemeral: true,
        allowedMentions: {
            parse: [],
        },
    });
}

/*
|--------------------------------------------------------------------------
| OPEN SETUP MODALS
|--------------------------------------------------------------------------
*/

async function openModal(interaction, type) {
    const modal = new ModalBuilder();

    if (type === 'heading') {
        modal
            .setCustomId('rrmodal:heading')
            .setTitle('Edit Heading')
            .addComponents(
                makeInput('value', 'Panel heading', {
                    maxLength: 256,
                    placeholder: 'Sun & Citrus',
                })
            );
    }

    if (type === 'body') {
        modal
            .setCustomId('rrmodal:body')
            .setTitle('Edit Body')
            .addComponents(
                makeInput('value', 'Panel body', {
                    paragraph: true,
                    maxLength: 3000,
                    required: false,
                    placeholder: 'Choose your preferred roles...',
                })
            );
    }

    if (type === 'colour') {
        modal
            .setCustomId('rrmodal:colour')
            .setTitle('Edit Side Colour')
            .addComponents(
                makeInput('value', 'Hex colour', {
                    maxLength: 7,
                    placeholder: '#F8D568',
                })
            );
    }

    if (type === 'image') {
        modal
            .setCustomId('rrmodal:image')
            .setTitle('Edit Image')
            .addComponents(
                makeInput('value', 'Image URL', {
                    maxLength: 500,
                    required: false,
                    placeholder: 'https://example.com/image.png',
                })
            );
    }

    if (type === 'footer') {
        modal
            .setCustomId('rrmodal:footer')
            .setTitle('Edit Footer')
            .addComponents(
                makeInput('value', 'Footer text', {
                    maxLength: 2048,
                    required: false,
                    placeholder: "Don't spam the buttons",
                })
            );
    }

    if (type === 'add') {
        modal
            .setCustomId('rrmodal:add')
            .setTitle('Add Role Option')
            .addComponents(
                makeInput('name', 'Button name', {
                    maxLength: 80,
                    placeholder: 'Light Yellow',
                }),

                makeInput('roleId', 'Role ID', {
                    maxLength: 20,
                    placeholder: 'Discord role ID',
                }),

                makeInput('style', 'Button colour (1-4)', {
                    maxLength: 10,
                    placeholder: '1=Blue, 2=Grey, 3=Green, 4=Red',
                })
            );
    }

    return interaction.showModal(modal);
}

/*
|--------------------------------------------------------------------------
| HANDLE MODAL SUBMISSIONS
|--------------------------------------------------------------------------
*/

async function handleModal(interaction) {
    const session = getSession(interaction.user.id);

    if (!session || session.guildId !== interaction.guildId) {
        return interaction.reply({
            content: 'Your setup session expired. Run /reactionrole setup again.',
            ephemeral: true,
        });
    }

    const type = interaction.customId.split(':')[1];

    if (type === 'heading') {
        const value = interaction.fields
            .getTextInputValue('value')
            .trim();

        if (!value) {
            return interaction.reply({
                content: 'Heading cannot be empty.',
                ephemeral: true,
            });
        }

        session.heading = value;
    }

    if (type === 'body') {
        session.body = interaction.fields
            .getTextInputValue('value')
            .trim();
    }

    if (type === 'colour') {
        const value = interaction.fields
            .getTextInputValue('value')
            .trim();

        if (!validColour(value)) {
            return interaction.reply({
                content: 'Invalid colour. Use a hex colour such as #F8D568.',
                ephemeral: true,
            });
        }

        session.colour = value.startsWith('#')
            ? value
            : `#${value}`;
    }

    if (type === 'image') {
        const value = interaction.fields
            .getTextInputValue('value')
            .trim();

        if (value) {
            try {
                const url = new URL(value);

                if (!['https:', 'http:'].includes(url.protocol)) {
                    throw new Error('Invalid protocol');
                }
            } catch {
                return interaction.reply({
                    content: 'Please enter a valid HTTP or HTTPS image URL.',
                    ephemeral: true,
                });
            }
        }

        session.image = value;
    }

    if (type === 'footer') {
        session.footer = interaction.fields
            .getTextInputValue('value')
            .trim();
    }

    if (type === 'add') {
        if (session.options.length >= MAX_OPTIONS) {
            return interaction.reply({
                content: `Maximum ${MAX_OPTIONS} options per panel.`,
                ephemeral: true,
            });
        }

        const name = interaction.fields
            .getTextInputValue('name')
            .trim();

        const roleId = interaction.fields
            .getTextInputValue('roleId')
            .trim();

        const styleInput = interaction.fields
            .getTextInputValue('style')
            .trim()
            .toLowerCase();

        const style = buttonStyles[styleInput];

        if (!name || name.length > 80) {
            return interaction.reply({
                content: 'Button name must be between 1 and 80 characters.',
                ephemeral: true,
            });
        }

        if (!/^\d{17,20}$/.test(roleId)) {
            return interaction.reply({
                content: 'Invalid Discord role ID.',
                ephemeral: true,
            });
        }

        if (!style) {
            return interaction.reply({
                content: 'Choose 1, 2, 3 or 4 for the button colour.',
                ephemeral: true,
            });
        }

        if (session.options.some(option => option.roleId === roleId)) {
            return interaction.reply({
                content: 'That role is already in this panel.',
                ephemeral: true,
            });
        }

        const role = await interaction.guild.roles
            .fetch(roleId)
            .catch(() => null);

        if (!role) {
            return interaction.reply({
                content: 'I could not find that role.',
                ephemeral: true,
            });
        }

        if (role.managed || role.id === interaction.guild.id) {
            return interaction.reply({
                content: 'That role cannot be assigned.',
                ephemeral: true,
            });
        }

        session.options.push({
            name,
            roleId,
            style,
            styleName: styleNames[style],
        });
    }

    return interaction.reply({
        content: `Successfully updated! You have ${session.options.length} option(s).`,
        ephemeral: true,
        allowedMentions: {
            parse: [],
        },
    });
}

/*
|--------------------------------------------------------------------------
| PUBLISH PANEL
|--------------------------------------------------------------------------
*/

async function publishPanel(interaction) {
    const session = getSession(interaction.user.id);

    if (!session || session.guildId !== interaction.guildId) {
        return interaction.reply({
            content: 'Your setup session expired.',
            ephemeral: true,
        });
    }

    if (!session.options.length) {
        return interaction.reply({
            content: 'Add at least one role option first.',
            ephemeral: true,
        });
    }

    const channel = await interaction.guild.channels
        .fetch(session.channelId)
        .catch(() => null);

    if (!channel?.isTextBased() || channel.isDMBased()) {
        return interaction.reply({
            content: 'The setup channel is unavailable.',
            ephemeral: true,
        });
    }

    const botMember = await interaction.guild.members.fetchMe();

    if (!channel.permissionsFor(botMember)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ])) {
        return interaction.reply({
            content: 'I do not have permission to publish in that channel.',
            ephemeral: true,
        });
    }

    for (const option of session.options) {
        const role = await interaction.guild.roles
            .fetch(option.roleId)
            .catch(() => null);

        if (!role) {
            return interaction.reply({
                content: `Role for ${option.name} no longer exists.`,
                ephemeral: true,
            });
        }

        if (role.position >= botMember.roles.highest.position) {
            return interaction.reply({
                content: `Move my bot role above ${role.name} in the role hierarchy.`,
                ephemeral: true,
            });
        }
    }

    let embed;

    try {
        embed = buildPanelEmbed(session);
    } catch (error) {
        return interaction.reply({
            content: error.message,
            ephemeral: true,
        });
    }

    try {
        await channel.send({
            embeds: [embed],
            components: buildRoleButtons(session.options),
            allowedMentions: {
                parse: [],
            },
        });

        sessions.delete(interaction.user.id);

        return interaction.update({
            content: `✅ Reaction role panel published successfully in <#${channel.id}>!`,
            components: [],
            allowedMentions: {
                parse: [],
            },
        });

    } catch (error) {
        console.error('[Reaction Roles] Publish error:', error);

        return interaction.reply({
            content: 'Failed to publish the panel. Check my permissions.',
            ephemeral: true,
        });
    }
}

/*
|--------------------------------------------------------------------------
| ROLE BUTTON HANDLER
|--------------------------------------------------------------------------
*/

async function handleRoleButton(interaction) {
    if (!interaction.inGuild()) {
        return interaction.reply({
            content: 'This button only works inside a server.',
            ephemeral: true,
        });
    }

    const roleId = interaction.customId.slice('rrrole:'.length);

    if (!/^\d{17,20}$/.test(roleId)) {
        return interaction.reply({
            content: 'Invalid role configuration.',
            ephemeral: true,
        });
    }

    try {
        const role = await interaction.guild.roles
            .fetch(roleId)
            .catch(() => null);

        if (!role || role.managed || role.id === interaction.guild.id) {
            return interaction.reply({
                content: 'This role is no longer available.',
                ephemeral: true,
            });
        }

        const botMember = await interaction.guild.members.fetchMe();

        if (
            !botMember.permissions.has(PermissionFlagsBits.ManageRoles) ||
            role.position >= botMember.roles.highest.position
        ) {
            return interaction.reply({
                content: 'I cannot manage this role. Contact an administrator.',
                ephemeral: true,
            });
        }

        const member = await interaction.guild.members.fetch(
            interaction.user.id
        );

        if (member.roles.cache.has(role.id)) {
            await member.roles.remove(
                role,
                'Reaction role button toggled off'
            );

            return interaction.reply({
                content: `❌ The **${role.name}** role has been removed.`,
                ephemeral: true,
                allowedMentions: {
                    parse: [],
                },
            });
        }

        await member.roles.add(
            role,
            'Reaction role button toggled on'
        );

        return interaction.reply({
            content: `✅ You have received the **${role.name}** role!`,
            ephemeral: true,
            allowedMentions: {
                parse: [],
            },
        });

    } catch (error) {
        console.error('[Reaction Roles] Role error:', error);

        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
                content: 'Something went wrong while changing your role.',
                ephemeral: true,
            });
        }
    }
}

/*
|--------------------------------------------------------------------------
| INTERACTION HANDLER
|--------------------------------------------------------------------------
*/

client.on('interactionCreate', async interaction => {
    try {
        // Slash commands
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'reactionrole') {
                if (interaction.options.getSubcommand() === 'setup') {
                    await executeReactionRole(interaction);
                }
            }

            return;
        }

        // Modals
        if (
            interaction.isModalSubmit() &&
            interaction.customId.startsWith('rrmodal:')
        ) {
            await handleModal(interaction);
            return;
        }

        // Buttons
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('rrrole:')) {
                await handleRoleButton(interaction);
                return;
            }

            if (interaction.customId.startsWith('rrsetup:')) {
                const session = getSession(interaction.user.id);

                if (!session || session.guildId !== interaction.guildId) {
                    return interaction.reply({
                        content: 'Your setup expired. Run /reactionrole setup again.',
                        ephemeral: true,
                    });
                }

                if (!interaction.memberPermissions?.has(
                    PermissionFlagsBits.ManageRoles
                )) {
                    return interaction.reply({
                        content: 'You need Manage Roles permission.',
                        ephemeral: true,
                    });
                }

                const action = interaction.customId.split(':')[1];

                if (action === 'cancel') {
                    sessions.delete(interaction.user.id);

                    return interaction.update({
                        content: 'Reaction role setup cancelled.',
                        components: [],
                    });
                }

                if (action === 'publish') {
                    await publishPanel(interaction);
                    return;
                }

                await openModal(interaction, action);
            }
        }

    } catch (error) {
        console.error('[Interaction Error]', error);

        if (
            interaction.isRepliable() &&
            !interaction.replied &&
            !interaction.deferred
        ) {
            await interaction.reply({
                content: 'An unexpected error occurred. Check the bot console.',
                ephemeral: true,
            }).catch(() => {});
        }
    }
});

/*
|--------------------------------------------------------------------------
| REGISTER COMMANDS AND START BOT
|--------------------------------------------------------------------------
*/

client.once('ready', async () => {
    console.log('--------------------------------');
    console.log(`Spectre online as ${client.user.tag}`);
    console.log('--------------------------------');

    const rest = new REST({
        version: '10',
    }).setToken(DISCORD_TOKEN);

    try {
        const route = GUILD_ID
            ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
            : Routes.applicationCommands(CLIENT_ID);

        await rest.put(route, {
            body: [reactionRoleCommand.toJSON()],
        });

        console.log('Successfully registered /reactionrole setup.');

        if (GUILD_ID) {
            console.log(`Registered to server: ${GUILD_ID}`);
        } else {
            console.log('Registered globally. Global updates may take time.');
        }

    } catch (error) {
        console.error('Command registration failed:', error);
    }
});

client.on('error', error => {
    console.error('[Discord Client Error]', error);
});

process.on('unhandledRejection', error => {
    console.error('[Unhandled Rejection]', error);
});

client.login(DISCORD_TOKEN);

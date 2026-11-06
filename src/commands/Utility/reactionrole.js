
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
} from 'discord.js';

/*
|--------------------------------------------------------------------------
| SPECTRE - REACTION ROLE SYSTEM
|--------------------------------------------------------------------------
| Command: /reactionrole setup
| Discord.js: v14
|
| Features:
| - Private interactive setup
| - Custom heading and body
| - Custom embed side colour
| - Custom image and footer
| - Custom button names and colours
| - Role ID configuration
| - Toggle roles on button clicks
| - Ephemeral success/error responses
|--------------------------------------------------------------------------
*/

const MAX_OPTIONS = 25;
const MAX_BUTTON_LABEL = 80;

const sessions = new Map();

const BUTTON_STYLES = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
    1: ButtonStyle.Primary,
    2: ButtonStyle.Secondary,
    3: ButtonStyle.Success,
    4: ButtonStyle.Danger,
};

/*
|--------------------------------------------------------------------------
| SLASH COMMAND
|--------------------------------------------------------------------------
*/

export const data = new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Create and manage reaction role panels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
        subcommand
            .setName('setup')
            .setDescription('Create a custom reaction role panel.')
    );

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getSession(userId) {
    return sessions.get(userId);
}

function getStyle(value) {
    return BUTTON_STYLES[String(value || '1').toLowerCase()] ?? null;
}

function validColour(value) {
    return /^#?[0-9a-fA-F]{6}$/.test(value);
}

function getColour(value) {
    return parseInt(value.replace('#', ''), 16);
}

function makeInput(id, label, options = {}) {
    return new ActionRowBuilder().addComponents(
        new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setStyle(options.paragraph
                ? TextInputStyle.Paragraph
                : TextInputStyle.Short)
            .setRequired(options.required ?? true)
            .setMaxLength(options.maxLength ?? 1000)
            .setPlaceholder(options.placeholder ?? '')
    );
}

function buildSetupComponents() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rr:heading')
            .setLabel('Edit Heading')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('rr:body')
            .setLabel('Edit Body')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId('rr:colour')
            .setLabel('Side Colour')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('rr:image')
            .setLabel('Image')
            .setStyle(ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('rr:footer')
            .setLabel('Footer')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rr:add')
            .setLabel('Add Option')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('rr:publish')
            .setLabel('Publish Panel')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId('rr:cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
    );

    return [row1, row2];
}

function buildSetupContent(session) {
    const options = session.options.length
        ? session.options.map((option, index) =>
            `**${index + 1}. ${option.name}** → <@&${option.roleId}> (${option.styleName})`
        ).join('\n')
        : '*No options added yet.*';

    return [
        '# Spectre Reaction Role Builder',
        '',
        '**Current configuration**',
        `**Heading:** ${session.heading || 'Not set'}`,
        `**Body:** ${session.body || 'Not set'}`,
        `**Side colour:** ${session.colour}`,
        `**Image:** ${session.image || 'None'}`,
        `**Footer:** ${session.footer || 'None'}`,
        '',
        `**Options (${session.options.length}/${MAX_OPTIONS})**`,
        options,
        '',
        'Use the buttons below to customize your panel.',
        'When finished, press **Publish Panel**.'
    ].join('\n');
}

/*
|--------------------------------------------------------------------------
| CREATE / REBUILD EMBED
|--------------------------------------------------------------------------
*/

function buildPanelEmbed(session) {
    const description = [
        session.body,
        '',
        ...session.options.map((option, index) =>
            `**${index + 1}. ${option.name}**`
        )
    ].join('\n');

    if (description.length > 4096) {
        throw new Error(
            'The panel description is too long. Shorten the body or option names.'
        );
    }

    const embed = new EmbedBuilder()
        .setColor(getColour(session.colour))
        .setTitle(session.heading)
        .setDescription(description);

    if (session.image) {
        embed.setImage(session.image);
    }

    if (session.footer) {
        embed.setFooter({ text: session.footer });
    }

    return embed;
}

/*
|--------------------------------------------------------------------------
| BUILD ROLE BUTTONS
|--------------------------------------------------------------------------
*/

function buildRoleButtons(session) {
    const rows = [];

    for (let i = 0; i < session.options.length; i += 5) {
        const row = new ActionRowBuilder();

        const group = session.options.slice(i, i + 5);

        for (const option of group) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`rr:role:${option.roleId}`)
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

export async function execute(interaction) {
    if (interaction.options.getSubcommand() !== 'setup') {
        return;
    }

    if (!interaction.inGuild()) {
        return interaction.reply({
            content: 'This command can only be used inside a server.',
            ephemeral: true,
        });
    }

    if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageRoles
    )) {
        return interaction.reply({
            content: 'You need the Manage Roles permission.',
            ephemeral: true,
        });
    }

    const session = {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        heading: 'Reaction Roles',
        body: 'Choose the roles you would like to receive.',
        colour: '#F8D568',
        image: '',
        footer: "Don't spam the buttons",
        options: [],
    };

    sessions.set(interaction.user.id, session);

    await interaction.reply({
        content: buildSetupContent(session),
        components: buildSetupComponents(),
        ephemeral: true,
    });
}

/*
|--------------------------------------------------------------------------
| OPEN MODALS
|--------------------------------------------------------------------------
*/

async function openModal(interaction, type) {
    const session = getSession(interaction.user.id);

    if (!session) {
        return interaction.reply({
            content: 'Your setup session expired. Run /reactionrole setup again.',
            ephemeral: true,
        });
    }

    const modal = new ModalBuilder();

    if (type === 'heading') {
        modal
            .setCustomId('rr:modal:heading')
            .setTitle('Edit Panel Heading')
            .addComponents(
                makeInput('heading', 'Panel heading', {
                    maxLength: 256,
                    placeholder: 'Sun & Citrus',
                })
            );
    }

    if (type === 'body') {
        modal
            .setCustomId('rr:modal:body')
            .setTitle('Edit Panel Body')
            .addComponents(
                makeInput('body', 'Panel body / description', {
                    paragraph: true,
                    maxLength: 3000,
                    placeholder: 'Choose your preferred roles below...',
                })
            );
    }

    if (type === 'colour') {
        modal
            .setCustomId('rr:modal:colour')
            .setTitle('Edit Side Colour')
            .addComponents(
                makeInput('colour', 'Hex colour', {
                    maxLength: 7,
                    placeholder: '#F8D568',
                })
            );
    }

    if (type === 'image') {
        modal
            .setCustomId('rr:modal:image')
            .setTitle('Edit Panel Image')
            .addComponents(
                makeInput('image', 'Image URL', {
                    required: false,
                    maxLength: 500,
                    placeholder: 'https://example.com/image.png',
                })
            );
    }

    if (type === 'footer') {
        modal
            .setCustomId('rr:modal:footer')
            .setTitle('Edit Panel Footer')
            .addComponents(
                makeInput('footer', 'Footer text', {
                    required: false,
                    maxLength: 2048,
                    placeholder: "Don't spam the buttons",
                })
            );
    }

    if (type === 'add') {
        modal
            .setCustomId('rr:modal:add')
            .setTitle('Add Reaction Role Option')
            .addComponents(
                makeInput('name', 'Button name', {
                    maxLength: MAX_BUTTON_LABEL,
                    placeholder: 'Light Yellow',
                }),
                makeInput('roleId', 'Role ID', {
                    maxLength: 25,
                    placeholder: 'Enter the Discord role ID',
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
| MODAL SUBMISSIONS
|--------------------------------------------------------------------------
*/

async function handleModal(interaction) {
    const session = getSession(interaction.user.id);

    if (!session) {
        return interaction.reply({
            content: 'Your setup session expired. Start again.',
            ephemeral: true,
        });
    }

    if (session.guildId !== interaction.guildId) {
        return interaction.reply({
            content: 'This setup belongs to another server.',
            ephemeral: true,
        });
    }

    const type = interaction.customId.split(':')[2];

    if (type === 'heading') {
        session.heading = interaction.fields.getTextInputValue('heading').trim();

        if (!session.heading) {
            return interaction.reply({
                content: 'The heading cannot be empty.',
                ephemeral: true,
            });
        }
    }

    if (type === 'body') {
        session.body = interaction.fields.getTextInputValue('body').trim();
    }

    if (type === 'colour') {
        const colour = interaction.fields
            .getTextInputValue('colour')
            .trim();

        if (!validColour(colour)) {
            return interaction.reply({
                content: 'Invalid colour. Use a hex colour such as #F8D568.',
                ephemeral: true,
            });
        }

        session.colour = colour.startsWith('#')
            ? colour
            : `#${colour}`;
    }

    if (type === 'image') {
        const image = interaction.fields
            .getTextInputValue('image')
            .trim();

        if (image) {
            try {
                const url = new URL(image);

                if (!['https:', 'http:'].includes(url.protocol)) {
                    throw new Error('Invalid protocol');
                }
            } catch {
                return interaction.reply({
                    content: 'Please provide a valid HTTP or HTTPS image URL.',
                    ephemeral: true,
                });
            }
        }

        session.image = image;
    }

    if (type === 'footer') {
        session.footer = interaction.fields
            .getTextInputValue('footer')
            .trim();
    }

    if (type === 'add') {
        if (session.options.length >= MAX_OPTIONS) {
            return interaction.reply({
                content: `Discord allows a maximum of ${MAX_OPTIONS} buttons on one message.`,
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
            .trim();

        const style = getStyle(styleInput);

        if (!name || name.length > MAX_BUTTON_LABEL) {
            return interaction.reply({
                content: 'Enter a valid button name (1-80 characters).',
                ephemeral: true,
            });
        }

        if (!/^\d{17,20}$/.test(roleId)) {
            return interaction.reply({
                content: 'That is not a valid Discord role ID.',
                ephemeral: true,
            });
        }

        if (!style) {
            return interaction.reply({
                content: 'Invalid button colour. Choose 1, 2, 3 or 4.',
                ephemeral: true,
            });
        }

        const role = await interaction.guild.roles.fetch(roleId)
            .catch(() => null);

        if (!role) {
            return interaction.reply({
                content: 'I could not find that role in this server.',
                ephemeral: true,
            });
        }

        if (role.managed || role.id === interaction.guild.id) {
            return interaction.reply({
                content: 'That role cannot be assigned by this system.',
                ephemeral: true,
            });
        }

        if (session.options.some(option => option.roleId === roleId)) {
            return interaction.reply({
                content: 'That role has already been added to this panel.',
                ephemeral: true,
            });
        }

        const styleNames = {
            [ButtonStyle.Primary]: 'Blue',
            [ButtonStyle.Secondary]: 'Grey',
            [ButtonStyle.Success]: 'Green',
            [ButtonStyle.Danger]: 'Red',
        };

        session.options.push({
            name,
            roleId,
            style,
            styleName: styleNames[style],
        });
    }

    return interaction.reply({
        content: `Successfully updated your setup. You currently have ${session.options.length} option(s).`,
        ephemeral: true,
    });
}

/*
|--------------------------------------------------------------------------
| PUBLISH PANEL
|--------------------------------------------------------------------------
*/

async function publishPanel(interaction) {
    const session = getSession(interaction.user.id);

    if (!session) {
        return interaction.reply({
            content: 'Your setup session expired.',
            ephemeral: true,
        });
    }

    if (session.guildId !== interaction.guildId) {
        return interaction.reply({
            content: 'This setup belongs to another server.',
            ephemeral: true,
        });
    }

    if (!session.options.length) {
        return interaction.reply({
            content: 'Add at least one role option before publishing.',
            ephemeral: true,
        });
    }

    if (!session.heading.trim()) {
        return interaction.reply({
            content: 'Please configure a heading first.',
            ephemeral: true,
        });
    }

    const channel = await interaction.guild.channels.fetch(
        session.channelId
    ).catch(() => null);

    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        return interaction.reply({
            content: 'The original channel is unavailable.',
            ephemeral: true,
        });
    }

    const botMember = await interaction.guild.members.fetchMe();

    if (!channel.permissionsFor(botMember).has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ])) {
        return interaction.reply({
            content: 'I need View Channel, Send Messages and Embed Links permissions.',
            ephemeral: true,
        });
    }

    // Check all configured roles before publishing.
    for (const option of session.options) {
        const role = await interaction.guild.roles.fetch(option.roleId)
            .catch(() => null);

        if (!role) {
            return interaction.reply({
                content: `The role for **${option.name}** no longer exists.`,
                ephemeral: true,
            });

        }

        if (role.position >= botMember.roles.highest.position) {
            return interaction.reply({
                content: `Move my bot role above **${role.name}** before publishing.`,
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
            components: buildRoleButtons(session),
        });

        sessions.delete(interaction.user.id);

        return interaction.update({
            content: '✅ **Reaction role panel successfully published!**',
            components: [],
        });

    } catch (error) {
        console.error('[Spectre Reaction Roles] Publish error:', error);

        return interaction.reply({
            content: 'Failed to publish the panel. Check my channel permissions.',
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
    const roleId = interaction.customId.split(':')[2];

    if (!interaction.inGuild()) {
        return interaction.reply({
            content: 'This button only works inside a server.',
            ephemeral: true,
        });
    }

    if (!/^\d{17,20}$/.test(roleId)) {
        return interaction.reply({
            content: 'Invalid role configuration.',
            ephemeral: true,
        });
    }

    try {
        const role = await interaction.guild.roles.fetch(roleId);

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
                content: 'I cannot manage this role. Please contact an administrator.',
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
                content: `❌ The ${role} role has been removed.`,
                ephemeral: true,
                allowedMentions: {
                    roles: [],
                },
            });
        }

        await member.roles.add(
            role,
            'Reaction role button toggled on'
        );

        return interaction.reply({
            content: `✅ You have received the ${role} role!`,
            ephemeral: true,
            allowedMentions: {
                roles: [],
            },
        });

    } catch (error) {
        console.error('[Spectre Reaction Roles] Role error:', error);

        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({
                content: 'Something went wrong while changing your role. Please try again.',
                ephemeral: true,
            });
        }
    }
}

/*
|--------------------------------------------------------------------------
| MAIN INTERACTION ROUTER
|--------------------------------------------------------------------------
| Call this function from your main interactionCreate event.
|--------------------------------------------------------------------------
*/

export async function handleReactionRoleInteraction(interaction) {
    if (interaction.isModalSubmit()) {
        if (!interaction.customId.startsWith('rr:modal:')) {
            return false;
        }

        await handleModal(interaction);
        return true;
    }

    if (!interaction.isButton()) {
        return false;
    }

    const id = interaction.customId;

    // Published role buttons.
    if (id.startsWith('rr:role:')) {
        await handleRoleButton(interaction);
        return true;
    }

    // Setup buttons.
    if (!id.startsWith('rr:')) {
        return false;
    }

    const session = getSession(interaction.user.id);

    if (!session) {
        await interaction.reply({
            content: 'Your setup session expired. Run /reactionrole setup again.',
            ephemeral: true,
        });

        return true;
    }

    if (session.guildId !== interaction.guildId) {
        await interaction.reply({
            content: 'This setup belongs to another server.',
            ephemeral: true,
        });

        return true;
    }

    if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageRoles
    )) {
        await interaction.reply({
            content: 'You need Manage Roles permission.',
            ephemeral: true,
        });

        return true;
    }

    const action = id.split(':')[1];

    if (action === 'heading') {
        await openModal(interaction, 'heading');
    } else if (action === 'body') {
        await openModal(interaction, 'body');
    } else if (action === 'colour') {
        await openModal(interaction, 'colour');
    } else if (action === 'image') {
        await openModal(interaction, 'image');
    } else if (action === 'footer') {
        await openModal(interaction, 'footer');
    } else if (action === 'add') {
        await openModal(interaction, 'add');
    } else if (action === 'publish') {
        await publishPanel(interaction);
    } else if (action === 'cancel') {
        sessions.delete(interaction.user.id);

        await interaction.update({
            content: '❌ Reaction role setup cancelled.',
            components: [],
        });
    } else {
        return false;
    }

    return true;
}

/*
|--------------------------------------------------------------------------
| DEFAULT EXPORT
|--------------------------------------------------------------------------
*/

export default {
    data,
    execute,
};

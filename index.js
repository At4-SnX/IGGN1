import {
  ActivityType, Client, Events, GatewayIntentBits, PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { config, kinds, stream } from './src/config.js';
import { refreshDashboard } from './src/dashboard.js';
import { startScheduler } from './src/engine.js';
import { handleActions } from './src/features/actions.js';
import { handleCompteRendu } from './src/features/compterendu.js';
import { handleFile } from './src/features/file.js';
import { handlePanel } from './src/features/panel.js';
import { asEdit, buildNotice } from './src/ui.js';
import { UserError } from './src/utils.js';

const intents = [GatewayIntentBits.Guilds];
if (config.membersIntent) intents.push(GatewayIntentBits.GuildMembers);
const client = new Client({ intents });

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Envoie les panneaux IGGN dans ce salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName('panneau')
        .setDescription('Panneau à envoyer (panneaux IGGN par défaut)')
        .addChoices(
          { name: 'Panneaux IGGN (tous les panneaux staff)', value: 'staff' },
          { name: 'Compte rendu', value: 'compterendu' },
          { name: 'Tableau de bord', value: 'dashboard' },
          { name: 'IGGN (consultation)', value: 'iggn' },
          { name: 'Avertissement', value: 'avertissement' },
          { name: 'Sanction', value: 'sanction' },
          { name: 'Promotion', value: 'promotion' },
          { name: 'Rétrogradation', value: 'retrogradation' },
          { name: 'Honneur', value: 'honneur' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('officier')
    .setDescription('Consulter le dossier personnel d\'un officier')
    .addUserOption((o) => o.setName('utilisateur').setDescription('Officier').setRequired(true)),
].map((c) => c.toJSON());

client.once(Events.ClientReady, async (c) => {
  c.user.setPresence({
    status: 'online',
    activities: [{ name: stream.name, type: ActivityType.Streaming, url: stream.url }],
  });

  const guild = await c.guilds.fetch(config.guildId);
  await guild.roles.fetch();
  await guild.commands.set(commands);

  // Vérifications de configuration (avertissements dans les logs)
  if (!config.gradeRoleIds.length) console.warn('[CONFIG] GRADE_ROLE_IDS est vide : promotions / rétrogradations indisponibles, grades non affichés.');
  for (const id of config.gradeRoleIds) if (!guild.roles.cache.has(id)) console.warn(`[CONFIG] Rôle de grade introuvable : ${id}`);
  for (const [key, def] of Object.entries(kinds)) {
    if (def.role !== undefined && !def.role && def.group !== 'grade') console.warn(`[CONFIG] Pas de rôle configuré pour « ${def.label} » (${key}) : seul l'enregistrement sera effectué.`);
  }

  startScheduler(c);
  await refreshDashboard(c);
  console.log(`[BOT] Connecté en tant que ${c.user.tag} — ${config.gradeRoleIds.length} grade(s) configuré(s)`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    for (const handler of [handlePanel, handleActions, handleCompteRendu, handleFile]) {
      if (await handler(interaction)) return;
    }
  } catch (err) {
    const user = err instanceof UserError;
    if (!user) console.error('[ERREUR]', err);

    const payload = buildNotice(user ? 'Action impossible' : 'Erreur', user ? err.message : 'Une erreur est survenue. Vérifiez la configuration (forums, rôles, permissions) puis réessayez.');
    if (interaction.isStringSelectMenu?.() && interaction.deferred) {
      await interaction.editReply({ content: `⚠️ ${user ? err.message : 'Une erreur est survenue.'}`, components: [] }).catch(() => null);
    } else if (interaction.deferred || interaction.replied) {
      await interaction.editReply(asEdit(payload)).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

client.login(config.token);

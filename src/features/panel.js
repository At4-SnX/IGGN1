import { MessageFlags } from 'discord.js';
import { fileContext } from '../engine.js';
import { postDashboard, refreshDashboard } from '../dashboard.js';
import { officerSummary } from '../render.js';
import { asEdit, buildNotice, buildPanel } from '../ui.js';
import { guard } from '../utils.js';

// Ensemble de panneaux envoyé par défaut (salon réservé à l'IGGN)
const STAFF_PANELS = ['iggn', 'avertissement', 'sanction', 'promotion', 'retrogradation', 'honneur'];

export async function handlePanel(interaction) {
  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      // ── /setup : envoie les panneaux dans le salon courant ────────────────
      case 'setup': {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const choice = interaction.options.getString('panneau') ?? 'staff';
        if (choice === 'dashboard') {
          await postDashboard(interaction.channel);
        } else {
          for (const key of choice === 'staff' ? STAFF_PANELS : [choice]) await interaction.channel.send(buildPanel(key));
        }
        await interaction.editReply('Panneau(x) envoyé(s).');
        return true;
      }

      // ── /officier : consultation rapide d'un dossier ──────────────────────
      case 'officier': {
        if (!(await guard(interaction))) return true;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('utilisateur', true);
        const ctx = await fileContext(interaction.client, interaction.guild, user.id);
        await interaction.editReply(asEdit(buildNotice(`Dossier de ${ctx.displayName ?? user.username}`, officerSummary(ctx))));
        return true;
      }
      default:
        return false;
    }
  }

  // ── Bouton « Actualiser » du dashboard ──────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'dash:refresh') {
    if (!(await guard(interaction))) return true;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await refreshDashboard(interaction.client);
    await interaction.editReply(asEdit(buildNotice('Tableau de bord', 'Le tableau de bord a été actualisé.')));
    return true;
  }
  return false;
}


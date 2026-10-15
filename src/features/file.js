import { MessageFlags } from 'discord.js';
import { kinds } from '../config.js';
import { endRecord, fileContext, refreshOfficerFile } from '../engine.js';
import { officerSummary, recordHeadline } from '../render.js';
import * as store from '../store.js';
import { asEdit, buildNotice } from '../ui.js';
import {
  UserError, buildModal, ephemeral, guard, readValues, stringSelectRow, userSelectRow,
} from '../utils.js';

const LIFTABLE = ['avertissement', 'suspension', 'mise_a_pied', 'retire', 'demande_cr'];
const liftFields = [{ id: 'note', label: 'Motif de la levée / de la clôture', long: true, max: 500, required: false }];

async function showSummary(interaction, userId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const ctx = await fileContext(interaction.client, interaction.guild, userId);
  await interaction.editReply(asEdit(buildNotice(`Dossier de ${ctx.displayName ?? userId}`, officerSummary(ctx))));
}

export async function handleFile(interaction) {
  const parts = interaction.customId?.split(':');
  if (!parts || parts[0] !== 'file') return false;
  const [, step, a] = parts;

  // « Mon dossier » : accessible à tous
  if (step === 'me') {
    await showSummary(interaction, interaction.user.id);
    return true;
  }
  if (!(await guard(interaction))) return true;

  switch (step) {
    // ── Consultation ───────────────────────────────────────────────────────
    case 'consult':
      await interaction.reply(ephemeral('**Dossier personnel** — sélectionnez l\'officier :', userSelectRow('file:consultuser', 'Officier…')));
      return true;
    case 'consultuser':
      await showSummary(interaction, interaction.values[0]);
      return true;

    // ── Actualisation de la fiche ──────────────────────────────────────────
    case 'refresh': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await refreshOfficerFile(interaction.client, interaction.guild, a);
      await interaction.editReply(asEdit(buildNotice('Dossier actualisé', `Le dossier de <@${a}> a été mis à jour (grade, statut, compteurs).`)));
      return true;
    }

    // ── Levée / clôture d'une mesure ───────────────────────────────────────
    case 'lift': {
      if (!(await guard(interaction, 'manage'))) return true;
      const active = store.activeRecords(a).filter((r) => LIFTABLE.includes(r.kind)).slice(-25);
      if (!active.length) {
        await interaction.reply(buildNotice('Rien à lever', `<@${a}> n'a aucune mesure active.`));
        return true;
      }
      await interaction.reply(
        ephemeral(
          `**Lever / clôturer** — mesure active de <@${a}> :`,
          stringSelectRow(
            `file:dolift:${a}`,
            'Mesure à lever…',
            active.map((r) => ({ value: r.id, label: `${r.id} • ${kinds[r.kind].label}`, emoji: kinds[r.kind].emoji, description: recordHeadline(r) })),
          ),
        ),
      );
      return true;
    }
    case 'dolift': {
      if (!(await guard(interaction, 'manage'))) return true;
      const record = store.getRecord(interaction.values[0]);
      if (!record?.active) throw new UserError('Cette mesure n\'est plus active.');
      await interaction.showModal(buildModal(`file:liftmodal:${record.id}`, `Lever ${record.id}`, liftFields));
      return true;
    }
    case 'liftmodal': {
      if (!(await guard(interaction, 'manage'))) return true;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const note = readValues(interaction, liftFields).note;
      const record = await endRecord(interaction.client, interaction.guild, a, { reason: 'levée', byId: interaction.user.id, note });
      await interaction.editReply(asEdit(buildNotice('Mesure levée', `${kinds[record.kind].emoji} **${kinds[record.kind].label}** \`${record.id}\` levée pour <@${record.userId}>. Le rôle a été retiré si nécessaire.`)));
      return true;
    }
    default:
      return false;
  }
}

import { MessageFlags } from 'discord.js';
import { config, kinds, medailles, sanctionKinds } from '../config.js';
import { gradeIndex, gradeOptions, performAction } from '../engine.js';
import { asEdit, buildNotice } from '../ui.js';
import {
  UserError, buildModal, ephemeral, formatDuration, guard, readValues, stringSelectRow, ts, userSelectRow,
} from '../utils.js';

// Flux proposés depuis les panneaux (clé = identifiant du bouton act:start:<flux>)
const FLOW_LABEL = {
  avertissement: 'Avertissement',
  sanction: 'Sanction',
  promotion: 'Promotion',
  retrogradation: 'Rétrogradation',
  honneur: 'Honneur',
  demande_cr: 'Demande de compte rendu',
};

export async function handleActions(interaction) {
  const parts = interaction.customId?.split(':');
  if (!parts || parts[0] !== 'act') return false;
  if (!(await guard(interaction))) return true;

  const [, step, a, b, c] = parts;
  const guild = interaction.guild;

  switch (step) {
    // ── 1. Clic sur le bouton du panneau : choix de l'officier ──────────────
    case 'start': {
      if (!FLOW_LABEL[a]) return false;
      if (kinds[a]?.restricted && !(await guard(interaction, 'manage'))) return true;
      await interaction.reply(
        ephemeral(`**${FLOW_LABEL[a]}** — sélectionnez l'officier concerné :`, userSelectRow(`act:user:${a}`, 'Sélectionnez l\'officier…')),
      );
      return true;
    }

    // ── 2. Officier choisi : étape suivante selon le flux ──────────────────
    case 'user': {
      const userId = interaction.values[0];
      if (interaction.users.get(userId)?.bot) throw new UserError('Impossible de cibler un bot.');
      if (userId === interaction.user.id) throw new UserError('Vous ne pouvez pas vous cibler vous-même.');

      if (a === 'avertissement' || a === 'demande_cr') {
        await interaction.showModal(buildModal(`act:modal:${a}:${userId}`, kinds[a].label, kinds[a].fields));
        return true;
      }
      if (a === 'sanction') {
        await interaction.update({
          content: `**Sanction** — choisissez la mesure pour <@${userId}> :`,
          components: [
            stringSelectRow(
              `act:kind:sanction:${userId}`,
              'Type de sanction',
              sanctionKinds.map((k) => ({
                value: k,
                label: kinds[k].label,
                emoji: kinds[k].emoji,
                description: k === 'suspension' ? 'Avec durée obligatoire' : k === 'mise_a_pied' ? 'Durée facultative' : 'Réservé à la direction',
              })),
            ),
          ],
        });
        return true;
      }
      if (a === 'promotion' || a === 'retrogradation') {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) throw new UserError('Cet officier n\'est plus présent sur le serveur.');
        const options = gradeOptions(guild, member, a === 'promotion' ? 'up' : 'down');
        const current = gradeIndex(member);
        await interaction.update({
          content: `**${FLOW_LABEL[a]}** — <@${userId}> (grade actuel : ${current >= 0 ? `<@&${config.gradeRoleIds[current]}>` : 'non défini'}). Choisissez le nouveau grade :`,
          components: [stringSelectRow(`act:grade:${a}:${userId}`, 'Nouveau grade', options)],
        });
        return true;
      }
      if (a === 'honneur') {
        await interaction.update({
          content: `**Honneur** — choisissez la distinction pour <@${userId}> :`,
          components: [stringSelectRow(`act:medal:honneur:${userId}`, 'Distinction', medailles)],
        });
        return true;
      }
      return false;
    }

    // ── 3a. Type de sanction choisi -> formulaire ──────────────────────────
    case 'kind': {
      const kind = interaction.values[0];
      if (!sanctionKinds.includes(kind)) throw new UserError('Sanction inconnue.');
      if (kinds[kind].restricted && !(await guard(interaction, 'manage'))) return true;
      await interaction.showModal(buildModal(`act:modal:${kind}:${b}`, kinds[kind].label, kinds[kind].fields));
      return true;
    }

    // ── 3b. Grade choisi -> formulaire ─────────────────────────────────────
    case 'grade':
      await interaction.showModal(buildModal(`act:modal:${a}:${b}:${interaction.values[0]}`, kinds[a].label, kinds[a].fields));
      return true;

    // ── 3c. Distinction choisie -> formulaire ──────────────────────────────
    case 'medal':
      await interaction.showModal(buildModal(`act:modal:honneur:${b}:${interaction.values[0]}`, kinds.honneur.label, kinds.honneur.fields));
      return true;

    // ── 4. Formulaire envoyé : exécution ───────────────────────────────────
    case 'modal': {
      const def = kinds[a];
      if (!def || a === 'compterendu') return false;
      if (def.restricted && !(await guard(interaction, 'manage'))) return true;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const values = readValues(interaction, def.fields);
      const extra = a === 'honneur' ? { medal: c } : a === 'promotion' || a === 'retrogradation' ? { gradeId: c } : {};
      const { record, thread, dmOk } = await performAction(interaction.client, guild, { kind: a, targetId: b, byId: interaction.user.id, values, extra });

      const lines = [`${def.emoji} **${def.label}** enregistré(e) pour <@${record.userId}> — \`${record.id}\``];
      if (record.gradeTo) lines.push(`Grade : ${record.gradeFrom ? `<@&${record.gradeFrom}>` : 'aucun'} ➜ <@&${record.gradeTo}>`);
      if (record.medalLabel) lines.push(`Distinction : ${record.medalLabel}`);
      if (record.endsAt) lines.push(`Durée : ${formatDuration(record.durationMs)} — fin ${ts(record.endsAt, 'R')} (rôle retiré automatiquement)`);
      if (record.dueAt) lines.push(`À remettre avant le ${ts(record.dueAt, 'F')}`);
      lines.push(`Dossier : ${thread}`);
      if (!dmOk) lines.push('⚠️ Message privé non délivré (messages privés fermés).');

      await interaction.editReply(asEdit(buildNotice('Action enregistrée', lines.join('\n'))));
      return true;
    }
    default:
      return false;
  }
}

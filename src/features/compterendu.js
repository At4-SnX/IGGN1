import { MessageFlags } from 'discord.js';
import { kinds } from '../config.js';
import { sendDm, submitCompteRendu } from '../engine.js';
import { dmMessage } from '../render.js';
import * as store from '../store.js';
import { asEdit, buildNotice } from '../ui.js';
import {
  UserError, buildModal, canRenderCR, ephemeral, readValues, safely, userSelectRow,
} from '../utils.js';

export async function handleCompteRendu(interaction) {
  const parts = interaction.customId?.split(':');
  if (!parts || parts[0] !== 'cr') return false;
  const [, step, a] = parts;

  // Accusé de réception : bouton du message privé (pas de serveur dans ce contexte)
  if (step === 'ack') return acknowledge(interaction, a);

  if (!canRenderCR(interaction.member)) {
    await interaction.reply(buildNotice('Accès refusé', 'Vous n\'êtes pas autorisé à rendre un compte rendu.'));
    return true;
  }

  switch (step) {
    // ── 1. Bouton du panneau : choix du destinataire ───────────────────────
    case 'new':
      await interaction.reply(
        ephemeral('**Compte rendu** — sélectionnez l\'officier **destinataire** (il le recevra en message privé) :', userSelectRow('cr:dest', 'Officier destinataire…')),
      );
      return true;

    // ── 2. Destinataire choisi -> formulaire ───────────────────────────────
    case 'dest': {
      const destId = interaction.values[0];
      if (interaction.users.get(destId)?.bot) throw new UserError('Impossible d\'envoyer un compte rendu à un bot.');
      if (destId === interaction.user.id) throw new UserError('Vous ne pouvez pas être votre propre destinataire.');
      await interaction.showModal(buildModal(`cr:submit:${destId}`, 'Compte rendu', kinds.compterendu.fields));
      return true;
    }

    // ── 3. Formulaire envoyé : archivage + envoi en MP ─────────────────────
    case 'submit': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const values = readValues(interaction, kinds.compterendu.fields);
      const { record, thread, dmOk } = await submitCompteRendu(interaction.client, interaction.guild, {
        authorId: interaction.user.id,
        destId: a,
        values,
      });
      await interaction.editReply(
        asEdit(
          buildNotice(
            'Compte rendu transmis',
            `Le compte rendu \`${record.id}\` a été archivé (${thread}).\n` +
              (dmOk ? `✅ <@${a}> l'a reçu en **message privé**.` : `⚠️ <@${a}> n'a pas pu être contacté en message privé (messages privés fermés).`),
          ),
        ),
      );
      return true;
    }
    default:
      return false;
  }
}

async function acknowledge(interaction, recordId) {
  const found = store.getRecord(recordId);
  if (!found || found.kind !== 'compterendu') throw new UserError('Compte rendu introuvable.');
  if (interaction.user.id !== found.destId) {
    await interaction.reply(buildNotice('Accès refusé', 'Seul le destinataire peut accuser réception.'));
    return true;
  }
  const record = structuredClone(found);
  record.ackAt = record.ackAt ?? Date.now();
  store.saveRecord(record);

  await interaction.update({ components: dmMessage(record, { acked: true }).components });
  await safely('ACK', () =>
    sendDm(interaction.client, record.userId, buildNotice('Accusé de réception', `<@${record.destId}> a accusé réception du compte rendu \`${record.id}\`.`)),
  );
  return true;
}

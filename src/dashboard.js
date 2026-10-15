import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from 'discord.js';
import { config, emojis, kinds, theme } from './config.js';
import { countKinds, recordLine } from './render.js';
import * as store from './store.js';
import { V2, banner, bannerFile, divider, text } from './ui.js';
import { clip, safely, ts, userSelectRow } from './utils.js';

const NO_PING = { parse: [] };

// ─── Effectifs par grade (nécessite ENABLE_MEMBERS_INTENT=true) ──────────────
let effectifsCache = { at: 0, lines: null };
async function effectifs(guild) {
  if (!config.membersIntent || !config.gradeRoleIds.length) return null;
  if (Date.now() - effectifsCache.at < 300_000) return effectifsCache.lines;
  await guild.members.fetch().catch(() => null);
  const lines = [...config.gradeRoleIds].reverse().map((id) => `<@&${id}> : **${guild.roles.cache.get(id)?.members.size ?? 0}**`);
  effectifsCache = { at: Date.now(), lines };
  return lines;
}

export async function dashboardMessage(guild) {
  const records = store.allRecords();
  const c = countKinds(records);
  const sanctionsTotal = c.suspension.total + c.mise_a_pied.total + c.retire.total;
  const since = Date.now() - 30 * 86_400_000;
  const recent = records.filter((r) => r.createdAt >= since);
  const running = records
    .filter((r) => r.active && ['suspension', 'mise_a_pied', 'retire'].includes(r.kind))
    .sort((a, b) => (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity))
    .slice(0, 8);
  const lastActions = [...records].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(recordLine);
  const eff = await effectifs(guild);

  const stats =
    `${emojis.engrenage} ⚠️ **__Avertissements__** : **${c.avertissement.total}** (${c.avertissement.active} actif${c.avertissement.active > 1 ? 's' : ''})\n` +
    `${emojis.engrenage} ⛔ **__Sanctions__** : **${sanctionsTotal}**\n` +
    `> ⏸️ ${c.suspension.total} suspension(s) (${c.suspension.active} en cours) • 🚫 ${c.mise_a_pied.total} mise(s) à pied (${c.mise_a_pied.active} en cours) • ❌ ${c.retire.total} retrait(s)\n` +
    `${emojis.engrenage} ⬆️ **__Promotions__** : **${c.promotion.total}** • ⬇️ **__Rétrogradations__** : **${c.retrogradation.total}**\n` +
    `${emojis.engrenage} 🎖️ **__Honneurs__** : **${c.honneur.total}**\n` +
    `${emojis.engrenage} 📋 **__Comptes rendus__** : **${c.compterendu.total}** • 📨 ${c.demande_cr.active} demande(s) en attente\n` +
    `${emojis.engrenage} 🗓️ **__30 derniers jours__** : **${recent.length}** action(s)`;

  const runningText = running.length
    ? running.map((r) => `${kinds[r.kind].emoji} <@${r.userId}> — ${kinds[r.kind].label} • ${r.endsAt ? `fin ${ts(r.endsAt, 'R')}` : 'jusqu\'à levée'}`).join('\n')
    : 'Aucune sanction en cours';

  const container = new ContainerBuilder()
    .setAccentColor(theme.color)
    .addMediaGalleryComponents(banner('dashboard'))
    .addTextDisplayComponents(text(`### ${emojis.exc}**__ TABLEAU DE BORD — IGGN__**\n-# Mis à jour ${ts(Date.now(), 'R')}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(stats))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`${emojis.engrenage} **__Sanctions en cours__**\n${clip(runningText, 900)}`));

  if (eff) container.addSeparatorComponents(divider()).addTextDisplayComponents(text(`${emojis.engrenage} **__Effectifs par grade__**\n${clip(eff.join('\n'), 900)}`));

  container
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(`${emojis.engrenage} **__Dernières actions__**\n${clip(lastActions.join('\n') || 'Aucune', 900)}`))
    .addSeparatorComponents(divider())
    .addActionRowComponents(userSelectRow('file:consultuser', 'Consulter le dossier d\'un officier…'))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('dash:refresh').setLabel('Actualiser').setStyle(ButtonStyle.Secondary)),
    )
    .addTextDisplayComponents(text(`-# ${theme.footer}`));

  return { components: [container], files: [bannerFile('dashboard')], flags: V2, allowedMentions: NO_PING };
}

/** Publie le dashboard dans un salon et mémorise son message. */
export async function postDashboard(channel) {
  const message = await channel.send(await dashboardMessage(channel.guild));
  store.saveDashboard({ channelId: channel.id, messageId: message.id });
  return message;
}

/** Met à jour le message du dashboard (sans erreur si absent). */
export async function refreshDashboard(client) {
  const d = store.getDashboard();
  if (!d) return false;
  return (
    (await safely('DASHBOARD', async () => {
      const channel = await client.channels.fetch(d.channelId);
      const message = await channel.messages.fetch(d.messageId);
      await message.edit(await dashboardMessage(channel.guild));
      return true;
    })) ?? false
  );
}

// Regroupe les mises à jour rapprochées en une seule
let timer = null;
export function scheduleDashboard(client) {
  if (timer || !store.getDashboard()) return;
  timer = setTimeout(() => {
    timer = null;
    refreshDashboard(client);
  }, 3000);
}

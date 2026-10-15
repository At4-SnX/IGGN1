import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, ThumbnailBuilder,
} from 'discord.js';
import { config, emojis, kinds, medailles, theme } from './config.js';
import * as store from './store.js';
import { V2, divider, text } from './ui.js';
import { clip, formatDuration, one, truncate, ts } from './utils.js';

const NO_PING = { parse: [] };
const medalOf = (value) => medailles.find((m) => m.value === value);

/** Libellé court d'un enregistrement (première ligne utile). */
export const recordHeadline = (r) => truncate(one(r.medalLabel ?? r.fields[0]?.value ?? ''), 60);

export function recordLine(r) {
  const k = kinds[r.kind];
  return `\`${r.id}\` ${k.emoji} **${k.label}** — ${recordHeadline(r)} • ${ts(r.createdAt)}`;
}

/** Compteurs d'un ensemble d'enregistrements. */
export function countKinds(records) {
  const out = Object.fromEntries(Object.keys(kinds).map((k) => [k, { total: 0, active: 0 }]));
  for (const r of records) {
    if (!out[r.kind]) continue;
    out[r.kind].total += 1;
    if (r.active) out[r.kind].active += 1;
  }
  return out;
}

/** Pastille de statut du dossier. */
export function statusEmoji(records) {
  const active = (k) => records.some((r) => r.active && r.kind === k);
  if (active('retire')) return '⚫';
  if (active('suspension') || active('mise_a_pied')) return '🔴';
  if (active('avertissement')) return '🟠';
  return '🟢';
}

const plural = (n, one_, many) => `${n} ${n > 1 ? many : one_}`;

// ═══════════════════════════════════════════════════════════════════════════
//  Dossier personnel d'un officier (premier message du fil)
// ═══════════════════════════════════════════════════════════════════════════
export function officerFileMessage(ctx) {
  const records = store.recordsOf(ctx.userId);
  const c = countKinds(records);
  const sanctions = c.suspension.total + c.mise_a_pied.total + c.retire.total;
  const running = records.filter((r) => r.active && ['suspension', 'mise_a_pied', 'retire'].includes(r.kind));
  const honneurs = records.filter((r) => r.kind === 'honneur').map((r) => `${medalOf(r.medal)?.emoji ?? '🎖️'} ${r.medalLabel}`);

  const identity = [
    `> **__Officier__** : <@${ctx.userId}>${ctx.displayName ? ` (${ctx.displayName})` : ''}`,
    `> **__Grade actuel__** : ${ctx.gradeId ? `<@&${ctx.gradeId}>` : 'Non défini'}`,
    `> **__Statut__** : ${statusEmoji(records)} ${statusLabel(records)}`,
  ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(ctx.color ?? theme.color)
    .addTextDisplayComponents(text(`### ${emojis.exc}**__ DOSSIER PERSONNEL__**`))
    .addSeparatorComponents(divider());

  if (ctx.avatarUrl) {
    container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(identity)).setThumbnailAccessory(new ThumbnailBuilder().setURL(ctx.avatarUrl)));
  } else {
    container.addTextDisplayComponents(text(identity));
  }

  const counts =
    `${emojis.engrenage} **__Avertissements__** : ${c.avertissement.total} (${c.avertissement.active} actif${c.avertissement.active > 1 ? 's' : ''})\n` +
    `${emojis.engrenage} **__Sanctions__** : ${sanctions} — ⏸️ ${c.suspension.total} suspension(s) • 🚫 ${c.mise_a_pied.total} mise(s) à pied • ⛔ ${c.retire.total} retrait(s)\n` +
    `${emojis.engrenage} **__Carrière__** : ⬆️ ${plural(c.promotion.total, 'promotion', 'promotions')} • ⬇️ ${plural(c.retrogradation.total, 'rétrogradation', 'rétrogradations')} • 🎖️ ${plural(c.honneur.total, 'honneur', 'honneurs')}\n` +
    `${emojis.engrenage} **__Comptes rendus__** : ${c.compterendu.total} rendu(s) • ${c.demande_cr.active} demande(s) en attente`;

  const extra = [
    running.length
      ? `${emojis.engrenage} **__Sanctions en cours__**\n${running
          .map((r) => `${kinds[r.kind].emoji} **${kinds[r.kind].label}** — ${r.endsAt ? `fin ${ts(r.endsAt, 'R')} (${ts(r.endsAt, 'f')})` : 'jusqu\'à levée'}`)
          .join('\n')}`
      : null,
    honneurs.length ? `${emojis.engrenage} **__Distinctions__** : ${clip(honneurs.slice(-6).join(' • '), 500)}` : null,
  ].filter(Boolean);

  const last = records.slice(-5).reverse().map(recordLine);

  container
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(counts))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(clip([...extra, `${emojis.engrenage} **__Dernières actions__**\n${last.join('\n') || 'Aucune'}`].join('\n\n'), 1900)))
    .addSeparatorComponents(divider())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`file:lift:${ctx.userId}`).setLabel('Lever / clôturer').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`file:refresh:${ctx.userId}`).setLabel('Actualiser').setStyle(ButtonStyle.Secondary),
      ),
    )
    .addTextDisplayComponents(text(`-# ${theme.footer} • Mis à jour ${ts(Date.now(), 'R')}`));

  return { components: [container], flags: V2, allowedMentions: NO_PING };
}

function statusLabel(records) {
  const active = (k) => records.some((r) => r.active && r.kind === k);
  if (active('retire')) return 'Retiré du service';
  if (active('suspension')) return 'Suspendu';
  if (active('mise_a_pied')) return 'Mis à pied';
  if (active('avertissement')) return 'Sous avertissement';
  return 'Aucune mesure en cours';
}

/** Résumé court (consultation, /officier, dashboard). */
export function officerSummary(ctx) {
  const records = store.recordsOf(ctx.userId);
  const c = countKinds(records);
  const off = store.getOfficer(ctx.userId);
  return (
    `<@${ctx.userId}> — ${ctx.gradeId ? `<@&${ctx.gradeId}>` : 'grade non défini'}\n` +
    `${statusEmoji(records)} ${statusLabel(records)}\n` +
    `⚠️ ${c.avertissement.total} avertissement(s) (${c.avertissement.active} actif(s)) • ⛔ ${c.suspension.total + c.mise_a_pied.total + c.retire.total} sanction(s)\n` +
    `⬆️ ${c.promotion.total} promotion(s) • ⬇️ ${c.retrogradation.total} rétrogradation(s) • 🎖️ ${c.honneur.total} honneur(s) • 📋 ${c.compterendu.total} compte(s) rendu(s)` +
    (off?.threadId ? `\nDossier : <#${off.threadId}>` : '')
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fiche d'une action (fil du dossier, registre public, MP)
// ═══════════════════════════════════════════════════════════════════════════
function recordValues(r, ctx, { dm = false } = {}) {
  const values = [];
  if (!dm) {
    values.push({ label: 'Officier', value: `<@${r.userId}>` });
    if (ctx?.gradeName) values.push({ label: 'Grade', value: ctx.gradeName });
  }
  if (r.kind === 'promotion' || r.kind === 'retrogradation') {
    values.push({ label: 'Changement de grade', value: `${r.gradeFrom ? `<@&${r.gradeFrom}>` : 'Aucun grade'} ➜ <@&${r.gradeTo}>` });
  }
  if (r.kind === 'honneur') values.push({ label: 'Distinction', value: `${medalOf(r.medal)?.emoji ?? '🎖️'} ${r.medalLabel}` });
  if (r.kind === 'compterendu') {
    values.push({ label: 'Rendu par', value: `<@${r.userId}>` }, { label: 'Destinataire', value: `<@${r.destId}>` });
  }
  if (r.kind === 'demande_cr' && r.endsAt === undefined && r.dueAt) {
    values.push({ label: 'À remettre avant le', value: `${ts(r.dueAt, 'F')} (${ts(r.dueAt, 'R')})` });
  }
  if (r.durationMs) values.push({ label: 'Durée', value: formatDuration(r.durationMs) });
  if (r.endsAt) values.push({ label: 'Fin prévue', value: `${ts(r.endsAt, 'F')} (${ts(r.endsAt, 'R')})` });
  else if (['suspension', 'mise_a_pied'].includes(r.kind)) values.push({ label: 'Durée', value: 'Jusqu\'à levée par l\'IGGN' });
  values.push(...r.fields);
  return values.filter((v) => v.value);
}

function card({ heading, subheading, color, values, footer, rows = [] }) {
  const body = values.map((v) => `**__${v.label}__**\n${v.value}`).join('\n\n');
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(text(`### ${emojis.exc}**__ ${heading}__**\n-# ${subheading}`))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(clip(body || '—', 3200)))
    .addSeparatorComponents(divider());
  for (const row of rows) container.addActionRowComponents(row);
  container.addTextDisplayComponents(text(`-# ${footer}`));
  return { components: [container], flags: V2, allowedMentions: NO_PING };
}

/** Fiche publique / dossier. */
export function recordMessage(r, ctx) {
  const k = kinds[r.kind];
  return card({
    heading: `${k.emoji} ${k.label.toUpperCase()}`,
    subheading: `${r.id} • Dossier de <@${r.userId}>`,
    color: k.color,
    values: recordValues(r, ctx),
    footer: `${theme.footer} • Saisi par <@${r.byId}> • ${ts(r.createdAt, 'F')}`,
  });
}

/** Message privé envoyé à l'officier (avec accusé de réception pour les comptes rendus). */
export function dmMessage(r, { to, acked = false } = {}) {
  const k = kinds[r.kind];
  const intro = k.dmIntro + (r.kind === 'compterendu' ? `\nDe la part de <@${r.userId}>.` : '');
  const rows = [];
  if (r.kind === 'compterendu' && !acked) {
    rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cr:ack:${r.id}`).setLabel('Accuser réception').setStyle(ButtonStyle.Success)));
  }
  const message = card({
    heading: `${k.emoji} ${k.label.toUpperCase()}`,
    subheading: `${r.id} • ${theme.footer}`,
    color: k.color,
    values: [{ label: 'Information', value: intro }, ...recordValues(r, null, { dm: true })],
    footer: acked ? `✅ Réception accusée le ${ts(r.ackAt, 'F')}` : `Émis par <@${r.byId}> • ${ts(r.createdAt, 'F')}`,
    rows,
  });
  return message;
}

/** Notification de fin de sanction (expiration ou levée). */
export function endMessage(r, { reason, byId }) {
  const k = kinds[r.kind];
  return card({
    heading: `✅ FIN — ${k.label.toUpperCase()}`,
    subheading: `${r.id} • Dossier de <@${r.userId}>`,
    color: 0x27ae60,
    values: [
      { label: 'Mesure', value: `${k.emoji} ${k.label}` },
      { label: 'Fin', value: reason === 'expiration' ? 'Expiration de la durée prévue' : `Levée par <@${byId}>` },
      ...(r.endNote ? [{ label: 'Motif de la levée', value: r.endNote }] : []),
    ],
    footer: `${theme.footer} • ${ts(r.endedAt, 'F')}`,
  });
}

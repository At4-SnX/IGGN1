import {
  ActionRowBuilder, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
} from 'discord.js';
import { MAX_DURATION_DAYS, config, theme } from './config.js';
import { V2, buildNotice, text } from './ui.js';

/** Erreur dont le message est affiché tel quel à l'utilisateur. */
export class UserError extends Error {}

// ─── Texte / temps ─────────────────────────────────────────────────────────
export const truncate = (s, max) => (String(s).length > max ? `${String(s).slice(0, max - 1)}…` : String(s));
export const clip = truncate;
export const one = (v) => String(v ?? '').replace(/\s*\n\s*/g, ' ').trim();
export const ts = (ms, style = 'd') => `<t:${Math.floor(ms / 1000)}:${style}>`;

const UNITS = [
  [/^(semaines?|sem)/, 7 * 86_400_000],
  [/^(jours?|j|d)/, 86_400_000],
  [/^(heures?|h)/, 3_600_000],
  [/^(minutes?|min)/, 60_000],
];

/** "3j", "12h", "1 semaine", "1j12h", "90min" -> millisecondes (ou null si invalide). */
export function parseDuration(input) {
  let rest = String(input ?? '').toLowerCase().replace(',', '.').trim();
  if (!rest) return null;
  let total = 0;
  while (rest) {
    const m = rest.match(/^(\d+(?:\.\d+)?)\s*/);
    if (!m) return null;
    const n = Number(m[1]);
    rest = rest.slice(m[0].length);
    const unit = UNITS.find(([re]) => re.test(rest));
    if (!unit) return null;
    rest = rest.slice(rest.match(unit[0])[0].length).replace(/^[\s,]+(et\s+)?/, '');
    total += n * unit[1];
  }
  return total > 0 ? Math.round(total) : null;
}

/** Durée validée (1 min → MAX_DURATION_DAYS). */
export function requireDuration(input, label = 'La durée') {
  const ms = parseDuration(input);
  if (!ms) throw new UserError(`${label} est invalide. Exemples : \`3j\`, \`12h\`, \`1 semaine\`, \`1j12h\`.`);
  if (ms > MAX_DURATION_DAYS * 86_400_000) throw new UserError(`${label} ne peut pas dépasser ${MAX_DURATION_DAYS} jours.`);
  return ms;
}

export function formatDuration(ms) {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return [d && `${d} j`, h && `${h} h`, !d && m && `${m} min`].filter(Boolean).join(' ') || '< 1 min';
}

// ─── Formulaires ───────────────────────────────────────────────────────────
function textField(def, value) {
  const input = new TextInputBuilder()
    .setCustomId(def.id)
    .setLabel(def.label.slice(0, 45))
    .setStyle(def.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(def.required !== false);
  if (def.max) input.setMaxLength(def.max);
  if (def.placeholder) input.setPlaceholder(def.placeholder.slice(0, 100));
  if (value) input.setValue(String(value).slice(0, def.max ?? 4000));
  return new ActionRowBuilder().addComponents(input);
}

export const buildModal = (customId, title, defs, values = {}) =>
  new ModalBuilder().setCustomId(customId).setTitle(title.slice(0, 45)).addComponents(...defs.map((d) => textField(d, values[d.id])));

export const readValues = (interaction, defs) =>
  Object.fromEntries(defs.map((d) => [d.id, interaction.fields.getTextInputValue(d.id).trim()]));

export const toFieldList = (defs, values) => defs.map((d) => ({ id: d.id, label: d.label, value: values[d.id] ?? '' }));

// ─── Menus ─────────────────────────────────────────────────────────────────
export function stringSelectRow(customId, placeholder, list) {
  const options = list.map((o) => {
    const opt = { label: o.label.slice(0, 100), value: o.value ?? o.key };
    if (o.emoji) opt.emoji = { name: o.emoji };
    if (o.description) opt.description = o.description.slice(0, 100);
    return opt;
  });
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options));
}

export const userSelectRow = (customId, placeholder) =>
  new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1));

export const ephemeral = (content, row) => ({ content, components: [row], flags: MessageFlags.Ephemeral });

// ─── Permissions ───────────────────────────────────────────────────────────
const hasRole = (member, id) => (Array.isArray(member.roles) ? member.roles.includes(id) : member.roles.cache.has(id));
const isAdmin = (member) => member.permissions?.has?.(PermissionFlagsBits.Administrator) ?? false;

export const canUse = (member) => !!member && (isAdmin(member) || hasRole(member, config.roles.iggn));
export const canManage = (member) =>
  !!member && (isAdmin(member) || (config.roles.direction ? hasRole(member, config.roles.direction) : hasRole(member, config.roles.iggn)));
export const canRenderCR = (member) =>
  !!member && (canUse(member) || !config.roles.personnel || hasRole(member, config.roles.personnel));

/** Vérifie l'accès (IGGN ou direction) et répond « Accès refusé » si besoin. */
export async function guard(interaction, level = 'use') {
  const ok = level === 'manage' ? canManage(interaction.member) : canUse(interaction.member);
  if (!ok) {
    await interaction.reply(
      buildNotice('Accès refusé', level === 'manage' ? 'Cette action est réservée à la direction de l\'IGGN.' : 'Cette fonction est réservée aux membres de l\'IGGN.'),
    );
  }
  return ok;
}

// ─── Salons / fils ─────────────────────────────────────────────────────────
export async function fetchForum(guild, id) {
  const channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    throw new UserError(`Le forum ${id} est introuvable ou n'est pas un salon forum. Vérifiez la configuration.`);
  }
  return channel;
}

export async function getThread(client, id) {
  const thread = await client.channels.fetch(id).catch(() => null);
  if (!thread?.isThread()) throw new UserError('Le fil du dossier est introuvable (supprimé ?).');
  if (thread.archived) await thread.setArchived(false);
  return thread;
}

/** Renomme un fil sans bloquer si Discord limite le débit (2 renommages / 10 min). */
export async function safeRename(thread, name) {
  if (thread.name === name) return;
  await Promise.race([thread.setName(name).catch(() => null), new Promise((r) => setTimeout(r, 4000))]);
}

/** Exécute une action secondaire sans jamais faire échouer l'action principale. */
export async function safely(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${label}]`, err.message);
    return null;
  }
}

// ─── Journal d'audit ───────────────────────────────────────────────────────
export async function audit(client, message) {
  if (!config.logChannelId) return;
  await safely('AUDIT', async () => {
    const channel = await client.channels.fetch(config.logChannelId);
    const container = new ContainerBuilder().setAccentColor(theme.color).addTextDisplayComponents(text(`${message}\n-# ${theme.footer}`));
    await channel.send({ components: [container], flags: V2, allowedMentions: { parse: [] } });
  });
}

import { ChannelType } from 'discord.js';
import { RETIRE_REMOVES_GRADES, config, kinds, medailles } from './config.js';
import { scheduleDashboard } from './dashboard.js';
import { dmMessage, endMessage, officerFileMessage, recordMessage, statusEmoji } from './render.js';
import * as store from './store.js';
import {
  UserError, audit, fetchForum, getThread, requireDuration, safeRename, safely, toFieldList, truncate,
} from './utils.js';

const REASON = 'IGGN';

// ═══════════════════════════════════════════════════════════════════════════
//  Grades
// ═══════════════════════════════════════════════════════════════════════════
export const gradeIndex = (member) => {
  let idx = -1;
  config.gradeRoleIds.forEach((id, i) => {
    if (member.roles.cache.has(id)) idx = i;
  });
  return idx;
};

const roleName = (guild, id) => guild.roles.cache.get(id)?.name ?? null;

/** Options de la liste de grades : supérieurs (promotion) ou inférieurs (rétrogradation). */
export function gradeOptions(guild, member, direction) {
  if (!config.gradeRoleIds.length) throw new UserError('Aucun grade configuré : renseignez `GRADE_ROLE_IDS` (du plus bas au plus haut).');
  const cur = gradeIndex(member);
  const ids = config.gradeRoleIds
    .map((id, i) => ({ id, i }))
    .filter(({ i }) => (direction === 'up' ? i > cur : i < cur));
  const ordered = direction === 'up' ? ids : ids.reverse();
  const options = ordered.slice(0, 25).map(({ id }) => ({ value: id, label: roleName(guild, id) ?? id }));
  if (!options.length) {
    throw new UserError(direction === 'up' ? 'Cet officier possède déjà le grade le plus élevé.' : 'Cet officier n\'a aucun grade inférieur (ou aucun grade défini).');
  }
  return options;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Contexte d'un officier (nom, avatar, grade)
// ═══════════════════════════════════════════════════════════════════════════
export async function fileContext(client, guild, userId) {
  const member = await guild.members.fetch(userId).catch(() => null);
  const user = member?.user ?? (await client.users.fetch(userId).catch(() => null));
  const idx = member ? gradeIndex(member) : -1;
  const gradeId = idx >= 0 ? config.gradeRoleIds[idx] : null;
  return {
    userId,
    member,
    displayName: member?.displayName ?? user?.username ?? null,
    avatarUrl: (member ?? user)?.displayAvatarURL?.({ extension: 'png', size: 256 }) ?? null,
    gradeId,
    gradeName: gradeId ? roleName(guild, gradeId) : null,
  };
}

const threadName = (ctx) =>
  truncate(`${statusEmoji(store.recordsOf(ctx.userId))} ${ctx.displayName ?? ctx.userId}${ctx.gradeName ? ` • ${ctx.gradeName}` : ''}`, 100);

// ═══════════════════════════════════════════════════════════════════════════
//  Dossier personnel (un fil de forum par officier)
// ═══════════════════════════════════════════════════════════════════════════
export async function ensureOfficerFile(client, guild, ctx) {
  const existing = store.getOfficer(ctx.userId);
  if (existing?.threadId) {
    try {
      return await getThread(client, existing.threadId);
    } catch {
      /* fil supprimé : on le recrée */
    }
  }
  const forum = await fetchForum(guild, config.forums.dossiers);
  const thread = await forum.threads.create({
    name: threadName(ctx),
    autoArchiveDuration: 10080,
    message: officerFileMessage(ctx),
  });
  store.saveOfficer(ctx.userId, { threadId: thread.id, createdAt: Date.now() });
  return thread;
}

/** Met à jour la fiche (et le nom du fil) ; `post` = message à publier dans le fil. */
export async function refreshOfficerFile(client, guild, userId, { post } = {}) {
  const ctx = await fileContext(client, guild, userId);
  const thread = await ensureOfficerFile(client, guild, ctx);
  if (post) await thread.send(post(ctx));
  const starter = await thread.fetchStarterMessage();
  await starter.edit(officerFileMessage(ctx));
  await safeRename(thread, threadName(ctx));
  return { thread, ctx };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Rôles
// ═══════════════════════════════════════════════════════════════════════════
async function addRoles(member, ids) {
  const list = ids.filter(Boolean);
  if (!list.length) return;
  try {
    await member.roles.add(list, REASON);
  } catch {
    throw new UserError(`Impossible d'attribuer les rôles ${list.map((i) => `<@&${i}>`).join(', ')} : placez le rôle du bot **au-dessus** de ces rôles et donnez-lui « Gérer les rôles ».`);
  }
}
async function removeRoles(member, ids) {
  const list = ids.filter((id) => id && member.roles.cache.has(id));
  if (!list.length) return;
  try {
    await member.roles.remove(list, REASON);
  } catch {
    throw new UserError(`Impossible de retirer les rôles ${list.map((i) => `<@&${i}>`).join(', ')} : vérifiez la hiérarchie des rôles du bot.`);
  }
}

/** Le rôle d'une mesure est présent si et seulement si au moins une mesure du même type est active. */
export async function reconcileRole(guild, userId, kind) {
  const roleId = kinds[kind]?.role;
  if (!roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  const shouldHave = store.activeRecords(userId, kind).length > 0;
  if (shouldHave && !member.roles.cache.has(roleId)) await addRoles(member, [roleId]);
  if (!shouldHave && member.roles.cache.has(roleId)) await removeRoles(member, [roleId]);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Diffusion : registre public, message privé
// ═══════════════════════════════════════════════════════════════════════════
async function publishRegistre(guild, record, message, ctx) {
  const channelId = kinds[record.kind].registre;
  if (!channelId) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;
  if (channel.type === ChannelType.GuildForum) {
    await channel.threads.create({
      name: truncate(`${kinds[record.kind].emoji} ${kinds[record.kind].label} • ${ctx?.displayName ?? record.userId} • ${record.id}`, 100),
      message,
    });
  } else if (channel.isTextBased()) {
    await channel.send(message);
  }
  return true;
}

export async function sendDm(client, userId, message) {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return false;
  return (await safely('DM', () => user.send(message).then(() => true))) ?? false;
}

/**
 * Suite commune à toute action enregistrée : fiche + fil du dossier, registre, MP, audit, dashboard.
 * `notify` : [{ userId, message }] messages privés à envoyer.
 */
export async function finalizeRecord(client, guild, record, { notify = [] } = {}) {
  const { thread, ctx } = await refreshOfficerFile(client, guild, record.userId, { post: (c) => recordMessage(record, c) });
  await safely('REGISTRE', () => publishRegistre(guild, record, recordMessage(record, ctx), ctx));

  const dm = {};
  for (const n of notify) dm[n.userId] = await sendDm(client, n.userId, n.message);

  const k = kinds[record.kind];
  await audit(client, `${k.emoji} **${k.label}** \`${record.id}\` — <@${record.userId}> par <@${record.byId}> — <#${thread.id}>`);
  scheduleDashboard(client);
  return { thread, ctx, dm };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Action principale
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {object} p
 * @param {string} p.kind      clé de `kinds`
 * @param {string} p.targetId  officier concerné
 * @param {string} p.byId      auteur de l'action
 * @param {object} p.values    valeurs du formulaire { champ: texte }
 * @param {object} [p.extra]   { gradeId } pour promotion / rétrogradation, { medal } pour honneur
 */
export async function performAction(client, guild, { kind, targetId, byId, values, extra = {} }) {
  const def = kinds[kind];
  const member = await guild.members.fetch(targetId).catch(() => null);
  if (!member) throw new UserError('Cet officier n\'est plus présent sur le serveur.');
  if (member.user.bot) throw new UserError('Impossible de cibler un bot.');
  if (targetId === byId) throw new UserError('Vous ne pouvez pas vous appliquer cette action à vous-même.');

  // Validations avant tout effet de bord
  const now = Date.now();
  const record = {
    id: null, kind, userId: targetId, byId, createdAt: now,
    fields: toFieldList(def.fields, values),
    active: !!def.trackActive,
  };

  if (def.timed) {
    if (def.timed === 'required' || values.duree) {
      record.durationMs = requireDuration(values.duree);
      record.endsAt = now + record.durationMs;
    }
  }
  if (kind === 'demande_cr') {
    record.dueAt = now + requireDuration(values.delai, 'Le délai');
  }
  if (kind === 'honneur') {
    const medal = medailles.find((m) => m.value === extra.medal);
    if (!medal) throw new UserError('Distinction inconnue.');
    record.medal = medal.value;
    record.medalLabel = medal.label;
  }
  if (kind === 'promotion' || kind === 'retrogradation') {
    const cur = gradeIndex(member);
    const to = config.gradeRoleIds.indexOf(extra.gradeId);
    if (to < 0) throw new UserError('Grade inconnu.');
    if (kind === 'promotion' && to <= cur) throw new UserError('Le nouveau grade doit être **supérieur** au grade actuel.');
    if (kind === 'retrogradation' && to >= cur) throw new UserError('Le nouveau grade doit être **inférieur** au grade actuel.');
    record.gradeFrom = cur >= 0 ? config.gradeRoleIds[cur] : null;
    record.gradeTo = extra.gradeId;
  }

  // Le dossier doit être accessible avant de toucher aux rôles
  await ensureOfficerFile(client, guild, await fileContext(client, guild, targetId));

  // Effets sur les rôles
  if (def.role) await addRoles(member, [def.role]);
  if (kind === 'retire' && RETIRE_REMOVES_GRADES) {
    record.removedRoles = config.gradeRoleIds.filter((id) => member.roles.cache.has(id));
    await removeRoles(member, record.removedRoles);
  }
  if (kind === 'promotion' || kind === 'retrogradation') {
    await removeRoles(member, config.gradeRoleIds.filter((id) => id !== record.gradeTo));
    await addRoles(member, [record.gradeTo]);
  }

  record.id = store.nextId();
  store.saveRecord(record);

  const result = await finalizeRecord(client, guild, record, {
    notify: [{ userId: targetId, message: dmMessage(record) }],
  });
  return { record, ...result, dmOk: result.dm[targetId] };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Compte rendu (rendu par un militaire à un destinataire)
// ═══════════════════════════════════════════════════════════════════════════
export async function submitCompteRendu(client, guild, { authorId, destId, values }) {
  const def = kinds.compterendu;
  const record = {
    id: store.nextId(), kind: 'compterendu', userId: authorId, destId, byId: authorId, createdAt: Date.now(),
    fields: toFieldList(def.fields, values), active: false,
  };
  store.saveRecord(record);
  const result = await finalizeRecord(client, guild, record, {
    notify: [{ userId: destId, message: dmMessage(record) }],
  });
  return { record, ...result, dmOk: result.dm[destId] };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fin d'une mesure : expiration automatique ou levée manuelle
// ═══════════════════════════════════════════════════════════════════════════
export async function endRecord(client, guild, recordId, { reason, byId = null, note = '' }) {
  const found = store.getRecord(recordId);
  if (!found || !found.active) throw new UserError('Cette mesure n\'est plus active.');
  const record = structuredClone(found);
  record.active = false;
  record.endedAt = Date.now();
  record.endReason = reason;
  record.endedBy = byId;
  record.endNote = note || undefined;
  store.saveRecord(record);

  const def = kinds[record.kind];
  await safely('ROLE', () => reconcileRole(guild, record.userId, record.kind));

  // Retrait levé : restitution des grades retirés
  if (record.kind === 'retire' && record.removedRoles?.length) {
    const member = await guild.members.fetch(record.userId).catch(() => null);
    if (member) await safely('GRADES', () => addRoles(member, record.removedRoles));
  }

  const message = endMessage(record, { reason, byId });
  await safely('FICHE', () => refreshOfficerFile(client, guild, record.userId, { post: () => message }));
  if (def.role) await sendDm(client, record.userId, message);
  await audit(client, `✅ **Fin de ${def.label.toLowerCase()}** \`${record.id}\` — <@${record.userId}> (${reason === 'expiration' ? 'expiration' : `levée par <@${byId}>`})`);
  scheduleDashboard(client);
  return record;
}

/** Vérifie les mesures arrivées à échéance (appelé toutes les minutes). */
export async function expireDue(client) {
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) return;
  for (const r of store.expiredRecords(Date.now())) {
    await safely('EXPIRATION', () => endRecord(client, guild, r.id, { reason: 'expiration' }));
  }
}

export function startScheduler(client) {
  expireDue(client);
  setInterval(() => expireDue(client), 60_000);
}

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

// ─── Variables obligatoires ────────────────────────────────────────────────
const required = ['DISCORD_TOKEN', 'GUILD_ID', 'ROLE_IGGN_ID', 'FORUM_DOSSIERS_ID'];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`[CONFIG] Variables manquantes : ${missing.join(', ')}`);
  process.exit(1);
}
const list = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const opt = (k) => env[k] || null;

export const config = {
  token: env.DISCORD_TOKEN,
  guildId: env.GUILD_ID,
  dataDir: path.resolve(root, env.DATA_DIR || './data'),
  logChannelId: opt('LOG_CHANNEL_ID'),
  membersIntent: env.ENABLE_MEMBERS_INTENT === 'true',
  roles: {
    iggn: env.ROLE_IGGN_ID,
    direction: opt('ROLE_DIRECTION_ID'),
    personnel: opt('ROLE_PERSONNEL_ID'),
    avertissement: opt('ROLE_AVERTISSEMENT_ID'),
    suspendu: opt('ROLE_SUSPENDU_ID'),
    miseAPied: opt('ROLE_MISE_A_PIED_ID'),
    retire: opt('ROLE_RETIRE_ID'),
  },
  gradeRoleIds: list(env.GRADE_ROLE_IDS), // du plus bas au plus haut
  forums: { dossiers: env.FORUM_DOSSIERS_ID },
  registres: {
    avertissement: opt('CHANNEL_AVERTISSEMENTS_ID'),
    sanction: opt('CHANNEL_SANCTIONS_ID'),
    promotion: opt('CHANNEL_PROMOTIONS_ID'),
    retrogradation: opt('CHANNEL_RETROGRADATIONS_ID'),
    honneur: opt('CHANNEL_HONNEURS_ID'),
    compterendu: opt('CHANNEL_COMPTES_RENDUS_ID'),
  },
};

// ─── Thème ─────────────────────────────────────────────────────────────────
export const theme = { color: 0x1f3a93, footer: 'Gendarmerie Nationale • IGGN' };

export const stream = {
  name: 'Gendarmerie Nationale',
  url: env.STREAM_URL || 'https://www.twitch.tv/gendarmerienationale',
};

const asset = (name) => ({ file: path.join(root, 'assets', `${name}.png`), name: `${name}.png` });
export const assets = Object.fromEntries(
  ['iggn', 'dashboard', 'avertissement', 'sanction', 'promotion', 'retrogradation', 'honneur', 'compterendu'].map((k) => [k, asset(k)]),
);

// Emojis personnalisés (le bot doit être sur le serveur qui les héberge).
export const emojis = {
  exc: '<:exc:1541213944364924999>',
  fleche: '<:fleche:1541035911976853535>',
  engrenage: '<:engrenage:1541036952462032916>',
};
const { fleche, engrenage } = emojis;

// Durée maximale d'une suspension / mise à pied
export const MAX_DURATION_DAYS = 365;
// Un retrait du service retire aussi tous les rôles de grade (restaurés à la levée)
export const RETIRE_REMOVES_GRADES = true;

// ─── Outil de déclaration des champs de formulaire ─────────────────────────
// f(id, label, { max, long, required, placeholder }) — label : 45 caractères max (limite Discord)
const f = (id, label, opts = {}) => ({ id, label, ...opts });

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES D'ACTIONS
//  role      : rôle attribué tant que l'action est active
//  timed     : 'required' | 'optional' (durée) — expire automatiquement
//  trackActive : l'action reste « active » jusqu'à levée / expiration
//  restricted : réservé à la direction (ROLE_DIRECTION_ID si défini)
//  registre  : salon ou forum public où l'action est annoncée
// ═══════════════════════════════════════════════════════════════════════════
export const kinds = {
  avertissement: {
    label: 'Avertissement', emoji: '⚠️', color: 0xf1c40f, group: 'avertissement',
    role: config.roles.avertissement, trackActive: true, registre: config.registres.avertissement,
    dmIntro: 'Vous avez reçu un **__avertissement__** de l\'Inspection Générale de la Gendarmerie Nationale.',
    fields: [
      f('motif', 'Motif de l\'avertissement', { max: 200 }),
      f('date', 'Date et lieu des faits', { max: 150 }),
      f('faits', 'Description des faits', { max: 1000, long: true }),
      f('preuves', 'Preuves / références', { max: 500, long: true, required: false }),
      f('mesure', 'Mesure corrective demandée', { max: 200, required: false }),
    ],
  },
  suspension: {
    label: 'Suspension', emoji: '⏸️', color: 0xe67e22, group: 'sanction',
    role: config.roles.suspendu, timed: 'required', trackActive: true, registre: config.registres.sanction,
    dmIntro: 'Vous faites l\'objet d\'une **__suspension__** prononcée par l\'IGGN.',
    fields: [
      f('motif', 'Motif de la suspension', { max: 200 }),
      f('duree', 'Durée (ex : 3j, 12h, 1 semaine)', { max: 40 }),
      f('faits', 'Description des faits', { max: 1000, long: true }),
      f('preuves', 'Preuves / références', { max: 500, long: true, required: false }),
      f('conditions', 'Conditions de reprise de service', { max: 200, required: false }),
    ],
  },
  mise_a_pied: {
    label: 'Mise à pied', emoji: '🚫', color: 0xd35400, group: 'sanction',
    role: config.roles.miseAPied, timed: 'optional', trackActive: true, registre: config.registres.sanction,
    dmIntro: 'Vous faites l\'objet d\'une **__mise à pied__** prononcée par l\'IGGN.',
    fields: [
      f('motif', 'Motif de la mise à pied', { max: 200 }),
      f('duree', 'Durée (vide = jusqu\'à levée)', { max: 40, required: false, placeholder: 'Ex : 7j' }),
      f('faits', 'Description des faits', { max: 1000, long: true }),
      f('preuves', 'Preuves / références', { max: 500, long: true, required: false }),
      f('conditions', 'Conditions de reprise de service', { max: 200, required: false }),
    ],
  },
  retire: {
    label: 'Retrait du service', emoji: '⛔', color: 0xc0392b, group: 'sanction', restricted: true,
    role: config.roles.retire, trackActive: true, registre: config.registres.sanction,
    dmIntro: 'Vous êtes **__retiré du service__** de la Gendarmerie Nationale par décision de l\'IGGN.',
    fields: [
      f('motif', 'Motif du retrait', { max: 200 }),
      f('faits', 'Description des faits', { max: 1000, long: true }),
      f('decision', 'Autorité décisionnaire', { max: 100 }),
      f('preuves', 'Preuves / références', { max: 500, long: true, required: false }),
      f('retour', 'Conditions d\'un éventuel retour', { max: 200, required: false }),
    ],
  },
  promotion: {
    label: 'Promotion', emoji: '⬆️', color: 0x27ae60, group: 'grade', registre: config.registres.promotion,
    dmIntro: 'Félicitations ! Vous êtes **__promu__** au sein de la Gendarmerie Nationale.',
    fields: [
      f('motif', 'Motif de la promotion', { max: 200 }),
      f('merites', 'Services et mérites', { max: 1000, long: true }),
      f('date', 'Date d\'effet', { max: 60, required: false }),
      f('observations', 'Observations', { max: 500, long: true, required: false }),
    ],
  },
  retrogradation: {
    label: 'Rétrogradation', emoji: '⬇️', color: 0xc0392b, group: 'grade', restricted: true, registre: config.registres.retrogradation,
    dmIntro: 'Vous faites l\'objet d\'une **__rétrogradation__** prononcée par l\'IGGN.',
    fields: [
      f('motif', 'Motif de la rétrogradation', { max: 200 }),
      f('faits', 'Description des faits', { max: 1000, long: true }),
      f('date', 'Date d\'effet', { max: 60, required: false }),
      f('observations', 'Observations', { max: 500, long: true, required: false }),
    ],
  },
  honneur: {
    label: 'Honneur', emoji: '🎖️', color: 0xf1c40f, group: 'honneur', registre: config.registres.honneur,
    dmIntro: 'Une **__distinction__** vous est décernée pour vos services. Bravo !',
    fields: [
      f('citation', 'Citation / motif de la distinction', { max: 1000, long: true }),
      f('date', 'Date des faits', { max: 100, required: false }),
      f('observations', 'Observations', { max: 500, long: true, required: false }),
    ],
  },
  compterendu: {
    label: 'Compte rendu', emoji: '📋', color: 0x1f3a93, group: 'compterendu', registre: config.registres.compterendu,
    dmIntro: 'Un **__compte rendu__** vous a été adressé.',
    fields: [
      f('objet', 'Objet du compte rendu', { max: 150 }),
      f('datelieu', 'Date et lieu', { max: 150 }),
      f('faits', 'Exposé des faits', { max: 1500, long: true }),
      f('mesures', 'Mesures prises', { max: 800, long: true, required: false }),
      f('suites', 'Suites / observations', { max: 600, long: true, required: false }),
    ],
  },
  demande_cr: {
    label: 'Demande de compte rendu', emoji: '📨', color: 0x1f3a93, group: 'compterendu', trackActive: true, registre: config.registres.compterendu,
    dmIntro: 'L\'IGGN vous demande de **__rendre un compte rendu__**.',
    fields: [
      f('sujet', 'Sujet du compte rendu', { max: 150 }),
      f('delai', 'Délai de remise (ex : 48h, 3j)', { max: 40 }),
      f('consignes', 'Consignes / éléments attendus', { max: 800, long: true, required: false }),
    ],
  },
};

// Sanctions proposées dans le menu « Prononcer une sanction »
export const sanctionKinds = ['suspension', 'mise_a_pied', 'retire'];

// Distinctions (liste modifiable à volonté, 25 max)
export const medailles = [
  { value: 'felicitations', label: 'Félicitations du commandement', emoji: '📜' },
  { value: 'citation', label: 'Citation à l\'ordre de la brigade', emoji: '📜' },
  { value: 'mgn', label: 'Médaille de la Gendarmerie nationale', emoji: '🎖️' },
  { value: 'honneur_bronze', label: 'Médaille d\'honneur — Bronze', emoji: '🥉' },
  { value: 'honneur_argent', label: 'Médaille d\'honneur — Argent', emoji: '🥈' },
  { value: 'honneur_or', label: 'Médaille d\'honneur — Or', emoji: '🥇' },
  { value: 'courage', label: 'Médaille pour acte de courage et de dévouement', emoji: '🛡️' },
  { value: 'blesses', label: 'Médaille des blessés', emoji: '🩹' },
  { value: 'merite', label: 'Ordre national du Mérite', emoji: '⭐' },
  { value: 'legion', label: 'Légion d\'honneur', emoji: '🏅' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  PANNEAUX (une bannière par panneau)
// ═══════════════════════════════════════════════════════════════════════════
export const panels = {
  iggn: {
    title: ' INSPECTION GÉNÉRALE DE LA GENDARMERIE NATIONALE',
    description:
      `> ${fleche} L'**__IGGN__** veille à la **__discipline__**, à la **__déontologie__** et à la **__bonne tenue__** des militaires de la Gendarmerie Nationale.\n\n` +
      `${engrenage} Consultez le **__dossier personnel__** d'un officier (grade, avertissements, sanctions, promotions, honneurs) ou le vôtre.\n\n` +
      `> ${fleche} Accès **__réservé__** aux membres de l'IGGN. Toute action est **__tracée__**.`,
    buttons: [
      { id: 'file:consult', label: 'Consulter un dossier' },
      { id: 'file:me', label: 'Mon dossier', secondary: true },
    ],
  },
  avertissement: {
    title: ' AVERTISSEMENT',
    description:
      `> ${fleche} Un **__avertissement__** sanctionne un **__manquement léger__** ou un comportement répréhensible.\n\n` +
      `${engrenage} Sélectionnez l'officier concerné et renseignez le motif : il est **__notifié en message privé__**, le rôle d'avertissement lui est attribué et l'avertissement est inscrit à son **__dossier personnel__**.`,
    buttons: [{ id: 'act:start:avertissement', label: 'Mettre un avertissement' }],
  },
  sanction: {
    title: ' SANCTION',
    description:
      `> ${fleche} Trois sanctions sont possibles : la **__suspension__** (avec durée), la **__mise à pied__** et le **__retrait du service__**.\n\n` +
      `${engrenage} Les rôles sont **__attribués puis retirés automatiquement__** à l'expiration de la durée. Le **__retrait du service__** est réservé à la direction.`,
    buttons: [{ id: 'act:start:sanction', label: 'Prononcer une sanction' }],
  },
  promotion: {
    title: ' PROMOTION',
    description:
      `> ${fleche} Récompensez les **__services rendus__** en promouvant un officier au **__grade supérieur__**.\n\n` +
      `${engrenage} Le bot lit le **__grade actuel__** de l'officier, propose les grades supérieurs, **__met à jour ses rôles__** et publie la promotion.`,
    buttons: [{ id: 'act:start:promotion', label: 'Promouvoir un officier' }],
  },
  retrogradation: {
    title: ' RÉTROGRADATION',
    description:
      `> ${fleche} La **__rétrogradation__** abaisse le grade d'un officier à la suite d'un **__manquement grave__**.\n\n` +
      `${engrenage} Le bot lit le **__grade actuel__**, propose les grades inférieurs et **__met à jour les rôles__**. Action **__réservée à la direction__**.`,
    buttons: [{ id: 'act:start:retrogradation', label: 'Rétrograder un officier' }],
  },
  honneur: {
    title: ' HONNEUR',
    description:
      `> ${fleche} Distinguez un militaire pour son **__courage__**, son **__dévouement__** ou ses **__états de service__**.\n\n` +
      `${engrenage} Choisissez la **__médaille__** ou la distinction : elle est inscrite au dossier de l'officier, annoncée et notifiée en message privé.`,
    buttons: [{ id: 'act:start:honneur', label: 'Décerner un honneur' }],
  },
  compterendu: {
    title: ' COMPTE RENDU',
    description:
      `> ${fleche} Rendez compte d'une **__intervention__**, d'un **__incident__** ou d'une **__situation__** à l'officier de votre choix.\n\n` +
      `${engrenage} Le compte rendu est **__envoyé en message privé__** à l'officier sélectionné (avec accusé de réception) et **__archivé__** dans votre dossier.\n` +
      `${engrenage} L'IGGN peut aussi **__exiger un compte rendu__** avec un délai de remise.`,
    buttons: [
      { id: 'cr:new', label: 'Rendre un compte rendu' },
      { id: 'act:start:demande_cr', label: 'Demander un compte rendu', secondary: true },
    ],
  },
};

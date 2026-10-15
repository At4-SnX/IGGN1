# Bot IGGN — Discipline, carrière et comptes rendus

Bot Discord.js v14 en **Components V2**, statut **en stream « Gendarmerie Nationale »**.
Chaque panneau a sa bannière ; chaque officier a un **dossier personnel** (un fil de forum) ; un **tableau de bord** résume tout.

## Actions (panneaux réservés au rôle IGGN)
| Panneau | Effet |
|---|---|
| **Avertissement** | Rôle d'avertissement attribué, MP à l'officier, inscription au dossier. Le rôle reste tant qu'au moins un avertissement est actif. |
| **Sanction** | **Suspension** (durée obligatoire : `3j`, `12h`, `1 semaine`, `1j12h`…), **mise à pied** (durée facultative), **retrait du service** (direction). Les rôles sont retirés **automatiquement** à l'expiration. |
| **Promotion** | Lit le grade actuel, propose les grades supérieurs, met à jour les rôles. |
| **Rétrogradation** | Idem avec les grades inférieurs (direction). |
| **Honneur** | Choix d'une médaille / distinction (liste modifiable), annonce + MP. |
| **Compte rendu** | « Rendre un compte rendu » : choix du destinataire → formulaire → **MP au destinataire** (avec bouton d'accusé de réception) + archivage. « Demander un compte rendu » (IGGN) : MP avec délai de remise. |
| **IGGN** | Consulter le dossier d'un officier, ou « Mon dossier » (tout le monde). |

Chaque action : fiche dans le **dossier de l'officier**, annonce dans le **registre** (salon ou forum, au choix), MP à l'officier, journal d'audit, mise à jour du dashboard.

## Dossier personnel
Grade actuel (lu sur les rôles de grade), statut (🟢 🟠 🔴 ⚫), compteurs, sanctions en cours, distinctions, dernières actions. Boutons **Lever / clôturer** (direction) et **Actualiser**.
Lever une sanction retire le rôle ; lever un **retrait** restitue les grades retirés.

## Tableau de bord
Avertissements (actifs), sanctions (en cours), promotions, rétrogradations, honneurs, comptes rendus, demandes en attente, activité sur 30 jours, sanctions en cours avec échéance, dernières actions, et un menu pour consulter un officier. Mis à jour automatiquement.
Effectifs par grade : activez `ENABLE_MEMBERS_INTENT=true` **et** « Server Members Intent » dans le Developer Portal.

## Installation
1. `npm install`, copier `.env.example` en `.env` (ou variables Railway), `npm start`.
2. Dans le salon IGGN : `/setup` (panneaux staff). Dans le salon des comptes rendus : `/setup panneau:Compte rendu`. Dans le salon du dashboard : `/setup panneau:Tableau de bord`.
3. Commande `/officier @membre` pour une consultation rapide.

## Rôles et permissions du bot
« Gérer les rôles » + rôle du bot **au-dessus** des rôles de grade et de sanction. Voir les salons / forums, créer des posts, écrire dedans, gérer les fils.
Les MP ne sont pas garantis (si l'officier les a fermés, le bot l'indique).

## Railway
- **Volume** : montez-en un (ex. `/data`) et mettez `DATA_DIR=/data`, sinon l'historique et les sanctions en cours sont perdus à chaque déploiement.
- `STREAM_URL` : lien Twitch ou YouTube.

## Personnalisation
Tout est dans `src/config.js` : types d'actions, champs de formulaire (5 max, libellés 45 caractères max), médailles, textes des panneaux, durée maximale, retrait des grades lors d'un retrait.

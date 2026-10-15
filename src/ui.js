import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorBuilder,
  SeparatorSpacingSize, TextDisplayBuilder,
} from 'discord.js';
import { assets, emojis, panels, theme } from './config.js';

export const V2 = MessageFlags.IsComponentsV2;
export const V2_EPHEMERAL = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export const text = (content) => new TextDisplayBuilder().setContent(content);
export const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

export const banner = (key) =>
  new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${assets[key].name}`));
export const bannerFile = (key) => new AttachmentBuilder(assets[key].file, { name: assets[key].name });

/** Panneau interactif : bannière + titre + description + boutons. */
export function buildPanel(key) {
  const panel = panels[key];
  const row = new ActionRowBuilder().addComponents(
    ...panel.buttons.map((b) =>
      new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(b.secondary ? ButtonStyle.Secondary : ButtonStyle.Primary),
    ),
  );

  const container = new ContainerBuilder()
    .setAccentColor(theme.color)
    .addMediaGalleryComponents(banner(key))
    .addTextDisplayComponents(text(`### ${emojis.exc}**__${panel.title}__**\n${panel.description}`))
    .addSeparatorComponents(divider())
    .addActionRowComponents(row);

  return { components: [container], files: [bannerFile(key)], flags: V2 };
}

/** Message simple éphémère (réponses). */
export function buildNotice(title, message) {
  const container = new ContainerBuilder()
    .setAccentColor(theme.color)
    .addTextDisplayComponents(text(`### ${title}\n${message}`));
  return { components: [container], flags: V2_EPHEMERAL };
}

/** Adapte un message pour editReply (pas de flag éphémère, V2 conservé). */
export const asEdit = (payload) => ({ components: payload.components, flags: V2 });

import type { ComponentProps } from "react";
import ProposalEditorialLayout from "@/lib/proposal-editorial-layout";
import proposalStyles from "@/lib/proposal-editorial-document.module.css";

type Props = ComponentProps<typeof ProposalEditorialLayout>;

/**
 * Owner art direction 2026-09-07 — SANCI Soft Gallery Editorial.
 *
 * Most catalogue assets are opaque JPGs baked on white. Do not fake removal
 * with blend modes or filters because that changes furniture/fabric colour.
 * Instead the document meets the source material where it is:
 * - interior paper is nearly white, so baked-white photo edges disappear;
 * - story/gallery photos have no card border, radius or shadow;
 * - the cover and its photo field share the same white as catalogue assets;
 * - square, portrait and landscape assets fit without a forced landscape stage;
 * - selection thumbnails stay functional and neutral.
 *
 * This is deliberately a visual-only layer over ProposalEditorialLayout.
 * Pricing, hand-off data, pagination, product order and print logic remain in
 * the existing renderer/layout.
 */
const softGalleryCss = `
.${proposalStyles.wrap} {
  --paper: #faf9f7;
  --ivory: #ffffff;
  --stone: #f0ede8;
  --desk: #ebe8e2;
  --line: #dfdbd4;
  --warm: #625e58;
  --muted: #817c75;
  --label: #e6ddd1;
  --labelBorder: #d8ccbd;
  --labelInk: #4a443d;
}

/* V6 cover: a fixed editorial scene carries the brand; product photos remain
   in the selection and story pages where their data identity belongs. */
.${proposalStyles.coverSheet} {
  background: #f7f4ee;
}

.${proposalStyles.coverLayout} {
  min-height: calc(var(--ph) - 30mm);
  height: calc(var(--ph) - 30mm);
  grid-template-columns: 78mm 72mm;
  grid-template-rows: 1fr;
  justify-content: space-between;
  gap: 0;
}

.${proposalStyles.coverLeft} {
  display: block;
  grid-column: auto;
  grid-row: auto;
  padding-top: 0;
}

.${proposalStyles.coverArt} {
  grid-column: auto;
  grid-row: auto;
}

.${proposalStyles.coverBrand} {
  position: relative;
}

.${proposalStyles.coverBrand} .${proposalStyles.eyebrow} {
  display: none;
}

.${proposalStyles.coverBrand}::after {
  content: "CUSTOM FURNITURE";
  display: block;
  margin-top: 65mm;
  color: var(--muted);
  font: 8.5px/1.2 var(--sans);
  font-weight: 500;
  letter-spacing: .2em;
}

.${proposalStyles.coverRule} {
  display: none;
}

.${proposalStyles.coverCore} {
  margin-top: 8px;
  padding: 0;
}

.${proposalStyles.coverTitle} {
  font-size: 0;
  line-height: 1;
  white-space: normal;
}

.${proposalStyles.coverTitle}::after {
  content: "PROPOSAL";
  display: block;
  color: var(--ink);
  font: 500 49px/.9 var(--serif);
  letter-spacing: -.045em;
}

.${proposalStyles.coverSub} {
  max-width: 62mm;
  margin-top: 13px;
  font-size: 0;
  line-height: 1;
}

.${proposalStyles.coverSub}::after {
  content: "Pilihan furnitur yang disusun khusus untuk ruang Anda.";
  display: block;
  color: var(--warm);
  font: 16px/1.4 var(--serif);
}

.${proposalStyles.coverMeta} {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-top: 0;
  padding: 0 0 1mm;
  border: 0;
}

.${proposalStyles.coverMeta} > div:first-child {
  order: 1;
}

.${proposalStyles.coverMetaGrid} {
  display: contents;
}

.${proposalStyles.coverMetaGrid} > div:first-child {
  order: 2;
}

.${proposalStyles.coverMetaGrid} > div:nth-child(2) {
  order: 3;
}

.${proposalStyles.coverStore} {
  order: 4;
  margin-top: 5mm;
  padding-top: 5mm;
  border-top: 1px solid var(--line);
}

.${proposalStyles.coverMetaGrid} > div:nth-child(3) {
  order: 5;
}

.${proposalStyles.coverMeta}:has(.${proposalStyles.coverStore}) .${proposalStyles.coverMetaGrid} > div:nth-child(n + 2) {
  display: none !important;
}

.${proposalStyles.coverMeta} p,
.${proposalStyles.coverStore} p {
  overflow-wrap: anywhere;
}

.${proposalStyles.coverName} {
  margin: 4px 0 0;
  font-size: 19px;
  line-height: 1.12;
}

.${proposalStyles.coverMetaGrid} > div,
.${proposalStyles.coverStore} {
  margin-top: 4.5mm;
}

.${proposalStyles.coverMetaGrid} > div:first-child {
  margin-top: 4.5mm;
}

.${proposalStyles.metaLabel} {
  display: block;
  width: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--muted);
  font-size: 8.5px;
  font-weight: 500;
  letter-spacing: .2em;
}

/* Cover copy is intentionally editorial but maps to the renderer's existing
   customer, saved-date, partner/branch and contact fields. */
.${proposalStyles.coverMeta} > div:first-child .${proposalStyles.metaLabel},
.${proposalStyles.coverMetaGrid} > div:first-child .${proposalStyles.metaLabel},
.${proposalStyles.coverMetaGrid} > div:nth-child(2) .${proposalStyles.metaLabel},
.${proposalStyles.coverMetaGrid} > div:nth-child(3) .${proposalStyles.metaLabel},
.${proposalStyles.coverStore} .${proposalStyles.metaLabel} {
  font-size: 0;
}

.${proposalStyles.coverMeta} > div:first-child .${proposalStyles.metaLabel}::after,
.${proposalStyles.coverMetaGrid} > div:first-child .${proposalStyles.metaLabel}::after,
.${proposalStyles.coverMetaGrid} > div:nth-child(2) .${proposalStyles.metaLabel}::after,
.${proposalStyles.coverMetaGrid} > div:nth-child(3) .${proposalStyles.metaLabel}::after,
.${proposalStyles.coverStore} .${proposalStyles.metaLabel}::after {
  display: block;
  color: var(--muted);
  font: 500 8.5px/1.2 var(--sans);
  letter-spacing: .2em;
}

.${proposalStyles.coverMeta} > div:first-child .${proposalStyles.metaLabel}::after { content: "CUSTOMER / PROJECT"; }
.${proposalStyles.coverMetaGrid} > div:first-child .${proposalStyles.metaLabel}::after { content: "SAVED DATE"; }
.${proposalStyles.coverMetaGrid} > div:nth-child(2) .${proposalStyles.metaLabel}::after,
.${proposalStyles.coverStore} .${proposalStyles.metaLabel}::after { content: "SHOWROOM / PARTNER"; }
.${proposalStyles.coverMetaGrid} > div:nth-child(3) .${proposalStyles.metaLabel}::after { content: "WHATSAPP / PHONE"; }

.${proposalStyles.metaValue} {
  margin-top: 3px;
  font-size: 10px;
  line-height: 1.45;
}

.${proposalStyles.coverStoreName} {
  margin-top: 4px;
  font-size: 15px;
  line-height: 1.15;
}

.${proposalStyles.coverStoreLogo},
.${proposalStyles.coverThanks} {
  display: none;
}

.${proposalStyles.coverArt} {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: #eee;
  border: 0;
}

.${proposalStyles.coverImage} {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #eee;
  padding: 0;
  overflow: hidden;
}

.${proposalStyles.coverImage} img {
  position: absolute;
  width: auto;
  height: 1342px;
  max-width: none;
  max-height: none;
  left: -1107px;
  top: -227px;
  object-fit: initial;
}

.${proposalStyles.coverArtCaption} {
  display: none;
}

/* Selection stays commercial and easy to scan, without thumbnail cards. */
.${proposalStyles.selectionPhoto} {
  background: #ffffff;
  border: 0;
  box-shadow: none;
  padding: 1mm;
}

/* Main editorial principle: no visible photo card around white catalogue JPGs. */
.${proposalStyles.storyPhoto},
.${proposalStyles.storyPhotoSecondary},
.${proposalStyles.galleryItem} {
  background: #ffffff;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

/* Keep the white mount extremely quiet against the #faf9f7 paper. */
.${proposalStyles.storyPhoto},
.${proposalStyles.storyPhotoSecondary} {
  outline: 0;
}

.${proposalStyles.storyPageHead},
.${proposalStyles.galleryHead} {
  border-color: var(--line);
}

.${proposalStyles.galleryGrid} {
  gap: 8mm;
}

.${proposalStyles.galleryItem} {
  padding: 4mm;
}

/* Hairlines, not boxes, create the museum-catalogue rhythm. */
.${proposalStyles.storySpecs} > div,
.${proposalStyles.selectionList},
.${proposalStyles.selectionRow},
.${proposalStyles.story_duo},
.${proposalStyles.story_lead},
.${proposalStyles.story_compact} {
  border-color: var(--line);
}

/* Screen sheets stack the fixed cover art after the metadata below 1100px.
   Print retains the A4 editorial columns above. */
@media screen and (max-width: 1100px) {
  .${proposalStyles.coverLayout} {
    grid-template-columns: 1fr;
    height: auto;
    gap: 9mm;
  }

  .${proposalStyles.coverBrand}::after {
    margin-top: 28px;
  }

  .${proposalStyles.coverArt} {
    min-height: 520px;
  }

  .${proposalStyles.coverImage} {
    position: absolute;
    aspect-ratio: auto;
  }
}

@media screen and (max-width: 720px) {
  .${proposalStyles.coverMetaGrid} > div,
  .${proposalStyles.coverStore} {
    margin-top: 18px;
  }

  .${proposalStyles.coverImage} img {
    left: -1107px;
    top: -227px;
    width: auto;
    height: 1342px;
  }
}
`;

export default function ProposalSoftGalleryLayout(props: Props) {
  return (
    <>
      <ProposalEditorialLayout {...props} />
      <style>{softGalleryCss}</style>
    </>
  );
}

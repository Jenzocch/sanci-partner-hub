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

/* Match opaque white catalogue assets across the entire cover. */
.${proposalStyles.coverSheet} {
  background: #ffffff;
}

/*
 * The source may include its own white margins and printed product name.
 * A matching white field removes the pasted-card edge without modifying the
 * asset, cropping furniture or changing fabric colours with blend modes.
 */
.${proposalStyles.coverArt} {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: #ffffff;
  border: 0;
}

.${proposalStyles.coverImage} {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  background: #ffffff;
  padding: 0;
}

.${proposalStyles.coverImage} img {
  /* Intrinsic image dimensions must not enlarge the A4 grid track. */
  position: absolute;
  inset: 6mm;
  width: calc(100% - 12mm);
  height: calc(100% - 12mm);
  object-fit: contain;
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

/* Screen sheets have natural height below 1100px; reserve a square photo
   area there. Print continues to use the remaining A4 space. */
@media screen and (max-width: 1100px) {
  .${proposalStyles.coverImage} {
    flex: none;
    aspect-ratio: 1;
  }
}

@media screen and (max-width: 720px) {
  .${proposalStyles.coverImage} img {
    inset: 10px;
    width: calc(100% - 20px);
    height: calc(100% - 20px);
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

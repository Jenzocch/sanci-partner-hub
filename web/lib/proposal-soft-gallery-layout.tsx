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
 * - the cover stays warmer, while the hero photo area returns to near-white;
 * - quiet architectural geometry lives around the hero rather than tinting it;
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

/* The cover keeps a warmer campaign tone; interior sheets remain near-white. */
.${proposalStyles.coverSheet} {
  background: #f4f0e9;
}

/*
 * White-background catalogue images should read as objects, not pasted cards.
 * The hero field is almost white. Decorative geometry stays in the margins so
 * opaque white JPG pixels never need colour-altering blend modes.
 */
.${proposalStyles.coverArt} {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  justify-content: center;
  background:
    radial-gradient(circle at 91% 26%, rgba(214, 201, 183, 0.34) 0 12%, transparent 12.4%),
    linear-gradient(90deg, transparent 0 88%, rgba(229, 221, 210, 0.58) 88% 100%),
    #faf9f7;
  border: 0;
}

.${proposalStyles.coverArt}::before {
  content: "";
  position: absolute;
  z-index: 0;
  right: -18mm;
  bottom: 13mm;
  width: 78mm;
  height: 78mm;
  border: 1px solid rgba(169, 154, 135, 0.28);
  border-radius: 50%;
  pointer-events: none;
}

.${proposalStyles.coverArt}::after {
  content: "";
  position: absolute;
  z-index: 0;
  right: 14mm;
  top: 14mm;
  width: 28mm;
  height: 1px;
  background: rgba(145, 132, 116, 0.34);
  pointer-events: none;
}

.${proposalStyles.coverImage} {
  position: relative;
  z-index: 1;
  flex: none;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: transparent;
  padding: 7mm 8mm 6mm;
}

.${proposalStyles.coverImage} img {
  /* The mount already provides the visual breathing room. Shrinking the img
     again makes white-background catalogue photos look detached and small. */
  width: 100%;
  height: 100%;
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

@media screen and (max-width: 720px) {
  .${proposalStyles.coverArt} {
    min-height: auto;
    background:
      radial-gradient(circle at 94% 20%, rgba(214, 201, 183, 0.28) 0 11%, transparent 11.5%),
      #faf9f7;
  }

  .${proposalStyles.coverImage} {
    padding: 18px 14px;
  }

  .${proposalStyles.coverImage} img {
    width: 100%;
    height: 100%;
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

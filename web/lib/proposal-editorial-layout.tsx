import type { ComponentProps } from "react";
import ProposalEditorialDocument from "@/lib/proposal-editorial-document";
import proposalStyles from "@/lib/proposal-editorial-document.module.css";

type Props = ComponentProps<typeof ProposalEditorialDocument>;

/**
 * Owner review 2026-09-02 — Proposal product-story layout correction.
 *
 * Keep the existing renderer/data/print logic untouched. This layer only
 * corrects the editorial composition of the product-story section and the
 * paper/photo palette:
 * - image + complete explanation column, alternating left/right by item;
 * - explanation text always reads left-to-right (never right aligned/justified);
 * - specs sit below the explanation instead of consuming a narrow third column;
 * - the wider title column, together with the renderer's non-breaking product
 *   code hyphens, avoids visually wrong product-name breaks;
 * - most catalogue photos have a white baked-in background, so photo mounts
 *   are pure white while the proposal paper is a slightly deeper warm stone.
 */
const storyLayoutCss = `
.${proposalStyles.wrap} {
  --paper: #f2eee6;
  --ivory: #ffffff;
  --stone: #e6dfd4;
  --desk: #e5e0d8;
  --line: #d4ccc0;
}

.${proposalStyles.coverArt},
.${proposalStyles.storyPhoto},
.${proposalStyles.storyPhotoSecondary},
.${proposalStyles.galleryItem} {
  background: #ffffff;
  border-color: rgba(178, 166, 149, 0.34);
}

.${proposalStyles.storyPhoto},
.${proposalStyles.storyPhotoSecondary},
.${proposalStyles.galleryItem} {
  border: 1px solid rgba(178, 166, 149, 0.26);
}

.${proposalStyles.selectionPhoto} {
  background: #ffffff;
  border: 1px solid rgba(178, 166, 149, 0.22);
  padding: 1.2mm;
}

.${proposalStyles.storyHeading} {
  min-width: 0;
}

.${proposalStyles.storyTitle} {
  overflow-wrap: normal;
  word-break: normal;
  hyphens: none;
  text-wrap: pretty;
}

.${proposalStyles.story_feature} .${proposalStyles.storyDesc},
.${proposalStyles.story_lead} .${proposalStyles.storyDesc},
.${proposalStyles.story_duo} .${proposalStyles.storyDesc} {
  text-align: left;
  text-align-last: auto;
}

.${proposalStyles.story_duo} {
  grid-template-columns: 64mm minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "photo head"
    "photo copy"
    "photo spec";
  column-gap: 10mm;
  row-gap: 3mm;
  align-items: start;
}

.${proposalStyles.story_duo}:nth-child(even) {
  grid-template-columns: minmax(0, 1fr) 64mm;
  grid-template-areas:
    "head photo"
    "copy photo"
    "spec photo";
}

.${proposalStyles.story_duo} .${proposalStyles.storyHead} {
  grid-template-columns: 8mm minmax(0, 1fr);
  gap: 3mm;
  width: 100%;
}

.${proposalStyles.story_duo} .${proposalStyles.storyTitle} {
  max-width: 100%;
  font-size: 25px;
  line-height: 1.05;
}

.${proposalStyles.story_duo} .${proposalStyles.storyVisuals} {
  align-self: stretch;
}

.${proposalStyles.story_duo} .${proposalStyles.storyPhoto} {
  width: 64mm;
  height: 96mm;
  padding: 4mm;
}

.${proposalStyles.story_duo} .${proposalStyles.storyCopy} {
  align-self: start;
  padding-top: 1mm;
}

.${proposalStyles.story_duo} .${proposalStyles.storyDesc} {
  max-width: 62ch;
  font-size: 11.5px;
  line-height: 1.55;
}

.${proposalStyles.story_duo} .${proposalStyles.storySpecs} {
  align-self: start;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 6mm;
  margin-top: 2mm;
}

.${proposalStyles.story_duo} .${proposalStyles.storySpecs} > div {
  padding: 2mm 0;
}

@media screen and (max-width: 1100px) {
  .${proposalStyles.story_duo},
  .${proposalStyles.story_duo}:nth-child(even) {
    grid-template-columns: 120px minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "photo head"
      "photo copy"
      "spec spec";
    column-gap: 5mm;
    row-gap: 3mm;
  }

  .${proposalStyles.story_duo} .${proposalStyles.storyPhoto} {
    width: 120px;
    height: 120px;
  }

  .${proposalStyles.story_duo} .${proposalStyles.storySpecs} {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media screen and (max-width: 720px) {
  .${proposalStyles.story_duo},
  .${proposalStyles.story_duo}:nth-child(even) {
    grid-template-columns: 90px minmax(0, 1fr);
    grid-template-areas:
      "photo head"
      "photo copy"
      "spec spec";
  }

  .${proposalStyles.story_duo} .${proposalStyles.storyPhoto} {
    width: 90px;
    height: 90px;
  }

  .${proposalStyles.story_duo} .${proposalStyles.storySpecs} {
    grid-template-columns: 1fr;
  }
}
`;

export default function ProposalEditorialLayout(props: Props) {
  return (
    <>
      <style>{storyLayoutCss}</style>
      <ProposalEditorialDocument {...props} />
    </>
  );
}

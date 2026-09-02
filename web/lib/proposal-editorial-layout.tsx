import type { ComponentProps } from "react";
import ProposalEditorialDocument from "@/lib/proposal-editorial-document";
import proposalStyles from "@/lib/proposal-editorial-document.module.css";

type Props = ComponentProps<typeof ProposalEditorialDocument>;

/**
 * Owner review 2026-09-03 — Proposal product-story composition.
 *
 * Reference direction: image-first furniture editorial page. Keep all source
 * data, pricing, hand-off and print logic in ProposalEditorialDocument; this
 * layer only controls visual composition:
 * - warm-stone paper + pure-white photo mounts for catalogue images whose
 *   source files are mostly baked on white backgrounds;
 * - feature story = large image first, then product identity, then description
 *   on the left and structured specs on the right;
 * - duo story = the same hierarchy at half-page scale, stacked vertically;
 * - existing 3-item fallback is made into three clean editorial rows instead
 *   of the old lead/compact collage;
 * - product copy is always left aligned; product-name/code break protection
 *   remains owned by the renderer (non-breaking code hyphens).
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

.${proposalStyles.storyPageHead} {
  margin-bottom: 5mm;
  padding-bottom: 2.5mm;
  align-items: center;
}

.${proposalStyles.storyHeading} {
  min-width: 0;
}

.${proposalStyles.storyTitle} {
  max-width: 100%;
  overflow-wrap: normal;
  word-break: normal;
  hyphens: none;
  text-wrap: balance;
}

.${proposalStyles.storyDesc} {
  text-align: left;
  text-align-last: auto;
}

/* ---------------------------------------------------------------
 * One-product feature page: large white photo mount first, then the
 * product identity and a calm two-column information footer.
 * --------------------------------------------------------------- */
.${proposalStyles.story_feature} {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52mm;
  grid-template-rows: minmax(0, 1fr) auto auto;
  grid-template-areas:
    "visual visual"
    "head head"
    "copy spec";
  column-gap: 10mm;
  row-gap: 5mm;
  align-items: start;
}

.${proposalStyles.story_feature} .${proposalStyles.storyVisuals} {
  grid-area: visual;
  display: block;
  min-height: 0;
}

.${proposalStyles.story_feature} .${proposalStyles.storyPhoto} {
  width: 100%;
  height: 145mm;
  min-height: 0;
  padding: 7mm;
}

.${proposalStyles.story_feature} .${proposalStyles.storyPhotoSecondary} {
  display: none;
}

.${proposalStyles.story_feature} .${proposalStyles.storyHead} {
  grid-area: head;
  width: 100%;
  grid-template-columns: 10mm minmax(0, 1fr);
  gap: 4mm;
  align-items: start;
}

.${proposalStyles.story_feature} .${proposalStyles.storyNo} {
  font-size: 18px;
  padding-top: 1.5mm;
}

.${proposalStyles.story_feature} .${proposalStyles.storyTitle} {
  max-width: 28ch;
  font-size: 32px;
  line-height: 1.04;
}

.${proposalStyles.story_feature} .${proposalStyles.storyCode} {
  margin-top: 4px;
  font-size: 9.5px;
}

.${proposalStyles.story_feature} .${proposalStyles.storyCopy} {
  grid-area: copy;
  min-width: 0;
  padding-top: 0;
}

.${proposalStyles.story_feature} .${proposalStyles.storyDesc} {
  max-width: 72ch;
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.65;
}

.${proposalStyles.story_feature} .${proposalStyles.storySpecs} {
  grid-area: spec;
  align-self: start;
  min-width: 0;
}

.${proposalStyles.story_feature} .${proposalStyles.storySpecs} > div {
  padding: 2.6mm 0;
  border-top: 1px solid var(--line);
}

.${proposalStyles.story_feature} .${proposalStyles.storySpecs} dt {
  font-size: 8px;
}

.${proposalStyles.story_feature} .${proposalStyles.storySpecs} dd {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.35;
}

/* ---------------------------------------------------------------
 * Two products per page: same image-first reading order, scaled down.
 * No alternating right-aligned copy; both items scan identically.
 * --------------------------------------------------------------- */
.${proposalStyles.spreadDuo} {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: 1fr 1fr;
  gap: 8mm;
}

.${proposalStyles.story_duo},
.${proposalStyles.story_duo}:nth-child(even) {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42mm;
  grid-template-rows: 54mm auto minmax(0, 1fr);
  grid-template-areas:
    "photo photo"
    "head head"
    "copy spec";
  column-gap: 8mm;
  row-gap: 3mm;
  align-items: start;
  padding-bottom: 7mm;
  border-bottom: 1px solid var(--line);
}

.${proposalStyles.story_duo}:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.${proposalStyles.story_duo} .${proposalStyles.storyVisuals} {
  grid-area: photo;
  min-width: 0;
}

.${proposalStyles.story_duo} .${proposalStyles.storyPhoto} {
  width: 100%;
  height: 54mm;
  padding: 4mm;
}

.${proposalStyles.story_duo} .${proposalStyles.storyHead} {
  grid-area: head;
  width: 100%;
  grid-template-columns: 8mm minmax(0, 1fr);
  gap: 3mm;
}

.${proposalStyles.story_duo} .${proposalStyles.storyNo} {
  font-size: 15px;
  padding-top: 1mm;
}

.${proposalStyles.story_duo} .${proposalStyles.storyTitle} {
  font-size: 22px;
  line-height: 1.04;
}

.${proposalStyles.story_duo} .${proposalStyles.storyCode} {
  margin-top: 3px;
  font-size: 8.5px;
}

.${proposalStyles.story_duo} .${proposalStyles.storyCopy} {
  grid-area: copy;
  min-width: 0;
  padding-top: 0;
}

.${proposalStyles.story_duo} .${proposalStyles.storyDesc} {
  max-width: 64ch;
  margin-top: 4px;
  font-size: 10.5px;
  line-height: 1.5;
}

.${proposalStyles.story_duo} .${proposalStyles.storySpecs} {
  grid-area: spec;
  align-self: start;
  min-width: 0;
}

.${proposalStyles.story_duo} .${proposalStyles.storySpecs} > div {
  padding: 1.7mm 0;
  border-top: 1px solid var(--line);
}

.${proposalStyles.story_duo} .${proposalStyles.storySpecs} dt {
  font-size: 7.5px;
}

.${proposalStyles.story_duo} .${proposalStyles.storySpecs} dd {
  font-size: 9.5px;
}

/* ---------------------------------------------------------------
 * Existing three-item fallback: remove the asymmetric collage. Each
 * product becomes a clearly separated row with image, identity/copy,
 * and specs. This keeps all data visible without changing pack logic.
 * --------------------------------------------------------------- */
.${proposalStyles.spreadLeadTrio},
.${proposalStyles.spreadTrio} {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 6mm;
}

.${proposalStyles.spreadSideStack} {
  display: contents;
}

.${proposalStyles.story_lead},
.${proposalStyles.story_compact} {
  height: auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 44mm minmax(0, 1fr) 34mm;
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    "photo head spec"
    "photo copy spec";
  column-gap: 7mm;
  row-gap: 2.5mm;
  align-items: start;
  padding: 0 0 5mm;
  border-right: none;
  border-bottom: 1px solid var(--line);
}

.${proposalStyles.story_lead}:last-child,
.${proposalStyles.story_compact}:last-child {
  border-bottom: none;
}

.${proposalStyles.story_lead} .${proposalStyles.storyVisuals},
.${proposalStyles.story_compact} .${proposalStyles.storyVisuals} {
  grid-area: photo;
  min-width: 0;
}

.${proposalStyles.story_lead} .${proposalStyles.storyPhoto},
.${proposalStyles.story_compact} .${proposalStyles.storyPhoto} {
  width: 44mm;
  height: 58mm;
  padding: 3mm;
}

.${proposalStyles.story_lead} .${proposalStyles.storyHead},
.${proposalStyles.story_compact} .${proposalStyles.storyHead} {
  grid-area: head;
  grid-template-columns: 7mm minmax(0, 1fr);
  gap: 2.5mm;
}

.${proposalStyles.story_lead} .${proposalStyles.storyNo},
.${proposalStyles.story_compact} .${proposalStyles.storyNo} {
  font-size: 13px;
}

.${proposalStyles.story_lead} .${proposalStyles.storyTitle},
.${proposalStyles.story_compact} .${proposalStyles.storyTitle} {
  font-size: 18px;
  line-height: 1.05;
}

.${proposalStyles.story_lead} .${proposalStyles.storyCode},
.${proposalStyles.story_compact} .${proposalStyles.storyCode} {
  margin-top: 2px;
  font-size: 8px;
}

.${proposalStyles.story_lead} .${proposalStyles.storyCopy},
.${proposalStyles.story_compact} .${proposalStyles.storyCopy} {
  grid-area: copy;
  min-width: 0;
  padding-top: 0;
}

.${proposalStyles.story_lead} .${proposalStyles.storyDesc},
.${proposalStyles.story_compact} .${proposalStyles.storyDesc} {
  margin-top: 3px;
  font-size: 9.5px;
  line-height: 1.45;
}

.${proposalStyles.story_compact} .${proposalStyles.storyCopy} .${proposalStyles.eyebrow} {
  display: none;
}

.${proposalStyles.story_lead} .${proposalStyles.storySpecs},
.${proposalStyles.story_compact} .${proposalStyles.storySpecs} {
  grid-area: spec;
  display: block;
  align-self: start;
  min-width: 0;
}

.${proposalStyles.story_lead} .${proposalStyles.storySpecs} > div,
.${proposalStyles.story_compact} .${proposalStyles.storySpecs} > div {
  min-width: 0;
  padding: 1.5mm 0;
  border-top: 1px solid var(--line);
}

.${proposalStyles.story_lead} .${proposalStyles.storySpecs} dt,
.${proposalStyles.story_compact} .${proposalStyles.storySpecs} dt {
  font-size: 7px;
}

.${proposalStyles.story_lead} .${proposalStyles.storySpecs} dd,
.${proposalStyles.story_compact} .${proposalStyles.storySpecs} dd {
  font-size: 8.5px;
  line-height: 1.3;
}

@media screen and (max-width: 1100px) {
  .${proposalStyles.story_feature} {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    grid-template-areas:
      "visual"
      "head"
      "copy"
      "spec";
  }

  .${proposalStyles.story_feature} .${proposalStyles.storyPhoto} {
    height: 420px;
  }

  .${proposalStyles.spreadDuo},
  .${proposalStyles.spreadLeadTrio},
  .${proposalStyles.spreadTrio} {
    grid-template-rows: auto;
  }

  .${proposalStyles.story_duo},
  .${proposalStyles.story_duo}:nth-child(even) {
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    grid-template-areas:
      "photo"
      "head"
      "copy"
      "spec";
  }

  .${proposalStyles.story_duo} .${proposalStyles.storyPhoto} {
    height: 260px;
  }

  .${proposalStyles.story_lead},
  .${proposalStyles.story_compact} {
    grid-template-columns: 120px minmax(0, 1fr);
    grid-template-rows: auto auto auto;
    grid-template-areas:
      "photo head"
      "photo copy"
      "spec spec";
    column-gap: 5mm;
  }

  .${proposalStyles.story_lead} .${proposalStyles.storyPhoto},
  .${proposalStyles.story_compact} .${proposalStyles.storyPhoto} {
    width: 120px;
    height: 120px;
  }
}

@media screen and (max-width: 720px) {
  .${proposalStyles.story_feature} .${proposalStyles.storyPhoto} {
    height: 300px;
    padding: 14px;
  }

  .${proposalStyles.story_feature} .${proposalStyles.storyTitle} {
    font-size: 28px;
  }

  .${proposalStyles.story_duo} .${proposalStyles.storyPhoto} {
    height: 220px;
  }

  .${proposalStyles.story_lead},
  .${proposalStyles.story_compact} {
    grid-template-columns: 90px minmax(0, 1fr);
    grid-template-areas:
      "photo head"
      "photo copy"
      "spec spec";
  }

  .${proposalStyles.story_lead} .${proposalStyles.storyPhoto},
  .${proposalStyles.story_compact} .${proposalStyles.storyPhoto} {
    width: 90px;
    height: 90px;
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

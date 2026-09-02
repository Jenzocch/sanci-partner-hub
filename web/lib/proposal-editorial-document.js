"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCommonMessages } from "@/lib/i18n/provider";
import { formatIDR } from "@/lib/orders-shared";
import { COMPANY_INFO } from "@/lib/company-info";
import { readProposalHandoff, } from "@/lib/proposal-shared";
import { shrinkPhotosForPrint } from "@/lib/shrink-photos-for-print";
import styles from "./proposal-editorial-document.module.css";
const LOGO = "/brand/sanci-logo.png";
const SELECTION_ROWS_PER_PAGE = 8;
/**
 * Kode produk TIDAK dicetak ulang kalau namanya sudah memuatnya (audit
 * Proposal 2026-09-02, owner: "型號印兩次"). Nama katalog SANCI lazim
 * berbentuk "SANCI Sectional Sofa WMSF336" — mencetak "WMSF336" lagi tepat
 * di bawahnya membuat pelanggan membaca satu hal dua kali. Pencocokan tidak
 * peka huruf besar/kecil; kode yang benar-benar berbeda dari nama tetap
 * dicetak seperti biasa.
 */
/**
 * Tanda hubung DI DALAM token (mis. "CE-279", "ST08-CD-R180") diganti tanda
 * hubung TAK-PUTUS (U+2011) untuk TAMPILAN saja (owner 2026-09-02: "品名也都
 * 斷字" — di kertas tercetak "SANCI Bed CE-" lalu "279 180" di baris
 * berikutnya). `hyphens:none` di CSS hanya mematikan pemenggalan otomatis;
 * tanda hubung yang memang ada di teks tetap titik patah bagi peramban.
 * Hanya "-" yang diapit karakter bukan-spasi yang diganti — dash dengan
 * spasi di sekelilingnya (" – ") tetap boleh patah. Data tidak disentuh.
 */
function keepCodesTogether(text) {
    return typeof text === "string" ? text.replace(/(\S)-(?=\S)/g, "$1\u2011") : text;
}
function codeAlreadyInName(name, code) {
    if (!code)
        return true;
    return name.toLowerCase().includes(code.trim().toLowerCase());
}
function safeFilenamePart(value) {
    return (value
        .trim()
        .normalize("NFKC")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .slice(0, 72) || "Customer");
}
function printTimestamp(d = new Date()) {
    const two = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
}
function Sheet({ children, n, className = "" }) {
    return (_jsx("section", { className: `${styles.sheet}${className ? ` ${className}` : ""}`, children: _jsxs("div", { className: styles.inner, children: [children, _jsx("span", { className: styles.pgBrand, children: "SANCI Proposal" }), n !== null && _jsx("span", { className: styles.pgNo, children: String(n).padStart(2, "0") })] }) }));
}
function Photo({ src, alt, className, eager = false, }) {
    return (_jsx("div", { className: className, children: src ? (_jsx("img", { src: src, alt: alt, loading: eager ? "eager" : "lazy", decoding: "async" })) : (_jsx("span", { className: styles.noPhoto, "aria-hidden": "true" })) }));
}
function textLength(item) {
    return item.row.product?.description?.trim().length ?? 0;
}
function isCompactStory(item) {
    return item.row.photos.length <= 2 && textLength(item) <= 170;
}
function isMediumStory(item) {
    return item.row.photos.length <= 2 && textLength(item) <= 260;
}
function packStorySpreads(items) {
    const spreads = [];
    let i = 0;
    while (i < items.length) {
        const remaining = items.length - i;
        const current = items[i];
        if (i === 0 && remaining >= 3 && isMediumStory(current) && isCompactStory(items[i + 1]) && isCompactStory(items[i + 2])) {
            spreads.push({ kind: "leadTrio", items: items.slice(i, i + 3) });
            i += 3;
            continue;
        }
        if (!isMediumStory(current)) {
            spreads.push({ kind: "feature", items: [current] });
            i += 1;
            continue;
        }
        if (remaining >= 3 && isCompactStory(current) && isCompactStory(items[i + 1]) && isCompactStory(items[i + 2])) {
            spreads.push({ kind: "trio", items: items.slice(i, i + 3) });
            i += 3;
            continue;
        }
        if (remaining >= 2 && isMediumStory(current) && isMediumStory(items[i + 1])) {
            spreads.push({ kind: "duo", items: items.slice(i, i + 2) });
            i += 2;
            continue;
        }
        spreads.push({ kind: "feature", items: [current] });
        i += 1;
    }
    return spreads;
}
function ProductStory({ item, variant, labels, }) {
    const p = item.row.product;
    const desc = p?.description?.trim();
    const secondPhoto = item.row.photos[1];
    return (_jsxs("article", { className: `${styles.story} ${styles[`story_${variant}`]}`, children: [_jsxs("header", { className: styles.storyHead, children: [_jsx("span", { className: styles.storyNo, children: String(item.no).padStart(2, "0") }), _jsxs("div", { className: styles.storyHeading, children: [_jsx("h3", { className: styles.storyTitle, children: keepCodesTogether(item.row.line.name) }), !codeAlreadyInName(item.row.line.name, item.row.line.code) && _jsx("p", { className: styles.storyCode, children: keepCodesTogether(item.row.line.code) })] })] }), _jsxs("div", { className: styles.storyVisuals, children: [_jsx(Photo, { src: item.row.photos[0], alt: item.row.line.name, className: styles.storyPhoto }), secondPhoto && variant === "feature" && (_jsx(Photo, { src: secondPhoto, alt: item.row.line.name, className: styles.storyPhotoSecondary }))] }), _jsx("div", { className: styles.storyCopy, children: desc && (_jsxs(_Fragment, { children: [_jsx("p", { className: styles.eyebrow, children: labels.about }), _jsx("p", { className: styles.storyDesc, children: desc })] })) }), (p?.size || p?.category || item.colors.length > 0) && (_jsxs("dl", { className: styles.storySpecs, children: [p?.size && (_jsxs("div", { children: [_jsx("dt", { children: labels.size }), _jsx("dd", { className: styles.num, children: p.size })] })), p?.category && (_jsxs("div", { children: [_jsx("dt", { children: labels.category }), _jsx("dd", { children: p.category })] })), item.colors.length > 0 && (_jsxs("div", { children: [_jsx("dt", { children: labels.colors }), _jsx("dd", { children: item.colors.join(" · ") })] }))] }))] }));
}
function galleryClass(count) {
    if (count <= 2)
        return styles.gallery2;
    if (count === 3)
        return styles.gallery3;
    return styles.gallery4;
}
export default function ProposalEditorialDocument({ loadProducts, backHref, }) {
    const m = useCommonMessages();
    const [handoff, setHandoff] = useState(null);
    const [ready, setReady] = useState(false);
    const [customerName, setCustomerName] = useState("");
    const [load, setLoad] = useState({ phase: "loading" });
    const [printing, setPrinting] = useState(false);
    const docRef = useRef(null);
    useEffect(() => {
        const h = readProposalHandoff();
        setHandoff(h);
        setCustomerName(h?.customerName ?? "");
        setReady(true);
    }, []);
    useEffect(() => {
        if (!handoff)
            return;
        let alive = true;
        loadProducts(Array.from(new Set(handoff.lines.map((l) => l.productId))))
            .then((res) => {
            if (!alive)
                return;
            if (res.ok) {
                setLoad({ phase: "ready", products: res.products });
                return;
            }
            setLoad({ phase: "error", text: res.reason === "catalog-closed" ? m.proposalCatalogClosed : m.proposalLoadFailed });
        })
            .catch(() => {
            if (alive)
                setLoad({ phase: "error", text: m.proposalLoadFailed });
        });
        return () => {
            alive = false;
        };
    }, [handoff, loadProducts, m]);
    const rows = useMemo(() => {
        if (!handoff)
            return [];
        const products = load.phase === "ready" ? load.products : [];
        return handoff.lines.map((line) => {
            const product = products.find((x) => x.id === line.productId);
            return { line, product, amount: line.unitPrice * line.qty, photos: product?.photos ?? [], key: line.lineId };
        });
    }, [handoff, load]);
    const stories = useMemo(() => {
        const byProduct = new Map();
        rows.forEach((row, index) => {
            const current = byProduct.get(row.line.productId);
            const color = row.line.colorCode;
            if (!current) {
                byProduct.set(row.line.productId, { row, no: index + 1, colors: color ? [color] : [] });
                return;
            }
            if (color && !current.colors.includes(color))
                current.colors.push(color);
        });
        return Array.from(byProduct.values());
    }, [rows]);
    const storySpreads = useMemo(() => packStorySpreads(stories.filter((s) => s.row.product)), [stories]);
    const selectionPages = useMemo(() => {
        const pages = [];
        for (let i = 0; i < rows.length; i += SELECTION_ROWS_PER_PAGE)
            pages.push(rows.slice(i, i + SELECTION_ROWS_PER_PAGE));
        return pages;
    }, [rows]);
    const galleryStories = useMemo(() => stories.filter((story) => story.row.product && story.row.photos.length >= 3), [stories]);
    const missingProfiles = load.phase === "ready" ? stories.filter((story) => !story.row.product).map((story) => story.row.line.name) : [];
    async function handlePrint() {
        if (printing)
            return;
        setPrinting(true);
        let undo = null;
        const originalTitle = document.title;
        document.title = `SANCI-Proposal_${safeFilenamePart(customerName)}_${printTimestamp()}`;
        try {
            if (docRef.current)
                undo = await shrinkPhotosForPrint(docRef.current);
            window.print();
        }
        catch {
            window.print();
        }
        finally {
            undo?.();
            document.title = originalTitle;
            setPrinting(false);
        }
    }
    if (!ready)
        return null;
    if (!handoff) {
        return (_jsx("main", { className: "pwrap", children: _jsxs("div", { className: "card", children: [_jsx("h2", { children: m.proposalEmptyTitle }), _jsx("p", { className: "sub", children: m.proposalEmptyBody }), _jsx("div", { className: "btnrow", style: { marginTop: 14 }, children: _jsx(Link, { href: backHref, className: "btn primary", children: m.proposalBackCta }) })] }) }));
    }
    const lh = COMPANY_INFO.letterhead;
    const dateText = new Date(handoff.savedAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const who = customerName.trim();
    const coverRow = rows.filter((row) => row.photos.length > 0).reduce((best, row) => (!best || row.amount > best.amount ? row : best), null) ?? rows[0];
    const coverPhoto = coverRow?.photos[0];
    let visiblePage = 1;
    const nextPage = () => ++visiblePage;
    // Subtotal hanya dicetak kalau ada sesuatu di antara dia dan Harga Akhir
    // (diskon/potongan/markup). Tanpa itu keduanya angka yang SAMA persis,
    // dan owner membaca proposal tanpa diskon sebagai "金額一直重複".
    const showSubtotal = handoff.subtotal !== handoff.finalAmount;
    const totals = (_jsxs("div", { className: styles.totals, children: [showSubtotal && (_jsxs("div", { className: styles.moneyRow, children: [_jsx("span", { children: m.proposalSubtotal }), _jsx("strong", { className: styles.num, children: formatIDR(handoff.subtotal) })] })), handoff.discountPcts.length > 0 && (_jsxs("div", { className: styles.moneyRow, children: [_jsx("span", { children: m.proposalDiscountStep.replace("{pct}", handoff.discountPcts.join("% + ")) }), _jsxs("strong", { className: styles.num, children: ["− ", formatIDR(handoff.totalDiscountAmount)] })] })), handoff.cashDiscount > 0 && (_jsxs("div", { className: styles.moneyRow, children: [_jsx("span", { children: m.proposalCashDiscount }), _jsxs("strong", { className: styles.num, children: ["− ", formatIDR(handoff.cashDiscount)] })] })), _jsxs("div", { className: styles.moneyFinal, children: [_jsx("span", { children: m.proposalFinalPrice }), _jsx("strong", { className: styles.num, children: formatIDR(handoff.finalAmount) })] })] }));
    const storyLabels = { about: m.proposalAboutLabel, size: m.proposalSpecSize, category: m.proposalSpecCategory, colors: m.proposalSpecColorsChosen };
    return (_jsxs("div", { className: styles.wrap, children: [_jsxs("header", { className: `${styles.bar} noprint`, children: [_jsx("img", { src: LOGO, alt: lh.brand, className: styles.barLogo }), _jsx("span", { className: styles.barSpacer }), _jsx("input", { className: styles.nameField, value: customerName, onChange: (e) => setCustomerName(e.target.value), placeholder: m.proposalCustomerPlaceholder, "aria-label": m.proposalForLabel }), _jsx(Link, { href: backHref, className: styles.tool, children: m.proposalBackCta }), _jsx("button", { type: "button", className: `${styles.tool} ${styles.toolPrimary}`, disabled: printing, onClick: handlePrint, children: printing ? m.proposalPrintPreparing : m.proposalPrintCta })] }), _jsxs("main", { className: styles.doc, ref: docRef, children: [_jsx(Sheet, { n: null, className: styles.coverSheet, children: _jsxs("div", { className: styles.coverLayout, children: [_jsxs("div", { className: styles.coverLeft, children: [_jsxs("div", { className: styles.coverBrand, children: [_jsx("img", { src: LOGO, alt: lh.brand }), _jsx("span", { className: styles.coverRule }), _jsx("p", { className: styles.eyebrow, children: m.proposalCoverKicker })] }), _jsxs("div", { className: styles.coverCore, children: [_jsx("h1", { className: styles.coverTitle, children: m.proposalTitle }), _jsx("p", { className: styles.coverSub, children: m.proposalCoverSub })] }), _jsxs("div", { className: styles.coverMeta, children: [who && (_jsxs("div", { children: [_jsx("p", { className: styles.metaLabel, children: m.proposalForLabel }), _jsx("p", { className: styles.coverName, children: who })] })), _jsxs("div", { className: styles.coverMetaGrid, children: [_jsxs("div", { children: [_jsx("p", { className: styles.metaLabel, children: m.proposalMetaDate }), _jsx("p", { className: styles.metaValue, children: dateText })] }), _jsxs("div", { children: [_jsx("p", { className: styles.metaLabel, children: m.proposalContactShowroom }), _jsx("p", { className: styles.metaValue, children: lh.name })] }), _jsxs("div", { children: [_jsx("p", { className: styles.metaLabel, children: m.proposalContactLabel }), _jsx("p", { className: `${styles.metaValue} ${styles.contactPhone}`, children: lh.phone ? `WhatsApp · ${lh.phone}` : lh.website })] })] }), _jsx("p", { className: styles.coverThanks, children: m.proposalThanksBody })] })] }), _jsxs("div", { className: styles.coverArt, children: [_jsx(Photo, { src: coverPhoto, alt: coverRow?.line.name ?? lh.brand, className: styles.coverImage, eager: true }), coverRow && (_jsxs("div", { className: styles.coverArtCaption, children: [_jsx("span", { children: String(rows.indexOf(coverRow) + 1).padStart(2, "0") }), _jsxs("div", { children: [_jsx("strong", { children: keepCodesTogether(coverRow.line.name) }), !codeAlreadyInName(coverRow.line.name, coverRow.line.code) && _jsx("small", { children: keepCodesTogether(coverRow.line.code) })] })] }))] })] }) }), selectionPages.map((pageRows, pageIndex) => {
                    const isLast = pageIndex === selectionPages.length - 1;
                    const start = pageIndex * SELECTION_ROWS_PER_PAGE;
                    return (_jsx(Sheet, { n: nextPage(), children: _jsxs("div", { className: styles.selectionPage, children: [_jsxs("div", { className: styles.sectionHead, children: [_jsxs("div", { children: [_jsx("p", { className: styles.eyebrow, children: m.proposalSelectionKicker }), _jsx("h2", { children: m.proposalSelectionTitle })] }), _jsx("p", { children: m.proposalProductsCount.replace("{n}", String(rows.length)) })] }), _jsx("div", { className: styles.selectionList, children: pageRows.map((row, index) => (_jsxs("article", { className: styles.selectionRow, children: [_jsx("span", { className: styles.selectionNo, children: String(start + index + 1).padStart(2, "0") }), _jsx(Photo, { src: row.photos[0], alt: row.line.name, className: styles.selectionPhoto }), _jsxs("div", { className: styles.selectionIdentity, children: [_jsx("strong", { children: keepCodesTogether(row.line.name) }), !codeAlreadyInName(row.line.name, row.line.code) && _jsx("small", { children: keepCodesTogether(row.line.code) }), row.line.colorCode && _jsxs("small", { children: [m.color, ": ", row.line.colorCode] }), row.product?.size && _jsx("small", { children: row.product.size })] }), _jsxs("div", { className: styles.selectionMetric, children: [_jsx("span", { children: m.proposalColQty }), _jsx("strong", { className: styles.num, children: row.line.qty })] }), _jsxs("div", { className: styles.selectionMetric, children: [_jsx("span", { children: m.proposalColUnit }), _jsx("strong", { className: styles.num, children: formatIDR(row.line.unitPrice) })] }), _jsxs("div", { className: `${styles.selectionMetric} ${styles.selectionMetricTotal}`, children: [_jsx("span", { children: m.proposalColTotal }), _jsx("strong", { className: styles.num, children: formatIDR(row.amount) })] })] }, row.key))) }), isLast && _jsx("div", { className: styles.selectionTotals, children: totals })] }) }, `selection-${pageIndex}`));
                }), storySpreads.map((spread, spreadIndex) => (_jsx(Sheet, { n: nextPage(), children: _jsxs("div", { className: styles.storyPage, children: [_jsxs("div", { className: styles.storyPageHead, children: [_jsx("p", { className: styles.eyebrow, children: m.proposalCollectionKicker }), _jsx("p", { children: spread.items.map((item) => String(item.no).padStart(2, "0")).join(" · ") })] }), spread.kind === "feature" && (_jsx("div", { className: styles.spreadFeature, children: _jsx(ProductStory, { item: spread.items[0], variant: "feature", labels: storyLabels }) })), spread.kind === "leadTrio" && (_jsxs("div", { className: styles.spreadLeadTrio, children: [_jsx(ProductStory, { item: spread.items[0], variant: "lead", labels: storyLabels }), _jsxs("div", { className: styles.spreadSideStack, children: [_jsx(ProductStory, { item: spread.items[1], variant: "compact", labels: storyLabels }), _jsx(ProductStory, { item: spread.items[2], variant: "compact", labels: storyLabels })] })] })), spread.kind === "trio" && (_jsxs("div", { className: styles.spreadTrio, children: [_jsx(ProductStory, { item: spread.items[0], variant: "lead", labels: storyLabels }), _jsxs("div", { className: styles.spreadSideStack, children: [_jsx(ProductStory, { item: spread.items[1], variant: "compact", labels: storyLabels }), _jsx(ProductStory, { item: spread.items[2], variant: "compact", labels: storyLabels })] })] })), spread.kind === "duo" && (_jsx("div", { className: styles.spreadDuo, children: spread.items.map((item) => (_jsx(ProductStory, { item: item, variant: "duo", labels: storyLabels }, item.row.line.productId))) }))] }) }, `story-${spreadIndex}`))), galleryStories.map((story) => {
                    const extra = story.row.photos.slice(1, 5);
                    return (_jsx(Sheet, { n: nextPage(), children: _jsxs("div", { className: styles.galleryPage, children: [_jsxs("div", { className: styles.galleryHead, children: [_jsx("p", { className: styles.eyebrow, children: m.proposalGalleryKicker.replace("{name}", story.row.line.name) }), _jsx("h2", { children: m.proposalGalleryTitle })] }), _jsx("div", { className: `${styles.galleryGrid} ${galleryClass(extra.length)}`, children: extra.map((url, index) => (_jsx(Photo, { src: url, alt: story.row.line.name, className: styles.galleryItem }, `${story.row.line.productId}-${index}`))) })] }) }, `gallery-${story.row.line.productId}`));
                }), load.phase === "error" && (_jsxs("div", { className: "banner bad noprint", style: { maxWidth: 900, margin: "0 auto 34px" }, children: [load.text, _jsx("div", { style: { marginTop: 6 }, children: m.proposalProfilesMissing })] })), missingProfiles.length > 0 && (_jsx("div", { className: "banner info noprint", style: { maxWidth: 900, margin: "0 auto 34px" }, children: m.proposalProfilesPartial.replace("{n}", String(missingProfiles.length)).replace("{names}", missingProfiles.join(", ")) }))] })] }));
}

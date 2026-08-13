# SANCI Partner Hub

SANCI 家具與合作家具店（Golden Home 等）之間的協作平台（PWA）。
**目前階段：Phase 1 — Partner Module（Partner Foundation）。**

## 給任何接手的 AI

動工前依序讀：

1. `FEATURES.md` — 功能清單＋狀態＋驗證證據（跨對話保命符）
2. `LESSONS.md` — 開發原則與繼承教訓
3. `docs/SPEC-PHASE1.md` — Phase 1 完整規格摘要（來源：Jenzo 指令書 v1.0）

治理規則：本專案遵守 audit-jenzo。最小 Diff、不破壞既有功能、完成必附獨立驗證證據、沒完成不得說完成。

## 目前狀態（2026-08-13）

| 項目 | 狀態 |
|---|---|
| 治理文件 | ✅ 已建立 |
| UI Prototype（假資料，可點擊） | `prototype/index.html` |
| 技術選型 | 提案：Next.js + Supabase（待 Jenzo 確認） |
| Supabase Project | ❌ **未配置**（阻塞真實作；不得偷用其他既有 project） |
| Auth / RLS / DB | NOT STARTED |
| Deployment | **NOT DEPLOYED**（SPEC §98：現階段不部署） |

## Phase 1 範圍（嚴格）

只做：Partner／Branch／Staff／Staff Assignment／Login User／Permission／Status／Audit／Offline Draft／Responsive UI。

**不做**（後續 Phase）：Customer、Order、Package、Product Selection、Warehouse、Inventory、Delivery、Accounting、POS、Commission、Payment、WhatsApp API。開發中發現「順便做 X 比較方便」→ 不做，記 dependency。

## 核心商業原則

- Partner（品牌）與 Branch（分店）兩層級，不得混合；不寫死 Golden Home。
- Partner A 永不可見 Partner B（P0）；同 Partner 跨 Branch 互看/互改由 SANCI 控制。
- Partner 的客戶永遠保留 Partner/Branch Attribution，不變成 SANCI Direct Customer。

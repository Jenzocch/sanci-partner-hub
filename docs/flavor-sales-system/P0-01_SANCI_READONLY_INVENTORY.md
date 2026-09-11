# P0-01：Sanci 唯讀盤點記錄（Flavor Sales System 前置作業）

| 項目 | 內容 |
|---|---|
| 盤點對象 | `Jenzocch/sanci-partner-hub` |
| 盤點分支 | `claude/sanci-system-refactor-m4nso0` |
| 盤點日期 | 2026-09-03 |
| 盤點性質 | 唯讀查證，未修改任何來源檔案（盤點後 `git status --porcelain` 為空） |
| 依據文件 | `FLAVOR_SALES_SYSTEM_PROJECT_PLAN.md` v0.2 第 12 節 |

本文件只記錄「哪些企畫書假設在這個 repo 裡是真的」，不涉及 Gudang One（本 session 無法存取該 repo，故 P0-02 未執行）。

---

## 1. 基準 commit

```
263bd90580080c2ff6cb764dc9d8986d6bf8129d
2026-09-02 14:00:35 +0000
Proposal: sampul memakai produk termahal (harga satuan), bukan nilai baris terbesar
```

與企畫書記載的基準 commit **一致**。分支狀態於盤點時為 `nothing to commit, working tree clean`。

## 2. Allowlist 候選路徑核對（企畫書 12.2）

以下路徑經 `test -e` 逐一核對，**全部存在**，可作為未來移植候選（尚未移植，僅確認存在）：

| 路徑 | 狀態 |
|---|---|
| `web/lib/use-submit-guard.ts` | 存在 |
| `web/lib/use-browse-persist.ts` | 存在 |
| `web/lib/build-id.ts` | 存在 |
| `web/app/version/route.ts` | 存在 |
| `web/lib/supabase/client.ts` | 存在 |
| `web/lib/supabase/server.ts` | 存在 |
| `web/eslint.config.mjs` | 存在 |
| `web/tsconfig.json` | 存在 |
| `web/app/loading.tsx` | 存在 |
| `web/app/error.tsx` | 存在 |
| `web/app/global-error.tsx` | 存在 |
| `web/lib/safe-write.ts` | 存在 |
| `web/lib/use-local-draft.ts` | 存在 |
| `web/lib/catalog-query.ts` | 存在 |
| `web/lib/i18n/` | 存在 |

## 3. Denylist 候選路徑核對（企畫書 12.4）

以下路徑經核對，**全部存在**（`web/vercel.json`，企畫書未寫完整路徑，實際位置為 `web/` 下而非 repo 根目錄）：

| 路徑 | 狀態 |
|---|---|
| `web/app/admin/partners/` | 存在 |
| `web/app/admin/actions-branches.ts` | 存在 |
| `web/app/admin/actions-packages.ts` | 存在 |
| `web/app/admin/actions-package-items.ts` | 存在 |
| `web/app/admin/actions-permissions.ts` | 存在 |
| `web/app/admin/actions-staff.ts` | 存在 |
| `web/app/cabang/staff/` | 存在 |
| `web/app/cabang/profil/` | 存在 |
| `web/app/cabang/akun/` | 存在 |
| `web/app/cabang/harga/` | 存在 |
| `web/app/admin/warna/` | 存在 |
| `web/lib/compress-image.ts` | 存在 |
| `web/lib/shrink-photos-for-print.ts` | 存在 |
| `web/lib/product-img.tsx` | 存在 |
| `web/lib/partner-logo.tsx` | 存在 |
| `web/app/admin/actions-product-photos.ts` | 存在 |
| `web/app/p/` | 存在 |
| `web/app/lihat/` | 存在 |
| `web/lib/company-info.ts` | 存在 |
| `web/public/brand/` | 存在 |
| `web/vercel.json`（企畫書寫 `vercel.json`，根目錄無此檔） | 存在（位置為 `web/vercel.json`） |
| `integrations/` | 存在 |
| `web/scripts/import-customers/` | 存在 |
| `web/scripts/import-master-data/` | 存在 |
| `prototype/` | 存在 |
| `supabase/migrations/` | 存在，共 27 個 migration 檔（`0001_partner_foundation.sql` ～ `0027_customer_settled_on.sql`）＋ 1 個 `README.md`，與企畫書「0001～0027」描述一致 |
| `FEATURES.md` | 存在 |
| `LESSONS.md` | 存在 |
| `README.md` | 存在 |
| `docs/` | 存在 |

## 4. 快速品牌／PII 關鍵字掃描（非完整掃描，僅供參考）

對 `SANCI`／`Golden Home` 關鍵字做了一次 grep（排除 `node_modules`、`.git`），確認在多個 `web/app/admin/**`、`supabase/migrations/README.md` 等檔案中出現，符合企畫書「來源含 Sanci 專屬公司資料與品牌」的描述。**這不是完整的 P0 驗收掃描**（企畫書 12.4 要求的完整掃描項目：`photo_url`、`product_photos`、`storage.from(`、`type="file"`、`sanci_products`、`partner_orders` 等尚未逐一執行），僅作為本次盤點的佐證。

## 5. 結論

- 企畫書第 12 節對 Sanci repo 現況的描述，經抽樣核對**與實際 repo 相符**，可作為後續「乾淨新專案 allowlist／denylist」規劃的可信基礎。
- 本次盤點**未修改、未刪除、未搬移**任何 Sanci 原始檔案；`git status` 於盤點前後皆為 clean。
- 未執行項目（明確列出，不假裝完成）：
  - P0-02 Gudang One 唯讀盤點：**未執行**（本 session 無 Gudang One repo 存取權）。
  - 完整 secret／PII／品牌關鍵字掃描：**未執行**，僅做關鍵字抽查。
  - 實際檔案內容搬移／新專案建立：**未執行**。
- 部署狀態：**NOT MODIFIED／NOT DEPLOYED**（本 repo 與 production 均未變動）。

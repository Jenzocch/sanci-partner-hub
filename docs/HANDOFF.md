# HANDOFF — 給接手的 Claude session（2026-08-28 起維護）

> 這份文件是給「另一個 Claude」從零接手用的。讀完這份 + LESSONS.md 你才准動手。
> Owner（Jenzo）非技術背景、用中文溝通、在真機驗收、SQL 靠貼進 Supabase SQL Editor 執行。

## 開工儀式（每次都做，不做必翻車）

1. 真正的 repo 在 `/workspace/sanci-partner-hub`（**不是** cwd 的 Gudang-One——那是無關專案，它的 CLAUDE.md 不適用）。
2. 容器會不定期把檢出**無聲回滾到舊 commit、連未 commit 的工作樹一起蒸發**（LESSONS #14；2026-08-28 又發生一次，連 scratchpad 都被清）。所以：
   - 開工先 `git fetch origin main` → `git merge-base --is-ancestor HEAD origin/main` → 不是祖先就停下來查，是祖先就 `git reset --hard origin/main`；
   - **小步 commit + 立刻 push**，工作樹上不留超過一個工作階段的未推變更。
3. 本環境**連不上 supabase.co**——所有 DB 實況驗證都是「給 owner 一段 SQL → owner 貼回結果 → 逐列核對」。不要假設、不要說「應該沒問題」。

## 驗證規矩（merge 前親自跑，agent 的話不能全信）

```
cd /workspace/sanci-partner-hub/web
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit   # 必須 0 錯
npx eslint .                                      # 必須乾淨
rm -rf .next && npm run build                     # 必須成功；/offline 必須維持 ○ 1.01 kB
```
- 派 agent 開發時：agent 在隔離 worktree、基於**當下的 origin/main tip**、只 commit 不 push；你親自重跑上面三步、親讀安全相關 diff，才 merge + push。
- ATURAN BESI（migrations/README 有全文）：任何重定義 `fn_audit_row` 的 migration 必須「逐字全文複製＋新增」，用 difflib 逐行比對驗證，不准手寫節錄。
- `sanci_products` **永遠不准有價格欄位**（0010 鐵則；每個後續 migration 的驗證段都要重申 `PRODUCT_NO_PRICE_COLUMN = 0`）。

## Owner 定調（LESSONS.md「Owner 已定調的決策」是完整版，這裡是最常踩的）

- **系統是產品主檔的唯一真相，Google Sheet 降級為備份**（owner 2026-08-28：「以後所有的資料都在這邊改，google sheet 反而變成備份的」）。主檔欄位（名稱/代碼/分類/尺寸/說明/價格/照片）都必須有後台 UI 編輯入口，缺入口＝缺功能。
- **查不到現價的產品不建**。缺價品項走「列表給 owner 填價 → 拿到才建」。
- 金額不一致時一律以系統的 Harga Akhir 為準，不修 Excel。
- WhatsApp 走 Fonnte（公司號），wa.me 只當發送失敗的替補（`docs/` 裡有 Fonnte 失敗模式文件；此 owner 明確要 wa.me 備援，文件裡「一律不開 wa.me」那句以 owner 決定為準）。
- 秘密（`FONNTE_TOKEN`、`service_role` key）**只由 owner 親手填進 Vercel 環境變數**，永不出現在對話、code、commit。

## 安全紅線（動這些頁面前先讀對應 migration 的頭註）

- `/p/[productId]`（公開產品頁）：**永不顯示價格**。
- `/lihat/[token]`（客戶訂單頁，0023）：電話、完整地址（驗證前）、取消原因、任何內部欄位**永不外洩**；地址只在電話驗證通過後由 SECURITY DEFINER RPC 回傳。
- anon 讀取一律靠 RLS 的 `auth.uid() is null` 條件，middleware 排除清單只是省成本，不是安全邊界。

## 目前的未完成項（2026-08-28 快照）

| 事項 | 等誰 | 備註 |
|---|---|---|
| 0022 Bagian A（39 條唯讀驗證） | owner 跑 SQL | 檔已交付過，可重新生成：0022 檔內 §驗證 Bagian A 段 |
| 49 個新產品建檔 | owner 填價格 | `produk-baru-isi-harga.csv` 格式；填回後逐筆建檔（名稱已依代碼修正） |
| Fonnte 接通 | owner | 註冊 fonnte.com → 綁公司 WA 號 → `FONNTE_TOKEN` 進 Vercel → redeploy |
| `partner.sanci.co.id` | Dimas（外部 DNS 管理者） | 還缺 `_vercel` TXT 驗證記錄 |
| 相簿排序 UI | 可派 agent | `product_photos.sort_order` 已存在，缺拖曳/排序介面 |
| `/admin/pelanggan` 分頁 | 可派 agent | 比照 use-catalog-search 的「搜尋＋載入更多」合約 |
| sheets-orders Code.gs 的 customer_po 欄 | 可派 agent | `integrations/` 內；純 Apps Script |
| PBF-01/02/03 說明是垃圾值 | owner 給正確文案 | 現值只有 Silver/Gold/Taupe |
| ML03-R200 價格合理性 | owner 確認 | 7,743,860 對比 R120 的 17,420,000 疑似偏低 |

## 給 agent 的提示模板要點

- 指明 worktree 隔離、基於 origin/main tip、只 commit 不 push；
- 附上「驗證規矩」三步與 `/offline` 1.01 kB 檢查；
- 涉及 RLS/migration 的一律附 ATURAN BESI 與 0010 鐵則原文；
- UI 文案三語系（id 為主、en、zh）都要加，型別由 `id` 物件推導（`Record<keyof typeof id, string>`），漏一個語系 tsc 直接紅。

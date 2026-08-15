# SANCI Partner Hub — 功能清單（Phase 1: Partner Module）

> ⚠️ 給 AI 的指令：修改本專案任何代碼前，先讀本檔 + `LESSONS.md` + `docs/SPEC-PHASE1.md`。
> 改動後逐項核對下列功能仍正常，並更新本檔。狀態必附驗證證據——不能只寫 DONE。

## 狀態定義

| 狀態 | 意義 |
|---|---|
| `NOT_STARTED` | 未動工 |
| `PROTOTYPE` | 只存在於可點擊 prototype（假資料，無真 DB/Auth）——**不算實作完成** |
| `IN_PROGRESS` | 實作中 |
| `UNVERIFIED` | 寫完但未獨立驗證 |
| `VERIFIED` | 有獨立驗證證據（證據欄必填：怎麼驗、看到什麼） |

## 完成標準（SPEC §95 — 全綠才算 Phase 1 完成）

Build ✓ Type Check ✓ Lint ✓ Tests ✓ Permission tests ✓ RLS tests ✓ Duplicate test ✓ Weak network test ✓ Responsive verification ✓ Audit verification ✓ — 每項要有實際證據。

## Phase 1 功能

| # | 功能 | 狀態 | 依賴 | 驗收標準（詳見 SPEC §） | 驗證證據 |
|---|---|---|---|---|---|
| 1 | Partner List (P-01) | **`VERIFIED`** | DB, Auth | 寬版表格＋搜尋＋篩選；Loading/Empty/Error 三態分明；API 失敗不顯示 "0 Partners"（§35–37） | 2026-08-14 Jenzo 建立 Golden Home 後於列表看到該筆；獨立核對：Supabase Table Editor 直接查 `partners` 表確認資料真的寫入（不只信 UI），見 LESSONS 鐵律 7 |
| 2 | Create Partner (P-02) | **`VERIFIED`** | DB | 單獨建 Partner（不連帶 Branch/User）；建立後 DRAFT；重名軟警告；Code 走 DB unique（§38–40） | 同上。idempotency（client_request_id）與重名警告邏輯已寫但未逐項點測，僅核心建立流程驗證 |
| 3 | Edit Partner | **`VERIFIED`** | #2 | ACTIVE 時 Code 鎖定；internal ID 永不可改（§10） | 2026-08-14 Jenzo 實際點擊 Ubah 改名並存檔成功。ACTIVE 鎖定 code 的分支未實測（尚無 ACTIVE partner 可測） |
| 4 | Partner Status | `UNVERIFIED` | #2 | DRAFT/ACTIVE/SUSPENDED/INACTIVE；Activate 五條件缺一不可（§11–12） | Server Action 已寫且本機測過查詢邏輯（見下方 LESSONS），但 Jenzo 尚未在 production 實際點過 Activate/Suspend/Delete 按鈕 |
| 5 | Partner Logo | `UNVERIFIED` | #2, Storage | PNG/JPG/WebP；上傳前壓縮；Logo 失敗不拖垮 Partner 建立（§41） | 2026-08-14 實作：`supabase/migrations/0003_partner_logo.sql`（bucket `partner-logos` 公開讀、寫入僅 `fn_is_admin()`、server 端另設 5MB 與 MIME 白名單）＋ `web/lib/compress-image.ts`（≤512px、WebP q0.8，WebP 不支援時退 JPEG，canvas 全滅則退原檔但僅限 ≤1MB）＋ 編輯 Partner modal 的「Logo (opsional)」欄位 ＋ `setPartnerLogo` Server Action（走 safeWrite，且校驗 URL 必須是本 partner 的公開 logo 路徑，不信瀏覽器傳值）＋ 詳情頁 Ringkasan 與列表顯示（`web/lib/partner-logo.tsx`，載入失敗自動不顯示，不留破圖）。**順序刻意是「先存 partner 欄位→成功才傳 logo」**，logo 任何失敗只跳黃色提示「Logo gagal diunggah — data partner tetap tersimpan.」，不影響存檔結果（§41）。**證據**：編譯後跑 30 項斷言（檔案類型/5MB 上限/長邊 512 等比縮放/直式橫式/小圖不放大/WebP→JPEG 退路/canvas 全滅的兩種分支/無法解讀的檔案/objectURL 與 bitmap 釋放/壓縮後反而變大就送原檔/訊息無 CJK 與技術字眼）全過；typecheck ✓ build ✓（本機實跑，輸出見 commit 說明）。**Migration 已確認套用（2026-08-15）**：Jenzo 回貼 SQL Editor 驗證結果，四行與 migration 檔內期望值完全相符：BUCKET 1 / BUCKET_PUBLIC true / STORAGE_POLICIES 4 / LOGO_URL_COLUMN 1。**仍未驗證**：本環境網路白名單擋 supabase.co，AI 無法真的上傳測試；**尚需 Jenzo** 在 Ubah Partner 實際選一張圖存檔，確認列表與詳情頁看得到，並換第二張圖確認畫面真的更新（不是看到舊圖，見 LESSONS #22 的快取風險）——這一步過了才算 VERIFIED。**Phase 1 刻意不做**：新增 Partner 的 modal 沒有 logo 欄位（表單當下還沒有 partner id 可當儲存路徑），要放 logo 就先建好再 Ubah；/cabang 只讀不上傳（公開讀即可，不加上傳 UI）|
| 6 | Branch Management (P-04/05) | **`VERIFIED`** | #2 | CRUD；Code unique = partner_id+code；地址必填（§14–15, 43–44） | 2026-08-14 Jenzo 在 production 建立 Cirebon/Bandung 兩個分店，確認成功（"可以了 繼續"） |
| 7 | Branch Status | `UNVERIFIED` | #6 | 四態；Suspend/Inactive 歷史不消失（§18） | Suspend/Reactivate 按鈕已做，Jenzo 未特別點過這個按鈕 |
| 8 | Branch Address | `UNVERIFIED` | #6 | 清楚顯示；mobile 用 multiline textarea（§17） | 表單已用 textarea；mobile 版面尚未跑過響應式測試 |
| 9 | Partner Staff (P-06 · Admin 視角) | **`VERIFIED`** | #6 | 分店只管自己 Staff；表單不出現 Branch 選擇（身份帶入）；Staff ≠ Login（§19–21, 45） | 2026-08-14 Jenzo 確認調店流程正確（"歷史有沒有保留"一項是本輪重點驗收項目）。**Partner 使用者視角（/cabang）本輪剛建好，尚未實測**——需要 Jenzo 手動連結一個測試帳號（見 `supabase/link_test_branch_user.sql`） |
| 10 | Staff Assignment History | **`VERIFIED`** | #9 | assignments 表含 start/end；調店不改寫歷史；離職=Deactivate（§22–23） | 本機測過＋2026-08-14 Jenzo 在 production 實際調店後確認 |
| 11 | Partner Login Users (P-07) | **`BLOCKED`** | Auth, #6 | 與 Staff 分離；SANCI Admin 建立/停用/復用（§24–27, 46） | **建立新帳號需要 Supabase service_role key，此環境未提供（刻意不給，見 LESSONS）。** Toggle 啟用/停用已做且不需要 service_role。畫面上已明確告知這個限制，不是假裝完成 |
| 12 | Partner / Branch Identity | `UNVERIFIED` | Auth | 登入即身份；不可自選 Branch；畫面永遠顯示 Partner+Branch+地址（§16, 26） | `/cabang` 已建：身份卡首頁、Staf、Profil Cabang、Akun Saya。無 Branch 切換器（設計上就沒做這個 UI 元件）。**尚無真實帳號可實測**——需要 Jenzo 跑 `supabase/link_test_branch_user.sql` |
| 13 | Permission Scope (P-08) | **`VERIFIED`** | DB, Auth | OWN_BRANCH 預設／PARTNER_ALL_BRANCHES／預留 SELECTED_BRANCHES；僅 SANCI Admin 可改（§28, 31, 47） | 2026-08-14 Jenzo 在 production 存過設定成功 |
| 14 | Cross-Branch Visibility | `UNVERIFIED` | #13 | View scope 依 policy 生效，Server/DB 層強制（§29–30, 33） | DB 層 RLS 已驗證（見 LESSONS #15 那輪測試）。**Partner 使用者視角（/cabang 首頁列出可見分店）本輪剛建好**——查詢直接吃 RLS 過濾結果，無額外邏輯；尚未有真實帳號可實測 |
| 15 | Cross-Branch Edit Permission | `UNVERIFIED` | #13 | View 與 Edit 分離（可看三店、只改自己）（§29–30） | 同上，/cabang 的 Staf 頁已依 edit_scope 顯示/隱藏編輯功能，尚未實測 |
| 16 | Audit Log | **`VERIFIED`**（寫入機制） | DB | 欄位含 before/after + server timestamp；append-only；動作清單 §66（§64–68） | DB trigger 自動寫入，本機測過所有 CRUD 動作都自動產生正確的 audit 記錄，不需手動呼叫。History 分頁（Partner/Branch）已接上讀取；Jenzo 未實際看過畫面 |
| 17 | Local Draft | `UNVERIFIED` | 前端 | 自動草稿；重進頁 Continue/Discard；草稿 > server > default；真寫入成功才清（§58） | 2026-08-14 實作 `web/lib/use-local-draft.ts` + `web/lib/draft-banner.tsx`：800ms 防抖寫 localStorage，key `sanci:draft:<form>:<id\|new>`（新增表單用 `new@<父層id>`，不同 partner/branch 的草稿不互相污染）；重開表單只跳橫幅問 Lanjutkan/Buang，**絕不靜默還原**；草稿只在 safe-write 確認成功那條路徑清除，清除時一併取消未觸發的防抖 timer；localStorage 全程 try/catch。套用於 8 個新增/編輯表單（權限設定與調店只有選項、無輸入文字，刻意不做）。**證據**：編譯後以假 React/DOM/localStorage 跑 32 項斷言（防抖、存檔內容、跨 record 隔離、失敗保留、成功清除、無殭屍寫入、無痕模式不崩）全過；typecheck ✓ build ✓。**未做真人重載測試**——待 Jenzo 實際打字→關頁→重開驗收 |
| 18 | Weak Network Protection | `UNVERIFIED` | #17 | 離線不假成功（"Saved on this device" ≠ "Created"）；timeout 用 idempotency + server lookup（§59–61, 63） | 2026-08-14 實作 `web/lib/safe-write.ts` + `web/app/admin/actions-lookup.ts`，兩段網路都包：伺服器→Supabase 用 `safeWrite()`（15 秒逾時＋**一律檢查 `{error}` 欄位**，supabase-js 失敗不會 throw）；瀏覽器→Server Action 用 `submitSafely()`（先看 `navigator.onLine` 再限時）。回應遺失時一律用 `client_request_id` 反查（SELECT，不重送 INSERT）：查到＝真成功、查無＝可安全重試、查不出＝**絕不宣稱成功**（黃色警示，與成功狀態視覺分明）。重試永遠沿用同一組 client_request_id。訊息全印尼文，無任何 Postgres/網路原始字串。**證據**：編譯後跑 29 項邏輯斷言（正常成功／硬 DB 錯誤／逾時但其實已寫入／逾時且未寫入／離線／反查失敗）全過；typecheck ✓ build ✓。**未做真人弱網測試**——本環境網路白名單擋 supabase.co，無法跑真流程 |
| 19 | Duplicate Submission Protection | `UNVERIFIED` | DB | DB unique + idempotency key + 防連點（disable 不是唯一防線）（§62, 73） | 2026-08-14 實作 `web/lib/use-submit-guard.ts`，套用於全部 9 個寫入表單：ref 鎖**同步**設在第一個 await 之前（單靠 `disabled` 擋不住同一 tick 的第二次點擊或 Enter＋點擊），成功路徑刻意不解鎖以免導航前閃出可點按鈕。另修：`client_request_id` 改成只有伺服器確認成功後才換新，未確認就關閉再開 modal 會沿用同一組（原本每次開都換新＝重試時失去 idempotency）；`client_request_id` 的 unique 衝突現在解讀為「上一次其實已寫入」而非「代碼重複」。DB unique constraint 與伺服器端 idempotency 查詢維持不變。typecheck ✓ build ✓（本機實跑）。**未做真人連點測試**——需 Jenzo 在 production 快速連點 Simpan 驗收，並回 Supabase Table Editor 確認只有一筆（鐵律 7）|
| 20 | Responsive Desktop | `PROTOTYPE` | — | ≥1200 sidebar+滿版工作區；1920 不留巨大空白；字級規範（§50–51, 77） | 未驗證 |
| 21 | Responsive Tablet | `PROTOTYPE` | — | 768–1199 重排，非縮小版（§55） | 未驗證 |
| 22 | Responsive Mobile | `PROTOTYPE` | — | <768 單欄；輸入高 48–52px 字 ≥16px；360/390/430 無橫向捲動；inputmode 正確（§52–54, 76） | 未驗證 |
| 23 | PWA Basics | `UNVERIFIED` | — | App shell cache；不做離線 master data CRUD；Permission/Delete/Activation 必須 Online（§85） | 2026-08-14 實作：`web/app/manifest.ts`（installable manifest，icons 192/512/maskable 512，用 sharp 產生的純色「S」圖示）＋ `web/app/icon.svg`（favicon）＋ `web/public/sw.js`（**只**攔截同源 GET：`_next/static`／`icons` 走 cache-first，因為是 hashed immutable 檔案；page navigation 走 network-first、離線才退到 `/offline`；其餘一律不攔截——非 GET／跨網域／RSC data fetch 全部直接放行，絕不快取 Supabase 資料，避免離線看到假成功或舊資料）＋ `web/app/offline/page.tsx`（純靜態、不呼叫 Supabase）＋ `web/app/sw-register.tsx`（註冊失敗不擋主流程）。**過程中發現並修正一個真 bug**：`middleware.ts` 原本的 matcher 沒排除 `sw.js`/`manifest.webmanifest`/`offline`，導致這三個路徑也被拉去跑 Supabase auth 檢查——本機測試沒有 Supabase env 時這三個路徑直接 500，等於離線後援機制本身依賴一個它應該要在離線時繞過的東西；已修 matcher 排除。**證據**：typecheck ✓ build ✓；`next start` 本機起服務後用 curl 逐一打 `/manifest.webmanifest`（200 application/manifest+json）、`/sw.js`（200 application/javascript）、`/offline`（200）、`/icon.svg`（200）、`/icons/icon-192.png`（200）全過；`/`（需要登入）本機無 Supabase env 仍 500，屬既有限制非本次改動造成。**未驗證**：真實瀏覽器「加到主畫面」安裝流程、Service Worker 實際離線攔截效果（navigator.onLine 場景）、Lighthouse PWA 分數——這些需要在 Vercel 上的真實 HTTPS 網址由 Jenzo 用手機/桌面瀏覽器測試，本環境的 `next start` 只能驗證路由本身有回應，無法驗證 SW 生命週期 |

## 基礎設施前置（阻塞真實作的項目）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 技術選型 | **已定案** | Next.js + Supabase（Jenzo 2026-08-14 確認） |
| Supabase Project | 已建立 | `atmlfbjbcwzsrsqibhan.supabase.co`，anon key 已提供（2026-08-14）。⚠️ 本開發環境網路白名單擋 supabase.co——AI 無法直連驗證，需 Jenzo 在 Claude Code 環境設定加 `*.supabase.co` |
| DB Schema + RLS + Audit | **`VERIFIED`(production)** | `0001` 已在 production 執行成功，2026-08-14。Jenzo 回貼結果核對一致：TABLES 9 / RLS_ENABLED 9 / POLICIES 19 / TRIGGERS 12（與本機測試數字完全相符）。行為測試（14 項斷言）先前已在本機驗證過同一份 SQL |
| Storage bucket + 政策（`0003`） | **`VERIFIED`(production)** | `0003` 已在 production 執行成功，2026-08-15。Jenzo 回貼結果核對一致：BUCKET 1 / BUCKET_PUBLIC true / STORAGE_POLICIES 4 / LOGO_URL_COLUMN 1（與 migration 檔內期望值完全相符）。`logo_url` 欄位本來就在 `0001`，0003 不重複加，只建 bucket＋storage RLS |
| Admin 綁定 | **`VERIFIED`(production)** | `0002` 執行成功，2026-08-14。SANCI Super Admin = `wahana.elite@gmail.com`（非最初假設的 a0988728823@gmail.com — repo 已同步更正）|
| Auth | `UNVERIFIED` | Email/password 登入流程已寫（web/），build 通過；無法連 DB 實測 |
| App 骨架 | `UNVERIFIED` | `web/` Next.js 15：login、/admin smoke、/cabang 身份卡。typecheck ✓ build ✓；runtime 未驗證 |
| Deployment | **Preview 部署中**（2026-08-14，2 次） | SPEC §98 原則上不部署，Jenzo 本人明確要求要能點連結測試，視為對自身指示的覆寫。Vercel 檔案直傳，環境變數以 `.env.production` 隨每次上傳帶入（未進 git）。第一次部署 Vercel 自動標成 `target: production`（新專案首次部署的平台行為）；第二次部署未被標為 production（`alias: []`），改用部署專屬網址。兩種情況都已如實告知 Jenzo |
| UI 主語言 | **已定案** | Bahasa Indonesia（Jenzo 2026-08-14 定案）。prototype 已全面印尼文化並通過 CJK/英文殘留掃描 |

## 已知刻意保留的「怪東西」

（看起來沒用但不能刪的東西記在這裡，免得被清掉）

| 位置 | 為什麼保留 |
|---|---|
| `prototype/` | 可點擊 UI prototype（假資料）。真系統上線後仍保留作為 UI 規格參照，除非 Jenzo 說刪 |

## 待辦

- [x] Jenzo 確認技術選型 → Next.js + Supabase（2026-08-14）
- [x] Jenzo 建立 Supabase Project 並提供 URL + anon key（2026-08-14；`atmlfbjbcwzsrsqibhan.supabase.co`）
- [x] Jenzo 定 UI 主語言 → Bahasa Indonesia（2026-08-14）
- [x] Prototype 驗收：Jenzo 確認 OK（2026-08-14；印尼文版待他再過目）
- [x] Jenzo 在 Supabase SQL Editor 執行 `supabase/migrations/0003_partner_logo.sql`（2026-08-15，四行驗證結果與期望值相符）
- [ ] **Jenzo 在 Ubah Partner 實際上傳一張 logo 測試**（阻塞 Partner Logo 標為 VERIFIED；換第二張圖確認畫面真的更新，不是舊圖）
- [ ] Jenzo 部署後用手機實際測「加到主畫面」＋離線開啟已看過的頁面，確認 PWA #23 的 Service Worker 真的生效（本環境只驗證到路由本身有回應，見上方 #23）
- [ ] 之後依 SPEC §90 順序實作（Tests → Security test → Offline test → Self audit → Final verification）

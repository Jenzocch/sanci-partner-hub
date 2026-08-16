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

- Build：✓（`npm run build`，本機實跑）
- Type Check：✓（`npm run typecheck`，本機實跑）
- Lint：✓ 2026-08-15 補上（專案原本沒有 `eslint.config.mjs` 也沒有 `lint` script，SPEC §95 要求但一直缺）。裝 `eslint` + `eslint-config-next@^15.5`（版本對齊 `next@^15.5`，不是 npm 預設裝的 16.x）＋ `next/core-web-vitals`、`next/typescript` 規則集。跑出兩個真錯誤：`app/offline/page.tsx` 用 `<a>` 沒用 `<Link>`（**刻意保留**，離線頁「再試一次」需要真的整頁重新整理去重新確認網路，不要客戶端轉場——已加 eslint-disable 並附理由註解）；`next-env.d.ts` 的 triple-slash reference（Next.js 自動產生、不可手動改的檔案，加進 ignores）。修完 `npm run lint` 乾淨過。**其餘功能程式碼本身沒有 lint 錯誤**——這輪只有 2 個問題，都在剛加的 PWA 檔案裡
- 其餘（Tests/Permission/RLS/Duplicate/Weak network/Responsive/Audit）：狀態詳見下方逐項功能表，多數已本機邏輯測過但**未經 Jenzo 在 production 真人驗證**，不能算全綠

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
| 20 | Responsive Desktop | `UNVERIFIED` | — | ≥1200 sidebar+滿版工作區；1920 不留巨大空白；字級規範（§50–51, 77） | `web/app/globals.css` 已寫 `.shell`（sidebar 220px + `.main{flex:1}` 滿版工作區）＋ `.cardgrid-two` 在 ≥1100px 轉兩欄；不是 max-width 900px 置中留白的寫法。2026-08-15 用本機 Chromium（Playwright，`executablePath:/opt/pw-browsers/chromium`）在 1366/1440/1920px 對 `/`（登入頁）與 `/offline` 實際截圖＋量 `scrollWidth vs clientWidth`：**兩頁在全部寬度都無橫向捲動**。**這只涵蓋不需登入的兩頁**——真正吃到 sidebar/table workspace 規則的 `/admin`、`/admin/partners/[id]` 等頁面本環境連不上 Supabase 無法登入，尚未截圖驗證，仍待 Jenzo 在 production 用真帳號在 1366/1440/1920 檢查（§77） |
| 21 | Responsive Tablet | `UNVERIFIED` | — | 768–1199 重排，非縮小版（§55） | 同上，CSS media query 在 768px 切到行動版 nav；768/1024px 下登入頁與 offline 頁截圖確認無橫向捲動。admin/cabang 頁面在 tablet 寬度下的實際重排未截圖驗證 |
| 22 | Responsive Mobile | `UNVERIFIED` | — | <768 單欄；輸入高 48–52px 字 ≥16px；360/390/430 無橫向捲動；inputmode 正確（§52–54, 76） | CSS 已用 16px input 字級（避免 iOS 自動放大）、textarea 地址欄、`.side` 在 <768px 轉水平捲動 nav。2026-08-15 截圖 360/390/430px：登入頁與 offline 頁**無橫向捲動**。`/cabang` 系列頁（真正的手機優先介面，§48 的身份卡/大按鈕）需要真帳號才能進，本環境無法登入，尚未截圖；inputmode（WhatsApp 用 tel）等細節也未逐一截圖核對 |
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
| Deployment | **已上線（production，持續部署）** | SPEC §98 原則上不部署，Jenzo 本人明確要求要能點連結測試，視為對自身指示的覆寫。**2026-08-16 核對更正**：不是零星 preview，是接了 GitHub → Vercel 持續部署，main 每次 push 都自動變成新的 production deployment。正式網址：`https://sanci-partner-hub.vercel.app`。最新 production deployment 對應 commit `d971216`，狀態 READY（用 Vercel MCP `list_deployments` 查證，不只信文件）。**含意**：往後任何 push 到 main 都是真的上線動作，不是內部測試——包含 Phase 2 的每一次 commit |
| UI 主語言 | **已定案** | Bahasa Indonesia（Jenzo 2026-08-14 定案）。prototype 已全面印尼文化並通過 CJK/英文殘留掃描 |
| Dependency 弱點（`npm audit`） | **已知風險，未修** | 裝 ESLint 相依套件時發現 3 個 high severity（`postcss`、`sharp`，都是 `next@15.5` 內部依賴的舊版本）。修法是升級到 `next@16.3.1`，但那是 major version、有 breaking change，超出本輪「補 Lint」範圍，也不該不問就升。Sharp 只在 build time／`next/image` 最佳化用到，不會被瀏覽器直接載入執行，短期風險有限。**待 Jenzo 決定**：要不要排時間測 Next 16 升級 |

## Phase 2（Customer & Partner Order Module）— 範圍已開放

> 2026-08-16 Jenzo 明確要求開始開發，正式跨出 SPEC-PHASE1.md §0/§9 原本「嚴禁擴張」的邊界。完整願景規格見 `docs/SPEC-PHASE2.md`（122 節，Jenzo 提供）。**本表只列第一個開發切片（MVP）**——範圍由 Jenzo 三個決定定案：① 最小版（Customer + 簡單 Order，不連 SANCI 真實商品/庫存資料庫）；② 分店端可建立＋唯讀看狀態（不可編輯/取消）；③ 完成標準＝分店建單＋SANCI看得到＋Partner/Branch 隔離驗證通過。SPEC-PHASE2.md 其餘章節（Edit／Cancel／Attribution Correction／Package 主檔管理／Duplicate Merge 等）留待下一切片，不在本輪範圍。

| # | 功能 | 狀態 | 依賴 | 對應 SPEC-PHASE2 章節 | 備註 |
|---|---|---|---|---|---|
| P2-1 | Customer Quick Create | `UNVERIFIED` | DB, Auth | §4–5, 7–9 | 2026-08-16 實作：`/cabang/pesanan/baru`（手機優先；電話 debounce 查重；server 端重算 phone_normalized 不信 client）。typecheck/lint/build ✓。**待 Jenzo production 實測** |
| P2-2 | Duplicate Customer Detection | `UNVERIFIED` | P2-1 | §10–11 | 查重失敗**不會**顯示「查無此人」（顯示重試提示，§84）；跨 Partner 零洩漏已在本機 Postgres 行為測試驗證（見 P2-7）。本切片刻意不做「Create New Anyway + Reason」override（§10 後半），找到既有客戶只能沿用 |
| P2-3 | Customer Search | `UNVERIFIED` | P2-1 | §45–46, 75 | admin 端搜尋（order number/名字/電話）server 端過濾；cabang 列表 limit 100＋client 過濾（量大時要回頭做分頁，已知簡化）。`phone_normalized` 有 index |
| P2-4 | Partner Order Create | `UNVERIFIED` | P2-1, Phase1 Branch/Staff | §13–14, 17–19, 24 | partner_id/branch_id server 端查表帶入＋**DB INSERT policy 強制**等於自己身份；order number DB 端產號（`GH-CBR-YYMMDD-0001`，雅加達時區，counter 表＋unique 雙防線，200 併發壓測零重號）；Sales/PIC 必須是本分店 active staff（server 驗＋DB trigger 驗）；Customer+Order 兩段寫入，部分失敗明確告知不假裝全成（§70） |
| P2-5 | Order 唯讀檢視（分店端／cabang） | `UNVERIFIED` | P2-4 | §44, 54–55 | `/cabang/pesanan`（卡片式列表＋搜尋）＋ `[orderId]` 詳情。無編輯/取消按鈕（本切片唯讀）；DB 層分店對 orders **無任何 UPDATE/DELETE policy** |
| P2-6 | SANCI Order 總覽（admin） | `UNVERIFIED` | P2-4 | §44 | `/admin/orders`：寬表格＋搜尋＋status 篩選＋attribution 醒目；三態分明；limit 50 |
| P2-7 | Partner/Branch Attribution 隔離 | `UNVERIFIED`（本機行為測試 PASS） | P2-4 | §14–15, 47, 89–91 | 沿用 Phase 1 `fn_can_view_branch`；customers 可見性走新的 **security definer** `fn_can_view_customer`（LESSONS #15 防範，migration 內含 naive 版對照證明）。0004 撰寫時在本機 Postgres 16＋Supabase shim 實跑行為測試：跨 Partner 電話搜尋零洩漏、偽造 attribution 全被 DB 拒、OWN_BRANCH/PARTNER_ALL_BRANCHES 行為正確。**production 尚未驗證** |
| P2-8 | Customer/Order Audit | `UNVERIFIED` | P2-1, P2-4 | §61–63 | `fn_audit_row` 延伸 CUSTOMER/ORDER 前綴（整支重定義保持冪等）；customers 的 partner/branch 從 created_via_* 取；本機測過 CUSTOMER_CREATED/ORDER_CREATED/ORDER_STATUS_CHANGED 且 Phase 1 動作不受影響。⚠️ 已知運維陷阱：日後若單獨重跑 0001 會蓋掉名稱對應，需重跑 0004 復原（migration 註解有記） |
| P2-9 | Local Draft / Weak Network / Duplicate Submission | `UNVERIFIED` | P2-1, P2-4 | §21(spec22), 65–70 | 全部重用 Phase 1 基建：`use-local-draft`（key 含 branch 隔離）、`safe-write`（含 request id 反查）、`use-submit-guard`。customer/order 各自帶 `:customer`/`:order` 後綴的 idempotency key，retry 沿用同組 |
| P2-10 | Responsive（沿用 Phase 1 CSS 慣例） | `UNVERIFIED` | 上述全部 | §77–80 | 沿用既有 class（.shell/.chip/.searchrow 等），零新樣式系統。未截圖驗證（本環境無法登入） |

### Phase 2 第二切片（Order Edit + Cancel，2026-08-16）

| # | 功能 | 狀態 | 對應 SPEC-PHASE2 章節 | 備註 |
|---|---|---|---|---|
| P2-11 | Order Edit（分店端） | `UNVERIFIED` | §36–37, 47–49 | 編輯 modal：Package/Sales/PIC/備註；attribution 欄位不出現在表單且 **DB trigger 拒改**（含把別店訂單搬到自己店的路徑，本機測試 C3）；Sales/PIC 名單取自**訂單所屬分店**的 active staff（跨店編輯情境）；草稿隔離（key 含 orderId）；UPDATE 後驗 rowcount，RLS 擋下（0 rows）不顯示成功。typecheck/lint/build ✓ |
| P2-12 | Cancel Order（分店端） | `UNVERIFIED` | §41–43, 96–97 | 確認對話框＋理由必填（4 選項，Lainnya 附文字欄）；`cancelled_at/by` 由 DB trigger 強制填（client 傳值被覆蓋，本機測試 A12）；取消後全面唯讀（DB 強制）；audit 記 `ORDER_CANCELLED` 且理由入 reason 欄；已取消訂單列表不消失、詳情顯示取消資訊 |
| P2-13 | Edit 權限（DB 層） | `UNVERIFIED`（本機 65 項斷言全過） | §47–49 | UPDATE policy 只走 `fn_can_edit_branch`；不可變欄位 8 欄 trigger 守護（policy 看不到 OLD 值，必須用 trigger——見 0005 註解）；customers 無 UPDATE、orders 無 DELETE（刻意負面斷言）；un-cancel 僅 admin |

### Phase 2 第三切片（Package 主檔 + Customer Edit + Attribution Correction，2026-08-16）

| # | 功能 | 狀態 | 對應 SPEC-PHASE2 章節 | 備註 |
|---|---|---|---|---|
| P2-14 | Partner Packages 主檔（admin 管理） | `UNVERIFIED` | §21–23 | partner 詳情頁新增 Package 分頁（列表/Tambah/Ubah/停用）；unique(partner_id,code)；分店唯讀；audit 前綴 PACKAGE |
| P2-15 | 建單/編輯的 Package 下拉 | `UNVERIFIED` | §21 | 有 ACTIVE package → dropdown（送 package_id＋server 端以 DB name 覆寫快照）；零 package 或表未建 → 無縫退回自由文字；「Lainnya」選項退回手動輸入 |
| P2-16 | Customer 列表/詳情/編輯（cabang） | `UNVERIFIED` | §31, 33–35, 52–53 | `/cabang/pelanggan`：卡片列表＋電話/名字搜尋；詳情含訂單歷史；編輯僅限自己分店建檔的客戶（DB `c_partner_update` 強制）；改電話 server 重算 phone_normalized，audit 記 CUSTOMER_PHONE_CHANGED |
| P2-17 | Attribution Correction（admin） | `UNVERIFIED` | §16, 64 | `/admin/orders/[orderId]` 詳情頁＋Koreksi Cabang modal（同 partner 分店、理由必填）；走 security definer RPC，audit 記 ORDER_ATTRIBUTION_CORRECTED 含 reason；重試冪等（已在目標分店＝no-op 成功不重複記 audit） |
| P2-18 | 訂單列表狀態篩選 chip | `UNVERIFIED` | §97 | Semua/Terdaftar/Dibatalkan，client 端過濾 |

**Migration `0007_audit_fixes.sql` 狀態**：已寫好＋本機行為測試全過（P0 14/14、P1 7/7、468 行矩陣零回歸、冪等×4）。**修復內容**：①P0——customers/partner_staff 的 SELECT policy 不再回查自己那張表（真正機制：Postgres 同指令插入列對指令內查詢不可見，與 STABLE 無關——分店 INSERT…RETURNING 因此全滅），改為直接吃列上欄位＋security definer 輔助函式，語意零變動；②P1——`fn_next_order_seq` 對 public/anon/authenticated 全 revoke（原本未登入都能亂灌別家流水號），另 9 個 trigger 函式一併鎖上，10 個 policy 輔助函式明確 grant（revoke 它們會讓查詢直接報權限錯誤而非 0 列——實測過）；③0001 回填 LEFT JOIN（重跑不再復活 0006 修的 bug）；④0003 補前置守衛；⑤新增 `migrations/README.md`（重跑鐵則＋各檔期望值）。**未在 production 執行。**

**Migration `0008_packages_customer_edit_attribution.sql` 狀態**：已寫好＋本機行為測試全過（K/C/R 三組 38 項、矩陣零回歸、冪等×4）。內容：partner_packages 表＋orders.package_id（含 fn_check_order_refs 驗 package 歸屬——RLS 管不到欄位內容，防 POST 別家 package id）＋customers 分店 UPDATE policy 與不可變欄位守衛＋`fn_correct_order_attribution` RPC。**已知缺口（記錄於檔內）**：phone_normalized 守衛只擋空值、擋不了「過期值」——鐵則：任何動 phone 的 Server Action 必須同時送重算好的 phone_normalized（現有 action 已遵守）。**未在 production 執行；必須在 0007 之後跑。**

**第二切片已知限制**（刻意接受，非遺漏）：
- 訂單原 Sales 已停用時，編輯任何欄位都要先重選在職 Sales 才能存檔（dropdown 只列 active staff）——體驗有刺但不違規，下輪再議
- 兩人同時操作、一人剛取消的窄競態：另一人收到通用錯誤訊息而非「訂單剛被取消」——不會假成功，可接受
- 列表 Terdaftar/Dibatalkan 篩選 chip（§97）未做（已取消訂單本就不會從列表消失；0005 已預建 `(branch_id, status)` index，chip 下輪補）
- SQL Editor（無 session）手動改已取消訂單會被 trigger 擋——刻意設計，正規繞道寫在 0005 檔頭註解

**Migration `0005_order_edit_cancel.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-16 Jenzo 執行成功並回貼驗證結果，11 項數字與期望值完全相符：CANCEL_COLUMNS 3 / ORDER_POLICIES 4 / ORDER_UPDATE_POLICY 1 / CUSTOMER_UPDATE_POLICY 0 / ORDER_DELETE_POLICY 0 / ORDER_TRIGGERS 7 / GUARD_FUNCTIONS 2 / REFS_ON_UPDATE 1 / AUDIT_CANCEL 1 / AUDIT_KEEP_0004 1 / AUDIT_REASON 1（含兩項「刻意為 0」的負面斷言：customers 無 UPDATE、orders 無 DELETE）。本機行為測試 65/65 PASS、冪等重跑 5 次不變。⚠️ 0005 之後 0004 檔尾數字為 POLICIES 7 / TRIGGERS 10 / INDEXES 11——重跑 0004 驗證段時以此為準。**DB 層已就緒；功能表各項仍為 UNVERIFIED，待 Jenzo 真人跑過 UI 流程才升級。**

**Migration `0006_own_branch_without_policy.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-16 Jenzo 執行成功並回貼驗證結果，六項與期望完全相符：VIEW_LEFT_JOIN 1 / EDIT_LEFT_JOIN 1 / VIEW_INNER_JOIN 0 / EDIT_INNER_JOIN 0 / PARTNER_TANPA_KEBIJAKAN 2 / PENGGUNA_TERTOLONG 1。後兩項證實根因：production 兩個 Partner 都從未儲存過權限設定（無權限列），測試帳號 gh.bsd 因此全盲，0006 後恢復。本機 432 行行為矩陣 before/after diff 僅含預期變更（無權限列 partner 恢復 OWN_BRANCH 等效行為），其餘身分零回歸。

**Migration `0004_customer_order.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-16 Jenzo 在 Supabase SQL Editor 執行成功並回貼驗證結果，七項數字與期望值完全相符：TABLES 3 / RLS_ENABLED 3 / POLICIES 6 / TRIGGERS 8 / INDEXES 10 / FUNCTIONS 5 / AUDIT_MAP 1（本機 Postgres 16 行為測試先前已全過；冪等重跑 3 次不變）。注意：0005 跑完後這些數字會變為 POLICIES 7 / TRIGGERS 10 / INDEXES 11。

**本輪刻意簡化、偏離 SPEC-PHASE2.md 字面建議之處**（已知，非遺漏）：
- Package 本輪用 `partner_orders.package_name`（自由文字）呈現，**不建立** `partner_packages` 主檔表（SPEC §21）。理由：先讓分店填得出訂單，Package 主檔管理 UI 留到下一切片，避免第一刀範圍過大；`package_name` 之後要接管理表不會動到既有資料（改天加 `package_id` nullable 欄位即可）。
- Cancel Order（§41–43）、Order/Customer Edit（§33–37）、Attribution Correction（§16）**全部留到下一切片**——本輪分店端唯讀，降低第一次上線的權限面。

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
- [ ] Jenzo 用真帳號登入後，在 1366/1440/1920（desktop）與 360/390/430（mobile）檢查 `/admin`、`/admin/partners/[id]`、`/cabang` 系列頁（本環境已截圖驗證登入頁與 offline 頁在全部寬度無橫向捲動，但這兩頁不吃 sidebar/table/身份卡 規則，見 #20–22）
- [ ] 之後依 SPEC §90 順序實作（Tests → Security test → Offline test → Self audit → Final verification）

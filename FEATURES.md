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
| 11 | Partner Login Users (P-07) | `UNVERIFIED`（原 `BLOCKED`，2026-08-17 解除） | Auth, #6 | 與 Staff 分離；SANCI Admin 建立/停用/復用（§24–27, 46） | **解除方式**：Jenzo 在 Vercel 設 `SUPABASE_SERVICE_ROLE_KEY` 環境變數（金鑰不進 git、不進對話、不進瀏覽器 bundle）。Partner 詳情頁 Akun 分頁新增「+ Tambah Akun」：Nama／Cabang／Email（自動建議 `<partner_code>-<branch_code>@sanci.com`）／初始密碼（可自動產生，crypto 安全亂數）。`email_confirm: true`（店家無真信箱）。密碼**只顯示一次**，關閉後查不回來。**安全設計**：admin 身分先用使用者自己的 session client 驗證，通過後才建 service_role client；service_role **只用於 auth.admin.createUser／deleteUser**，`partner_users` 連結列走一般 client 讓 RLS 再擋一次（縱深防禦）。**兩段寫入補償**：連結失敗時先反查確認狀態——查到＝其實成功、查無＝刪掉孤兒 auth 帳號、查不出＝**不刪**並誠實回報部分狀態（刪掉可能毀掉正常帳號）。`createUser` 本身逾時時**刻意不以 email 搜尋刪除**（可能命中既有帳號，包括 admin 自己的），回報「無法確定，請勿重建」。**驗證**：bundle 掃描確認 43 個 client chunk 零 service_role 字樣，且反向驗證掃描有效（同檔案找得到 UI 字串）。**待 Jenzo 設好環境變數後實測** |
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
| P2-4 | Partner Order Create | **`VERIFIED`** | P2-1, Phase1 Branch/Staff | §13–14, 17–19, 24 | partner_id/branch_id server 端查表帶入＋**DB INSERT policy 強制**等於自己身份；order number DB 端產號（`GH-CBR-YYMMDD-0001`，雅加達時區，counter 表＋unique 雙防線，200 併發壓測零重號）；Sales/PIC 必須是本分店 active staff（server 驗＋DB trigger 驗）；Customer+Order 兩段寫入，部分失敗明確告知不假裝全成（§70） |
| P2-5 | Order 唯讀檢視（分店端／cabang） | `UNVERIFIED` | P2-4 | §44, 54–55 | `/cabang/pesanan`（卡片式列表＋搜尋）＋ `[orderId]` 詳情。無編輯/取消按鈕（本切片唯讀）；DB 層分店對 orders **無任何 UPDATE/DELETE policy** |
| P2-6 | SANCI Order 總覽（admin） | **`VERIFIED`** | P2-4 | §44 | `/admin/orders`：寬表格＋搜尋＋status 篩選＋attribution 醒目；三態分明；limit 50。**證據（2026-08-17）**：Jenzo 於 production 以分店帳號建立首筆真實訂單 `GH-GH-BSD-260817-0001`（客戶 Ani／Paket A／Sales+PIC Agus），並以 admin 帳號在 `/admin/orders/[orderId]` 詳情頁看到完整資料＋attribution 卡＋ORDER_CREATED audit（截圖回傳）——分店建單→admin 可見→audit 寫入 整條鏈在 production 驗證。P2-4 同此證據升級 VERIFIED |
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

**Migration `0007_audit_fixes.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-17 Jenzo 執行成功並回貼，十項數字與期望完全相符（CUSTOMER/STAFF_READ_NO_SELFLOOKUP 1/1、NEW_HELPERS 2、SEQ_EXEC_* 0/0/0、TRIGGER_FN_TERKUNCI 9、POLICY_HELPER_EXEC 10、VIEW/EDIT_LEFT_JOIN 1/1）。分店建單的 P0 至此在 production 修復。本機測試（P0 14/14、P1 7/7、矩陣零回歸、冪等×4）先前已全過。**修復內容**：①P0——customers/partner_staff 的 SELECT policy 不再回查自己那張表（真正機制：Postgres 同指令插入列對指令內查詢不可見，與 STABLE 無關——分店 INSERT…RETURNING 因此全滅），改為直接吃列上欄位＋security definer 輔助函式，語意零變動；②P1——`fn_next_order_seq` 對 public/anon/authenticated 全 revoke（原本未登入都能亂灌別家流水號），另 9 個 trigger 函式一併鎖上，10 個 policy 輔助函式明確 grant（revoke 它們會讓查詢直接報權限錯誤而非 0 列——實測過）；③0001 回填 LEFT JOIN（重跑不再復活 0006 修的 bug）；④0003 補前置守衛；⑤新增 `migrations/README.md`（重跑鐵則＋各檔期望值）。**未在 production 執行。**

**Migration `0008_packages_customer_edit_attribution.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-17 Jenzo 執行成功並回貼，23 項數字與期望完全相符（含三個刻意為 0 的負面斷言：PACKAGE_WRITE_POLICIES / RPC_EXEC_ANON / CUSTOMER_DELETE_POLICY）。**至此 0001–0008 全部已在 production 套用**。本機測試（38 項、矩陣零回歸、冪等×4）先前已全過。內容：partner_packages 表＋orders.package_id（含 fn_check_order_refs 驗 package 歸屬——RLS 管不到欄位內容，防 POST 別家 package id）＋customers 分店 UPDATE policy 與不可變欄位守衛＋`fn_correct_order_attribution` RPC。**已知缺口（記錄於檔內）**：phone_normalized 守衛只擋空值、擋不了「過期值」——鐵則：任何動 phone 的 Server Action 必須同時送重算好的 phone_normalized（現有 action 已遵守）。**未在 production 執行；必須在 0007 之後跑。**

### Phase 2 第四切片（訂單路徑 + Invoice + 到店標記 + SANCI 內部備註，2026-08-17，Jenzo 定案）

商業規則（Jenzo 原話翻譯）：分店建單分兩路——①客戶已在店購買 SANCI 商品→直接出貨；②客戶會來 SANCI 看其他產品（到店選品，Phase 3 的地基現在先做標記與到店紀錄）。分店回報客戶在店消費金額/上傳 invoice，SANCI **人工**判斷對應方案（系統不算折扣不碰定價）；判斷結果記在分店永遠看不到的內部備註。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-19 | Jalur Pesanan（DIRECT_DELIVERY/SHOWROOM_VISIT） | `UNVERIFIED` | 建單必選（卡片式雙選項）；可編輯；admin 列表有欄位＋篩選 |
| P2-20 | 消費金額＋Invoice 上傳 | `UNVERIFIED` | 金額選填（IDR 即時格式化，上限對齊 DB numeric(15,2)）；invoice 進**私有** bucket `order-invoices`（分店只能傳自己可編輯訂單的、看自己可見的；顯示走 signed URL）；上傳失敗不拖垮訂單（比照 logo 模式） |
| P2-21 | 到店標記（情境② 現在做的部分） | `UNVERIFIED` | admin 按「Tandai Pelanggan Sudah Tiba」；時間/操作者 server 強制（假值被覆寫，本機測試 T04）；分店連建單夾帶都被 DB 拒（T03）；分店端顯示綠色「已到店」banner；audit 記 ORDER_CUSTOMER_ARRIVED |
| P2-22 | SANCI 內部備註 | `UNVERIFIED` | `order_internal_notes`：**分店零 policy（連 SELECT 都沒有，本機 N05–N06b 含最寬權限帳號全 0 列）**；append-only（admin 也不能改/刪）；含 client_request_id 防弱網重複（整合時補上並實測 unique 擋下） |

**Migration `0009_fulfillment_invoice_arrival.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-17 Jenzo 執行成功並回貼，36 項數字與期望完全相符（含 INVOICE_BUCKET_PUBLIC false、NOTES_NON_ADMIN_POLICIES 0、NOTES_UPDATE_DELETE_POLICIES 0、NOTES_IDEMPOTENCY_KEY 1、六個 audit 保留斷言全 1）。本機 74 案行為測試先前已全過。期望驗證數字 36 項，關鍵：INVOICE_BUCKET_PUBLIC **false** / NOTES_NON_ADMIN_POLICIES **0** / NOTES_UPDATE_DELETE_POLICIES **0** / NOTES_IDEMPOTENCY_KEY 1 / ORDER_NEW_COLS_NOT_FROZEN 1。⚠️ 0009 後舊檔數字：0001 RLS_ENABLED 14 / POLICIES 31 / TRIGGERS 23；0004 TRIGGERS 12；0005 ORDER_TRIGGERS 8（詳見 migrations/README.md）。**storage 的 5MB/MIME 限制與私有 bucket 的 signed URL 行為只能在真 Supabase 驗**（本機 shim 測不到，已標註）。已知過渡限制：0009 未跑前，建單表單填的路徑/金額會被 42703 降級靜默丟棄（欄位不存在無處可存）——跑完 0009 即消失。

### Phase 2 第五切片（SANCI 產品目錄，2026-08-17，Jenzo 定案）

決策：庫存只顯示三種狀態（Tersedia/Terbatas/Habis，不放數量——過期數字比沒數字更誤導）；目錄可見權限**每 Partner 開/關**（預設關，SANCI 主動開通）；**完全零價格**（方案由 SANCI 人工報，與折扣判斷原則一致）。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-23 | 產品管理（admin `/admin/produk`） | `UNVERIFIED` | 照片網格＋Tambah/Ubah＋庫存狀態快速切換＋上下架；照片走公開 bucket `product-photos`（一產品一路徑 upsert＋`?v=` 防快取，LESSONS #22）；DB 層用負面斷言釘死不准偷加價格/數量/partner_id 欄位 |
| P2-24 | 目錄開關（每 Partner） | `UNVERIFIED` | Partner 詳情頁權限分頁的「Katalog Produk SANCI」toggle；無列＝關（fail-closed——選配功能與 0006 的核心路徑 fail-open 相反，刻意）；audit 記 CATALOG_ACCESS_* |
| P2-25 | 目錄瀏覽（cabang `/cabang/produk`） | `UNVERIFIED` | 手機照片網格＋搜尋＋kategori 篩選＋詳情 modal；缺貨灰化照常顯示（誠實告知）；「未開通」（提示聯繫 SANCI）與「空目錄」分開顯示；INACTIVE 產品對分店即時消失；零價格 |

### Audit round 3（安全＋正確性全面審計，2026-08-17）

Jenzo 指示「認真 audit」。四領域分工,安全與正確性兩塊由 Opus 完成(UI/UX 與效能兩塊首輪遭額度中斷,**已於 2026-08-21 補跑完畢**——見下方「UI/UX 與效能 audit 補跑」段落)。

**結論:P0 = 0、安全 P1 = 0** — 跨 Partner 邊界(P0 原則)逐條追過守住:三個 storage bucket 路徑約定、order_internal_notes、audit_logs 全部確認分店無可達路徑;13 處 embed cast 的 null 防護無一遺漏;所有寫入身分皆 server 端查表核發,無 client 傳值決定權限的路徑。

**修掉 13 項**(commit `74d0e69` 程式層 + `f9cfc94` DB 層):

| 級別 | 問題 | 修法 |
|---|---|---|
| **P1** | 建單「Jalur Pesanan」必填但欄位缺失時被靜默丟棄且報成功——資訊 100% 蒸發(不像 package 有文字備援),事後無法區分「沒問」與「問了被吃掉」;連帶 SHOWROOM_VISIT 訂單的「客人已到」按鈕永不出現 | 兩層:表單先探測欄位存在才渲染問題;server 端若仍被丟棄則降級為 partial 誠實回報 |
| P2 | `transferStaff` 第一段寫入未驗 rowcount → 同 partner 內 view-only 分店可**兼併**別店員工(同時掛兩店、進對方業績下拉),UI 報成功 | `.select("id").maybeSingle()`,0 列即中止不 insert |
| P2 | `fn_check_order_refs` 漏驗 `customer_id` → 塞別家客戶 UUID 可讓對方客戶個資變可讀(今日無枚舉管道,但 UUID 一旦外流即 P0) | 0011 補對稱檢查;測試證明守衛真的是原因(先確認讀不到,再用維護管道建立連結證明會變讀得到) |
| P2 | `toggleUserStatus`/`setPartnerStatus`/`deleteDraftPartner`/`setCatalogAccess` 四處 RLS 靜默 0 列回報成功 | 全部加 rowcount 驗證 |
| P2 | admin/orders 列表 Jalur 查詢丟棄 error,配合篩選器把 DB 錯誤變「0 筆訂單」 | 解構 error,降級為隱藏欄位而非顯示空值 |
| P2 | admin 與 cabang 詳情頁降級規則**相反**:admin 把「讀不到」畫成「沒填」,「客人已到」按鈕無聲消失 | 兩端統一三態(ok / missing-column / error) |
| P2 | 內部備註表單承諾「不會重複儲存」但沒帶 idempotency key(DB 欄位早已存在,程式沒接上;註解還是過期的錯誤資訊) | 接上 client_request_id 三段式 |
| P2/P3 | audit 標籤:`STAFF_DEACTIVATED`/`USER_DISABLED`/`STAFF_ASSIGNMENT_CHANGED` 皆為**死代碼**(DB 實發 `_STATUS_CHANGED`/`_UPDATED`);`ENDED`/`DISABLED`/兩個 access scope/`SYSTEM` 缺標籤 → 停用員工/停用帳號/改權限三個最常用動作都漏英文碼 | 補齊並註明哪些是死代碼 |
| P3 | `sanci_catalog_access.enabled` DEFAULT `true` 與程式端「無列=關」相反 → 未來批次腳本會一次打開所有 Partner 目錄 | 0011 改 `default false`(升級路徑實測既有開/關值不變) |
| P3 | `invoice_url` 可指向別張訂單路徑(檔案不外洩但 admin 看到錯的發票) | 0011 加專屬 guard trigger,僅在值變動時檢查 |
| P3 | invoice signed URL TTL 兩端不一致(300 vs 3600);package 下拉載入錯誤被當成「沒有 package」;金額在 audit diff 顯示生數字 | 全部對齊/修正 |

**已知並接受**(記錄避免下輪重複判定):`fn_invoice_order_branch` 對 anon 開放 EXECUTE 是 0009 作者評估後的取捨(不 grant 會讓 storage 操作全炸,LESSONS #26 反向坑),僅洩漏 order→branch 對應無業務欄位。

**Migration `0011_audit_hardening.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-17 Jenzo 執行成功並回貼，34 項數字與期望完全相符（含 REFS_EXEC_PUBLIC 0 / ACCESS_DEFAULT_TRUE 0 / ORDER_DELETE_POLICY 0 等負面斷言與兩個 audit 保留斷言）。本機測試:客戶檢查 21 項、invoice 路徑 19 項、真實升級路徑實測、四套既往測試逐字零回歸、冪等×3。0011 後舊檔數字:0001 TRIGGERS 24 / 0004 TRIGGERS 13 / 0005 及 0009 ORDER_TRIGGERS 9(全部源於新增的 `trg_order_invoice_path`)。

**Migration `0010_sanci_product_catalog.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-17 Jenzo 執行成功並回貼，46 項數字與期望完全相符（含全部負面斷言與九個 audit 保留斷言）。**0001–0011 全鏈至此皆已在 production 套用並驗證。**本機行為測試 9 組先前全過、四套既往測試逐字零回歸、冪等×3。期望數字 46 項，關鍵負面斷言：PRODUCT_NO_PARTNER_COLUMN 0 / PRODUCT_NO_PRICE_COLUMN 0 / PRODUCT_NO_STOCK_QTY_COLUMN 0 / PRODUCT_PARTNER_WRITE_POLICIES 0 / ACCESS_PARTNER_WRITE_POLICIES 0；PHOTO_BUCKET_PUBLIC **true**（產品照公開＝刻意，行銷素材；目錄「清單」仍被 RLS 擋——已知邊界：拿到照片網址的人可直開）。0010 後 0001 數字：RLS_ENABLED 16 / POLICIES 35。storage 的 5MB/MIME/公開讀實效仍需 production 驗證。

### UI 全面改版（Apple 風設計系統 v2，2026-08-17，Jenzo 指示）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 設計系統（globals.css v2） | `UNVERIFIED` | 全面重寫：token 化字級表（正文手機 17px/桌面 16px，全系統最小 13px，輸入 ≥16px 防 iOS 縮放）、Apple 風配色（#f5f5f7 底/白卡/#1d1d1f 墨）、圓角/陰影/動效、深色模式、reduced-motion。檔頭含 STYLE CONTRACT（後續開發的樣式依據——**新頁面照合約用 class，不寫 inline style**） |
| 空間利用 | `UNVERIFIED` | 桌面 240px sidebar＋工作區吃滿（1920→1680px 實用寬、表格 1582px、列高 57px）；表單 720px 靠左；768–899px 改頂部橫向 nav（240 rail 會擠死平板工作區）；手機單欄大按鈕。Playwright 28 組截圖驗證：全寬度零橫向捲動、零 <13px 文字、觸控目標全 ≥44px |
| 標籤排序（使用邏輯） | `UNVERIFIED` | cabang 首頁：+Pesanan Baru（填色 CTA 最重）→ Daftar Pesanan → Pelanggan → Staf → 其他分店 → Profil/Akun → Keluar；admin 側欄：Pesanan Partner（日常）→ Partner（設定） |
| 全頁面套用 | `UNVERIFIED` | admin 7 檔＋cabang 21 檔逐頁清理：~54 處 inline style 換合約 class、列表改 .reccard 卡片式、篩選改 segmented、loading 改 skeleton。文案逐一檢查已是日常印尼語（零改動需要）。**純外觀零邏輯變動**（diff 掃描確認無查詢/action 改動） |

以上待 Jenzo 用真帳號在手機＋桌面實看後升級 VERIFIED。

### 三語系（印尼文／英文／簡體中文，2026-08-17～18，Jenzo 指示）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 三語系文案架構 | `UNVERIFIED` | Cookie 存語言（`sanci_locale`，**非** URL 路徑——保留 PWA「加到主畫面」捷徑/書籤不失效）；`id`/`en`/`zh` 三份文案並排寫在 `lib/i18n/messages/{common,cabang,admin}.ts`，`en`/`zh` 用 `satisfies Shape` 鎖住 key 集合——漏翻或打錯 key 是**編譯期錯誤**，不是畫面上半個印尼文半個中文。共用字彙見 `lib/i18n/GLOSSARY.md`（含簡體中文禁用詞表：擋掉「儲存/搜尋/帳號/登入」等繁體用詞混入）|
| `admin/**` 全頁翻譯 | `UNVERIFIED` | 訂單、Partner、分行、Package、產品目錄、權限、帳號建立/密碼重設（P-07）全部含在內；`admin-nav.tsx` 加 `<LocaleSwitcher/>`（Keluar 上方） |
| `cabang/**` 全頁翻譯 | `UNVERIFIED` | 首頁、訂單（建立/編輯/取消/發票）、客戶、員工、產品目錄全部含在內；`LocaleSwitcher` 放在首頁 `.ilist`（帳號連結下方，Keluar 上方）|
| 共用底層模組同步 i18n | `UNVERIFIED` | `lib/safe-write.ts`（`pesan(m)` 取代舊 `PESAN` 常數，`submitSafely()` 的 `messages` 改**必填**）、`lib/orders-shared.ts`/`lib/catalog-shared.ts`/`lib/audit-format.ts`（狀態/角色/audit diff 標籤全部經 `m` 翻譯）、`lib/compress-image.ts`（圖片壓縮失敗訊息——格式錯/太大/讀不出來/裝置處理不了——原本硬編印尼文，現在也走 `Messages`，`compressImage()` 的 `m` 參數同樣必填）|
| service_role 未外流複查 | `VERIFIED`（本機掃描） | 帳號建立/密碼重設兩個檔案被翻譯 agent 重新改過，重新對 `.next` build 產物做 bundle 掃描：`SUPABASE_SERVICE_ROLE_KEY` 只出現在**提示文字**（「請技術人員在 Vercel 填此環境變數」），真正讀取 `process.env` 的程式碼仍只在兩個 server-only 檔案（`app/admin/actions-users.ts`、`app/admin/partners/[id]/page.tsx`），沒有任何 `"use client"` 檔案匯入 `lib/supabase/admin.ts` |

兩個 agent 平行改 `admin/**`／`cabang/**` 時，各自範圍內 typecheck 都過，但共用底層模組（`safe-write.ts`）簽名收斂後有 8 個檔案的呼叫點沒跟上（舊 `PESAN` 匯入、`submitSafely()` 漏 `messages`）——清 `tsconfig.tsbuildinfo` 對整棵 `web/` 重跑 `tsc --noEmit`＋`next build` 才抓到，兩邊分開跑測不出來（見 LESSONS #31）。修完後 `npm run build`／`npx eslint .` 全綠，`/offline` 仍是靜態預渲染（`○`）。

### 產品目錄初始資料匯入（2026-08-18，Jenzo 提供 Master_data.xlsx + Master_Data2.xlsx）

169 筆產品（104 + 65）＋照片，來源是兩份 Excel 主檔。匯入工具在
`web/scripts/import-master-data/`（`run.mjs` + 已整理好的 `products.json` +
已壓縮照片），**尚未實際寫入資料庫**——這個 session 的沙盒環境沒有真的
Supabase 憑證，需要 Jenzo 在自己電腦上跑一次（步驟見該資料夾 README.md）。

匯入時的決策：
- 價格欄位（PRICE/UNIT、HARGA LAMA）完全不匯入，遵守 0010 的「零價格」鐵律。
- Excel「Stock di Easy」→ `stock_status`：0 → Habis，其餘 → Tersedia（Excel
  沒有「Terbatas」的資料可對應，之後要人工調整）。
- 兩份 Excel 對同一類別的命名不一致（"Mattress" vs "SANCI Mattress"、
  "Pillow" vs "SANCI Pillow"）——已統一成含 SANCI 字首的版本，避免分店端
  分類篩選（依字串完全比對分組）被拆成兩組。
- 照片用跟 Admin → Produk 手動上傳完全相同的規格壓縮（PRESET_PRODUK：長邊
  1280px、WebP 品質 0.82），46 MB 原始照片壓到約 4.6 MB。
- 用 `code`（DB 唯一鍵）做 upsert，重複執行安全，不會產生重複產品。

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

### Phase 2 第六切片（Package 產品組成，2026-08-19，Jenzo 指示）

Jenzo 要求補做 `docs/SPEC-PHASE2.md` §23 當初**明文延後**的那一塊：「現在 Package 只需要：名稱/Code/基本描述/狀態。不要現在做：Package Product Components，因為產品選品會在下一 Phase。」該前提在 0010（`sanci_products`，169 筆真實產品含照片）落地後已消失，這一刀就是把它補上。

在此之前，admin 只能把產品代碼**打進 `description` 自由文字欄**當作變通。代價是：打錯的代碼沒有任何人會發現、已下架的產品仍「留在」套裝裡、而且「哪些套裝用到產品 X」這個問題**完全無法回答**。改用真外鍵之後，這三件事從「不建議」變成「做不到」。

| # | 功能 | 狀態 | 對應 SPEC-PHASE2 章節 | 備註 |
|---|---|---|---|---|
| P2-26 | Package 內容維護（admin） | `UNVERIFIED` | §23 | 新頁 `/admin/partners/[id]/packages/[packageId]`：現有內容列表（縮圖／名稱／代碼／數量可改／刪除需二次確認）＋加入產品（名稱/代碼即時搜尋、已在套裝內的產品自動從候選中排除、數量預設 1）。Partner 詳情頁 Package 分頁每列新增「Isi Package」連結。套裝以 `id`＋`partner_id` **雙條件**載入，別家套裝一律 `notFound()`（不用泛用 id 查詢，避免以錯誤訊息差異試探他人套裝是否存在） |
| P2-27 | `partner_package_items` 資料表 | `UNVERIFIED` | §23 | `unique(package_id, product_id)`（同一產品最多一列，加量＝改數量不是加第二列）＋`check(quantity > 0)`（0 不是「沒有」，不要就刪列）；`package_id` **CASCADE**、`product_id` **RESTRICT**——兩者刻意不同：內容屬於套裝生命週期，但產品消失不該無聲刪掉套裝內容行（且兩者實務上都不硬刪，LESSONS #4）。三個 trigger 比照 `partner_packages`；audit 前綴 `PACKAGE_ITEM` |
| P2-28 | 內容讀取權限（DB 層） | `UNVERIFIED` | §21, §23 | `ppi_admin_all`（admin 全權）＋`ppi_partner_read`（partner **只讀**自己套裝的內容，理由同 0008 的 `pkg_partner_read`：套裝本身既然讀得到，內容讀不到就沒有意義）。**分店零寫入 policy**，以負面斷言 `PACKAGE_ITEM_PARTNER_WRITE_POLICIES 0` 驗證。分店端「看得到內容」的畫面**本輪刻意不做**（見下方已知邊界） |
| P2-29 | 三語系文案＋Activity 標籤 | `UNVERIFIED` | §69 | `common.ts` 加 `quantity` 與三句 `auditPackageItem*`；`admin.ts` 加 13 個鍵×三語。`audit-format.ts` 依 LESSONS #28 補齊：`product_id` 進 `SKIP`（UUID 不得外流到 Activity）、`quantity` 進欄位標籤表、三個 `PACKAGE_ITEM_*` 進 `ACTION_KEYS`——否則 Activity 會直接印出原始碼與 UUID |

**Migration `0012_package_product_components.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-19 Jenzo 執行成功並回貼驗證結果，23 項數字與期望完全相符（含兩個關鍵負面斷言 `PACKAGE_ITEM_PARTNER_WRITE_POLICIES 0`、`PACKAGE_ITEM_FK_PRODUCT_NOT_CASCADE 0`，以及八個 audit 保留斷言＋`REFS_CHECK_CUSTOMER 1`——production 上 `fn_audit_row` 完整保留 0004/0005/0008/0009/0010 全部前綴，0011 的 P2 補丁也還在）。本機 Postgres 16 完整重放 `0001→0003→0004→0005→0006→0007→0008→0009→0010→0011→0012` 後：驗證區塊 23 項全數符合期望（含三個關鍵負面／型別斷言 `PACKAGE_ITEM_PARTNER_WRITE_POLICIES 0`、`PACKAGE_ITEM_FK_PRODUCT_NOT_CASCADE 0`、`PACKAGE_ITEM_FK_PRODUCT_RESTRICT 1`，以及八個 audit 保留斷言與 `REFS_CHECK_CUSTOMER 1`）；行為測試 13/13 PASS（admin 增改刪、partner 讀自己 1 列／讀別家 0 列、partner 寫入三種全被擋、unique 擋重複、quantity 0 與負數皆被 CHECK 擋、產品 FK RESTRICT 實測擋下刪除、套裝 FK CASCADE 實測連帶清除）；冪等連跑 3 次 `pg_dump -s` 零漂移；`fn_audit_row` 回歸實測 `PRODUCT_CREATED`／`PRODUCT_STATUS_CHANGED`／`CATALOG_ACCESS_UPDATED`／`PACKAGE_CREATED`／`ORDER_CUSTOMER_ARRIVED` 全部照舊，新增三個 `PACKAGE_ITEM_*` 正確帶出 partner、branch 為 null（套裝屬 partner 層級）。⚠️ **0012 後 0001 檔尾數字變為 RLS_ENABLED 17 / POLICIES 37 / TRIGGERS 27**（已本機實測，非推估；`partner_package_items` 以 `partner%` 開頭所以三個 trigger 會被 0001 的計數納入，與 `order_internal_notes` 不同）。typecheck ✓ eslint ✓ build ✓（`/offline` 仍為 `○` 靜態預渲染）。

**本切片刻意不做（已知邊界，非遺漏）**：
- **分店端看不到套裝內容**。`ppi_partner_read` 已在 DB 層允許，也已實測（自家 1 列／別家 0 列），但畫面本輪不做——這一刀是 admin-only。先開 policy 是刻意的：讀取規則趁上下文還新鮮時一起測掉，而不是下輪匆促補上。
- **套裝內容不隨訂單快照凍結**。訂單仍以 `package_id` 指向套裝，`package_name` 維持 0008 的自由文字快照（凍結的是**名稱**）。今天改套裝內容，昨天的舊訂單讀到的會是**新內容**。要凍結內容需要另一張表，是另一個決定，不要往這張表上補。
- **`quantity` 無上限**。CHECK 只有 `> 0`；打錯成 1000 資料庫照收。真要限制（例如每列最多 999）該寫進 CHECK constraint，不是只擋在表單。

### Phase 2 第七切片（SANCI 方案金額 + Google 試算表單向鏡像，2026-08-20，Jenzo 定案）

Jenzo 今天拍板兩件相連的事。第一件：分店下單後，SANCI 會**逐筆人工決定**要給客戶什麼方案，這個決定目前靠 WhatsApp 傳，有寫下來的話是塞在 `order_internal_notes` 的自由文字裡（「Invoice 2,5jt → kasih diskon 10%」）。**一個數字被存成句子，就不能加總、不能比較、不能匯出**——這一刀就是給它一個真正的數字欄位。第二件：Jenzo 想在 Google 試算表上看訂單，所以做一個每 15 分鐘跑一次的單向鏡像。

owner 對可見度的原話是「Admin 填，先只有 SANCI 看得到」。「**先**」這個字決定了整個資料結構：金額**不是**加在 `partner_orders` 上的欄位，而是獨立一張表。原因是 Postgres 的 RLS 是**列級**不是欄級——`partner_orders` 的列從 0004 起就已經對分店開放（`o_partner_read`），任何加在那一列上的欄位，分店只要打 `?select=*` 就拿得到，UI 藏起來完全沒用（LESSONS #5）。做成獨立表、對分店一條 policy 都不給，往後真要開放給分店看，改的是**加一條 SELECT policy**，不是搬欄位、不是遷資料。

| # | 功能 | 狀態 | 對應 SPEC-PHASE2 章節 | 備註 |
|---|---|---|---|---|
| P2-30 | `order_sanci_offers` 資料表 | `UNVERIFIED` | §16 延伸 | `order_id` 直接當 **PRIMARY KEY**（一張訂單一個生效金額，寫入天然是 `on conflict (order_id) do update` 的冪等 upsert）。**刻意沒有 `client_request_id`**：靠自然鍵 upsert 的表，重送同一個值得到的是一模一樣的列，冪等來自表的形狀本身；硬加反而多一個 23505 要分辨（理由同 0010 的 `sanci_catalog_access`）。`amount` 型別 **`numeric(15,2)`**，與 `partner_purchase_amount` **完全一致**（同一個畫面並排顯示、同一個 `parseIDRInput()` 輸入，型別不一致遲早出現「這邊收得下、隔壁欄位吐 22003」）。`amount NOT NULL`＋`>= 0`：「不給方案」是**刪掉那一列**，不是存 0（0 是「金額為零的方案」，兩種狀態要有兩種形狀） |
| P2-31 | 讀寫權限（DB 層） | `UNVERIFIED` | §16, §32–34 | 只有 `oso_admin_all` 一條 policy。**分店零 policy，連 SELECT 都沒有**，以負面斷言 `OFFER_NONADMIN_POLICIES 0` 驗證。與 `order_internal_notes`（0009）刻意不同的地方是這裡用 `for all`（admin 可改可刪）——備註是「某個時間點的記錄」不該事後修飾，方案金額是「當下生效的值」，打錯要能改、決定不報要能刪；歷史完整性靠 `audit_logs` 保證，不靠禁止寫入 |
| P2-32 | Admin UI（訂單詳細頁） | `UNVERIFIED` | §16, §69 | 在「Catatan Internal SANCI」卡片上方新增獨立卡片（同一個信任區）。獨立查詢載入而**不用 embed**：embed 會在 0013 還沒跑時把**整頁**訂單查詢一起打死（LESSONS #12），而且 embed 字串只有執行期才知道對不對（LESSONS #24）。輸入框即時套千分位（與分店下單表單同一個 `handleAmountChange` 手法）；「刪除方案金額」是**獨立按鈕**不是「存空值」 |
| P2-33 | Server Action | `UNVERIFIED` | §16 | `setOrderOffer()` 走 `parseIDRInput()` 在**伺服器端重算**（不信瀏覽器算好的數字，LESSONS #6）＋ `safeWrite` upsert `{ onConflict: "order_id" }`；`clearOrderOffer()` 刻意**不加 `.single()`**（刪一個本來就不存在的列不是失敗，是目標狀態已達成，LESSONS #21）。42P01 一律翻成「功能尚未啟用」而非原始錯誤（LESSONS #12）。`revalidatePath` 用**路由樣板**形式 `"/admin/orders/[orderId]", "page"`——把真 id 內插進去是比對不到任何東西的（0012 已踩過） |
| P2-34 | 三語系文案＋Activity 標籤 | `UNVERIFIED` | §69 | `common.ts` 加 `sanciOffer` 與三句 `auditOrderOffer*`；`admin.ts` 加 18 個鍵×三語。`audit-format.ts` 依 LESSONS #28 補齊三件事：`ORDER_OFFER_*` 三個動作標籤、`amount` 進欄位標籤表**並走 `formatIDR`**（否則 Activity 上出現裸數字 `1500000`）、以及 **`order_id` 補進 `SKIP`**——順手修掉一個既有的洩漏：0009 的 `ORDER_INTERNAL_NOTE_CREATED` 從上線起就一直把 `order_id` 的原始 UUID 印在 Activity 上，因為當初沒回頭巡這個檔案 |
| P2-35 | Google 試算表單向鏡像 | `UNVERIFIED` | — | `integrations/sheets-orders/`：`Code.gs`（可直接貼的 Apps Script）＋繁中操作手冊。**一個合作商一個分頁**，以 A 欄「訂單編號」upsert，只寫 A..K 十一欄、**L 欄以後永不觸碰**（那是使用者自己加備註的地方）、**永不刪列**（取消的訂單只是狀態變 Dibatalkan）。用**專用 sync 帳號 + anon key**，檔頭寫明**絕不可用 service_role**。`order_sanci_offers` 走**第二個請求**而非 embed：0013 沒跑時只是該欄空白，不會整份表拉不到資料 |

**Migration `0013_order_offer_amount.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-20 Jenzo 執行成功並回貼驗證結果，**27 項數字與期望完全相符**（含 `OFFER_NONADMIN_POLICIES 0`、`OFFER_AMOUNT_TYPE numeric(15,2)`、十一個 audit 保留斷言全 1、`REFS_CHECK_CUSTOMER 1`）。本機 Postgres 16 完整重放 `0001→0003→0004→0005→0006→0007→0008→0009→0010→0011→0012→0013` 後：驗證區塊 **27 項全數符合期望**（含四個關鍵負面／型別斷言 `OFFER_NONADMIN_POLICIES 0`、`OFFER_NO_CLIENT_REQUEST_ID 0`、`OFFER_FK_NOT_CASCADE 0`、`OFFER_AMOUNT_TYPE numeric(15,2)`，以及十一個 audit 保留斷言＋`REFS_CHECK_CUSTOMER 1`）；行為測試 **40/40 PASS**（admin 增改刪、upsert 同一 `order_id` 只有一列、`created_by` 由 trigger 帶入、`updated_at` 走 `trg_touch`、amount −1 與 null 被擋、amount 0 被接受、**分店讀自己訂單的方案金額 0 列**、分店 insert 被 RLS 擋、update/delete 影響 0 列、anon 0 列、FK RESTRICT 實測擋下刪訂單、`ORDER_OFFER_CREATED/UPDATED/DELETED` 三個動作都帶出正確的 partner **與** branch、`before`/`after` 帶出新舊金額、分店讀不到 `audit_logs`）；`fn_audit_row` 回歸實測 `PACKAGE_CREATED`／`PRODUCT_CREATED`／`PRODUCT_STATUS_CHANGED`／`CATALOG_ACCESS_UPDATED`／`PACKAGE_ITEM_CREATED`（partner 正確、branch 仍為 null）／`ORDER_CUSTOMER_ARRIVED`／`ORDER_INTERNAL_NOTE_CREATED`／`ORDER_CANCELLED`／`CUSTOMER_PHONE_CHANGED` 全部照舊，且零筆裸表名動作碼；冪等連跑 3 次 `pg_dump -s` 零漂移。⚠️ **0013 後 0001 檔尾數字變為 RLS_ENABLED 18 / POLICIES 38，但 TRIGGERS 仍是 27**（已本機實測，非推估；`order_sanci_offers` 以 `order_` 開頭，三個 trigger 不會被 0001 的 `partner%` 計數納入，與 `order_internal_notes` 相同、與 `partner_package_items` 相反）。0004/0005/0009/0010/0011/0012 六個檔尾**一個數字都沒變**（已逐一實測）。亂序重跑實測：0012 最後跑會掉 `ORDER_OFFER` 但**保住** `PACKAGE_ITEM`；0010 最後跑兩個都掉；**單跑一次 0013 全部復原**。typecheck ✓ eslint ✓ build ✓（`/offline` 仍為 `○` 靜態預渲染）。

**本切片刻意不做（已知邊界，非遺漏）**：
- **分店／合作商看不到方案金額**。這是 owner 當下的決定（「先只有 SANCI 看得到」），不是技術限制。要開放的話是**加一條 SELECT policy**，資料結構不用動——這正是當初不把它做成 `partner_orders` 欄位的理由。
- **產品目錄永遠不放價格**。這條 0010 的鐵律**完全沒有被鬆動**。這裡存的是「針對某一筆訂單、由人決定的成交／方案金額」，不是產品定價。兩者差在：一個綁 `order_id`，一個會綁 `product_id`——後者這個系統裡不存在，也不會有。往後做 audit 的人請不要把這一刀誤判成違反零價格規則。
- **系統不算任何東西**。不比對 `partner_purchase_amount`、不算折扣%、沒有任何定價規則（沿用 0009 訂下的硬邊界）。數字是人打的，意思是人定的。
- **試算表是單向的**。表上改任何格子都不會回寫系統，也永遠不會自動刪列。要雙向同步是另一個決定（而且要先想清楚衝突怎麼解），不要往這支腳本上補。
- **方案金額不隨訂單快照凍結**。跟 0012 的套裝內容一樣：它是「目前生效的值」，改了就是改了，`audit_logs` 留完整前後值。要凍結需要另一張表。
- **訂單詳細頁的 Activity 分頁看不到 `ORDER_OFFER_*`**。那個查詢過濾 `entity_type='partner_orders'`，而這些列是 `order_sanci_offers`——跟 0009 的內部備註完全一樣的情形，不是壞掉。要看在**合作商 Activity** 和**分店 Activity** 兩個分頁（0013 刻意把 `partner_id` 和 `branch_id` 都填好就是為了這個）。

### Phase 2 第八切片（分店權限開放 + 訂單明細/備註 + 收貨地址，2026-08-20）

這一刀本來的委派範圍比實際做出來的大——執行中發現委派描述要求的「折扣鏈自動
計算引擎」（輸入多組百分比、markup%、現金折讓，資料庫算出 `final_amount`）跟
**同一個 commit（0013，`dc223a2`）**裡剛寫進 `GLOSSARY.md` 和上面 0013 段落的
「系統不算任何東西」明文規則直接衝突。這不是可以自行決定要不要照做的措辞差異
——是同一天、同一次交付裡兩份文件互相矛盾。既然只有 Jenzo 能拍板要不要推翻自己
剛定下的規則，這一刀**沒有**建折扣計算的部分，只做了跟現有規則相容的子集，並
把衝突原原本本記在 `0014_permissions_items_shipping.sql` 檔頭與
`supabase/migrations/README.md`（0014 段落）裡，供 Jenzo 親自決定。

**衝突已裁決（2026-08-20，主對話 orchestrator 持第一手證據裁定）**：GLOSSARY
那句「系統不計算折扣」是 **0013 施工 agent 自己的過度推廣**——它開工時 Jenzo
還沒說明折扣算法，它把 0009/0010 的舊邊界（目錄零價格、方案人工決定）擴大
解釋成了「永不計算」。而 Jenzo 本人在 0013 施工期間**明確拍板**了訂單層級的
折扣鏈：多段 % 連乘 → 可選加成 % → 減現金折讓（去尾數）→ 系統算最終價，並
逐字確認了算例（10.000.000 → [8,10] → +10% → −8.000 = 9.100.000）。時間順序
上 Jenzo 的拍板**晚於**該 agent 取得的上下文，且 GLOSSARY 那段自己就寫著
「要做折扣鏈計算需要 Jenzo 重新拍板」——拍板已經發生，只是寫規則的 agent
無從知道。裁決結果：折扣鏈計算引擎**要做**（第九切片 0015），0010「產品目錄
零價格」鐵律**不受影響**（這是訂單成交價，不是目錄定價）。GLOSSARY 已同步
修正。0014 停下來問而不是自己選邊，是正確行為（LESSONS #34 成立不變）。

實際做出來的三件事：① 兩個獨立的**分店可見度開關**（不是原委派要求的三個——
第三個 `can_discount` 因為沒有折扣機制可管而不存在），讓個別合作商的分店可以
在自己權限被打開後看到／填寫自己訂單的 Penawaran SANCI（含新增的訂金/付款
條件，兩者都是人手動打的數字/文字，不是算出來的）；② `order_items`：訂單裡
每一項產品自己的一行，建立訂單時從 Package 內容自動複製一份快照（名稱/代碼
凍結，不隨katalog之後改名而變），分店可以在自己訂單上改備註/顏色/尺寸/數量、
刪除某一行，直接回應 Jenzo「每個訂單下的產品或是paket都要可以備註」的要求；
③ `partner_orders.shipping_address`：每筆訂單自己的收貨地址（跟客戶主檔地址
分開,可以不一樣,建單時自動帶入客戶地址方便修改）。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-36 | Penawaran SANCI 分店可見度開關（admin） | `UNVERIFIED` | Partner 詳情頁「Hak Akses」分頁新增獨立卡片：`can_view_offer`／`can_edit_offer` 兩個 checkbox，DEFAULT `false`（fail-closed，未設定的 partner 維持 0013 原本的「只有 SANCI 看得到」）。勾選「可以填寫」會自動連帶勾選「可以查看」（UI 端；資料庫本身兩者獨立） |
| P2-37 | `order_sanci_offers` RLS 開放給分店（DB 層） | `UNVERIFIED` | 新增三條分店 policy（SELECT/INSERT/UPDATE），全部同時檢查：訂單屬於自己看得到／改得到的分店（`fn_can_view_branch`/`fn_can_edit_branch`，不回查自己這張表——LESSONS #25）**且** partner 的對應 flag 為 true（`partner_access_policies` INNER JOIN，無列＝關閉，fail-closed）。DELETE 對分店維持零 policy——刪除方案金額仍是 SANCI 專屬。`dp_amount`/`payment_condition` 兩個新欄位是純資料，DB 不做任何計算；`check(dp_amount <= amount)` 是驗證不是換算，餘額顯示（`amount - dp_amount`）純前端算，不落地存欄位 |
| P2-38 | `order_items` 資料表 + RLS（DB 層） | `UNVERIFIED` | name/code 快照凍結（`trg_order_item_immutable_cols`，非管理員不能改）；`unit_price`/`line_discount` 由第二支 trigger（`trg_order_item_price_guard`）另外把關——只有管理員或 partner 開了 `can_edit_offer` 才能填/改這兩欄，跟備註/顏色/尺寸/數量完全分開判斷；分店 INSERT/UPDATE/DELETE 都要求訂單狀態仍是 `REGISTERED`（已取消訂單的明細凍結，比照 0005 訂單本身的凍結精神）。分店寫入 policy 刻意是**正數**（`ORDER_ITEM_PARTNER_WRITE_POLICIES 3`）——跟 0012 的 `partner_package_items`（分店寫入永遠是 0）方向相反，因為這裡改的是**訂單自己的明細**，不是 SANCI 策劃的 Package 目錄 |
| P2-39 | 訂單建立時自動複製 Package 內容 | `UNVERIFIED` | `createCustomerAndOrder`（cabang 端 Server Action）成功建單且有選 Package 時，把 `partner_package_items` 逐行複製成 `order_items`（名稱/代碼從 `sanci_products` 現查現寫入，不信任 client 快照）。**Best-effort**：複製失敗不影響、不回滾已建立的訂單（跟 invoice 附件同一套邏輯），但失敗會回報成 UI 警告橫幅，不會靜默吞掉（LESSONS #10）。每行用確定性 `client_request_id`（`{訂單請求碼}:item:{product_id}`）防止重試造成重複 |
| P2-40 | Isi Pesanan 畫面（cabang + admin 訂單詳情頁） | `UNVERIFIED` | cabang 端：列表顯示名稱/代碼/數量/備註/顏色/尺寸，點「Ubah」開小視窗改備註/顏色/尺寸/數量或刪除——**沒有價格欄位**，UI 上完全不提供（DB trigger 也會擋）。admin 端：同樣列表多加「單價」「單行扣減金額」兩欄與新增/編輯/刪除，admin 一律放行（`oi_admin_all`） |
| P2-41 | `partner_orders.shipping_address` | `UNVERIFIED` | 新建/編輯訂單表單都有這個欄位，新建時**只在欄位還是空的時候**用選定客戶的 address/city/province 自動帶入（LESSONS #1：不覆蓋使用者已經打的字），欄位本身永遠獨立、永遠可改，**沒有**被加進 0005 的凍結欄位清單。cabang 與 admin 訂單詳情頁都顯示 |
| P2-42 | Google 試算表：新增 J/K/L 欄 | `UNVERIFIED` | `integrations/sheets-orders/`：欄位從 A..K（11 欄）擴充到 **A..N（14 欄）**——J 訂金、K 付款條件、L 收貨地址，原本 M/N 移到 M/N（建立/修改時間），L 欄以後的「使用者自己的備註區」跟著位移到 O 欄以後。**README.md 原本承諾的「只寫 A..K」被打破，已在 README §2 用專門段落誠實說明**，並加上舊格式分頁偵測：分頁標題列跟新格式（14 欄）對不上就直接拒絕同步那個分頁（記執行紀錄，不影響其他分頁），要求使用者手動改名/搬移舊分頁再重跑。0013→0014 中間狀態（只跑了 0013 沒跑 0014）優雅降級：I 欄照常，J/K/L 三欄各自獨立偵測缺欄位並留空，不會拖累其他欄位 |
| P2-43 | 三語系文案＋Activity 標籤 | `UNVERIFIED` | `common.ts` 新增 `dpAmount`/`paymentCondition`/`shippingAddress`/`orderItems`/`colorCode`/`customSize`/`unitPrice`/`lineDiscount` 與三句 `auditOrderItem*`；`admin.ts`/`cabang.ts` 各自新增權限卡片、Isi Pesanan、Alamat Pengiriman相關文案。`audit-format.ts` 依 LESSONS #28：`name_snapshot`/`code_snapshot` 給標籤（不是 SKIP——對非技術讀者有意義）、`unit_price`/`line_discount`/`dp_amount` 走 `formatIDR`、`ORDER_ITEM_CREATED/UPDATED/DELETED` 三個動作碼。`line_discount` 的中／印尼／英文標籤刻意避開「折扣/Diskon/Discount」這個詞（用「Potongan Baris/Line deduction/单行扣减金额」），原因見 `GLOSSARY.md` 的補充說明——避免讓人誤以為系統開始算折扣了 |

**Migration `0014_permissions_items_shipping.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-20 Jenzo 執行成功並回貼驗證結果，**38 項數字與期望完全相符**（含 `OFFER_POLICIES 1→4`、`OFFER_NONADMIN_POLICIES 0→3` 兩個刻意變化，四個 guard/EXEC 負面斷言全 0，十三個 audit 保留斷言全 1，`REFS_CHECK_CUSTOMER 1`）。本機 Postgres 16 完整重放 `0001→…→0013→0014` 後：驗證區塊 **38 項全數符合期望**（含負面／型別斷言 `ORDER_ITEM_FK_ORDER_NOT_CASCADE 0`、`ORDER_ITEM_FK_PRODUCT_NOT_CASCADE 0`、`ITEM_PRICE_GUARD_EXEC_PUBLIC 0`、`ITEM_IMMUTABLE_GUARD_EXEC_PUBLIC 0`、`POLICY_NEW_COLS_DEFAULT_FALSE 2`，以及十二個 audit 保留斷言＋`REFS_CHECK_CUSTOMER 1`）；行為測試 **22 項全過**（flag 關閉時分店讀自己訂單的方案金額仍是 0 列、INSERT 也被 RLS 擋；flag 打開後分店讀自己訂單 1 列、讀不到 partner B 的訂單；`dp_amount > amount` 被 CHECK 擋；分店 INSERT...RETURNING 建立 order_items 成功——證明 LESSONS #25 的自我回查陷阱在這裡不存在；own-branch 改備註成功、other-branch 改 0 列不報錯；已取消訂單的明細編輯被擋 0 列；`can_edit_offer` 關閉時價格欄位被 trigger 擋、但備註等欄位仍可正常編輯；`shipping_address` 分店可直接改；分店可刪除自己訂單的明細；`ORDER_ITEM_CREATED`／`ORDER_OFFER_*`／`PACKAGE_ITEM_CREATED`／`PERMISSION_CHANGED` 四類既有審計動作全部照常觸發且 partner/branch 正確解析；anon 對 order_items／order_sanci_offers 皆讀到 0 列）；`pg_dump -s` 冪等連跑 3 次零漂移（濾除 `\restrict`/`\unrestrict` 雜訊，LESSONS #33）。⚠️ **0014 後 0001 檔尾數字變為 RLS_ENABLED 19 / POLICIES 46，TRIGGERS 仍是 27**（已本機實測；`order_items` 以 `order_` 開頭，五個 trigger 不會被 0001 的 `partner%` 計數納入）。0004/0005/0008/0009/0010/0011/0012 各檔尾**一個數字都沒變**；0013 檔尾結構本身不變，**只有 `OFFER_POLICIES`（1→4）與 `OFFER_NONADMIN_POLICIES`（0→3）刻意改變**，兩者都在 README.md 用專門段落強調過。typecheck ✓ eslint ✓ build ✓（`/offline` 仍為 `○` 靜態預渲染）。

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **折扣/markup/現金折讓計算引擎完全沒有建**——原委派要求的核心功能。理由詳見上方切片說明開頭與 `0014_permissions_items_shipping.sql` 檔頭。這不是「以後再做」的待辦，是「需要 Jenzo 親自確認要不要推翻自己剛定的規則」的決策點，回報給 Jenzo 時務必單獨標出來讓他看到。
- **`can_discount` 權限旗標不存在**——沒有折扣機制可管，第三個旗標因此沒有意義，只做了 `can_view_offer`/`can_edit_offer` 兩個。
- **每個人的個別權限不存在**（沿用既有規則）：Penawaran SANCI 開放與否是「整個 partner」層級，不是「這個分店帳號」層級——本系統一店一帳號，本來就沒有更細的顆粒度。
- **現金項目上不支援打百分比**：`unit_price`/`line_discount` 都是絕對金額（Rp），不接受「打 9 折」這種百分比輸入——這也是「不做計算」這條線的直接延伸。
- **一鍵列印 SO/DO/Invoice 是下一刀**：owner 提供的三份 Excel 範本（Sales Order/Surat Jalan/Invoice 格式）裡的欄位需求，這一刀已經全部覆蓋到資料層（DP、付款條件、收貨地址、明細行的顏色/尺寸/備註/包裝欄位大部分已有對應），但「照著範本排版產生可列印文件」本身完全沒做，是刻意留給下一刀的獨立範圍。
- **已取消訂單的明細不能編輯**：跟訂單本身凍結的精神一致（0005），不是遺漏。
- **Google 試算表欄位範圍承諾被打破**：README 原本說「只寫 A..K，L 欄以後永不碰」，這次因為新增三欄而變成「只寫 A..N，O 欄以後永不碰」——舊格式分頁會被自動偵測並拒絕同步（不會盲目覆寫使用者手動加在舊 L 欄的備註），細節見 `integrations/sheets-orders/README.md` 新增的「⚠️ 欄位範圍變更」段落，這件事需要明確轉達給 Jenzo。

### Phase 2 第九切片（訂單層級折扣鏈計算引擎，2026-08-20）

延續上一刀（第八切片）記錄下來、沒有自己選邊的衝突：0013/0014 同一天寫進
`GLOSSARY.md`/`FEATURES.md` 的「系統不算任何東西」跟委派描述要的折扣鏈計算
引擎正面衝突，0014 選擇只做兩者都不禁止的子集，把衝突原封不動記下來等
Jenzo 裁決。裁決結果記在上面「衝突已裁決」段落：**折扣鏈計算引擎要做**，
0010「產品目錄零價格」鐵律不受影響（這是訂單成交價，不是目錄定價）。這一刀
就是照裁決把它蓋出來。

**算法**（owner 逐字確認，含算例）：`order_sanci_offers` 新增
`discount_pcts`（jsonb，有序 % 陣列，最多 6 個）、`markup_pct`（可選，
0–100）、`cash_discount`（預設 0）三個人工輸入欄位；資料庫用 BEFORE
INSERT/UPDATE trigger 算出 `final_amount`——連續乘上每個 `(1 − 折扣%/100)`
（連乘不是相加）→ 乘上 `(1 + markup%/100)` → 減 `cash_discount` → 四捨五入
到分。算例（逐字驗證通過）：10.000.000 → [8,10] → +10% markup → −8.000
現金折讓 → **9.100.000**。`final_amount` 永遠是資料庫算出來的，前端送上來
的值一律被 trigger 覆蓋——不存在「使用者自己填最終價」這件事。

**權限矩陣**（`can_discount` 是第三個旗標，本刀新增）：`can_discount` 是疊在
`can_edit_offer` **之上**的加開關，不是跟它平行的獨立開關——RLS
（`oso_partner_insert`/`oso_partner_update`，0014 遺留不動）仍然要求
`can_edit_offer` 才能寫入這一整張表的任何一列；`can_discount`
只在「已經被 RLS 放行寫入」的前提下，額外把關 discount_pcts/markup_pct/
cash_discount 這三欄能不能被非管理員改動（新增的 trigger
`fn_guard_order_offer_discount_fields`）。結論：只有 `can_discount` 沒有
`can_edit_offer` 完全沒用——連一列都寫不進去，本機測試（T8）逐項驗證過這個
組合確實是「寫入 0 列，不留任何痕跡」而不是靜默半生效。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-44 | `order_sanci_offers` 折扣鏈欄位 + 計算 trigger（DB 層） | `UNVERIFIED` | `discount_pcts`/`markup_pct`/`cash_discount`/`final_amount` 四個新欄位；`fn_compute_order_offer_final`（驗證陣列形狀＋算 final_amount，SECURITY INVOKER）+ `fn_guard_order_offer_discount_fields`（can_discount 把關，SECURITY DEFINER，EXECUTE 已對 public/anon/authenticated 收回，LESSONS #26）兩個新 trigger，`OFFER_TRIGGERS` 從 3 變成 **5**。`dp_amount<=amount`（0014）換成 `dp_amount<=final_amount`——遷移用「存在才 DROP、不存在才 ADD」的方式同時處理「0014 剛跑完」和「0015 已經跑過一次」兩種起始狀態 |
| P2-45 | `can_discount` 權限旗標（DB 層） | `UNVERIFIED` | `partner_access_policies` 新增第三個布林旗標，DEFAULT `false`（fail-closed，跟 can_view_offer/can_edit_offer 同一套邏輯）。詳細矩陣見上方說明——這是加在 can_edit_offer 之上的門，不是平行旗標 |
| P2-46 | Admin 訂單詳情頁：折扣鏈填寫表單 | `UNVERIFIED` | `order-offer-form.tsx` 擴充：動態新增/刪除折扣欄位（最多 6 個，「+ Tambah Diskon」）、Markup %、Potongan Tunai（Rp 格式輸入）；畫面即時算一次 Harga Akhir/Sisa Bayar 給人看（跟資料庫用同一條公式），但存進資料庫的數字永遠是刷新後從伺服器讀回來的那個，不是畫面上算的那個（LESSONS #7）。`setOrderOffer` server action 擴充七個參數，資料庫丟出來的驗證例外（陣列形狀/範圍/6 個上限/組合為負/can_discount 未開）都翻成看得懂的提示，不會讓使用者看到 23514 這種原始代碼 |
| P2-47 | Admin「Hak Akses」分頁：折扣權限勾選框 | `UNVERIFIED` | `offer-permissions-form.tsx` 新增第三個勾選框「Boleh mengatur diskon」；勾選它會連帶勾選「Boleh mengisi/mengubah Penawaran SANCI」（進而連帶勾選「Boleh melihat」）——UI 端的連鎖，資料庫本身三個旗標仍然各自獨立判斷 |
| P2-48 | Cabang 訂單詳情頁：折扣鏈顯示 + 填寫 | `UNVERIFIED` | **這是本刀新蓋的畫面，不是延續 0014 既有的東西**——盤點時發現 0014 雖然把 RLS 打開到分店（`can_view_offer`/`can_edit_offer`），但分店端的訂單詳情頁完全沒有畫面讀取或顯示 `order_sanci_offers`（`orderOfferNoPermissionView`/`orderOfferNoPermissionEdit` 兩句文案在 0014 就寫好了卻沒有任何畫面用到）。新增 `offer-section.tsx` + `setOrderOfferBranch`（cabang 專屬 server action，鏡像 admin 版但走 cabang 的身分/訊息層）：`can_view_offer` 開時顯示卡片（含折扣/Markup/Potongan Tunai/Harga Akhir/Sisa Bayar），`can_edit_offer` 開時可以改，`can_discount` 開時折扣欄位才可編輯；三個旗標都沒開時卡片完全不出現（雙重 fail-closed：RLS 在資料庫層擋，卡片在畫面層也不畫） |
| P2-49 | Google 試算表：新增 M..Q 欄 | `UNVERIFIED` | `integrations/sheets-orders/`：欄位從 A..N（14 欄）再擴充到 **A..S（19 欄）**——M Diskon（格式「8+10」）、N Markup (%)、O Potongan Tunai (IDR)、P Harga Akhir (IDR)、Q Sisa (IDR)，Dibuat/Diubah 移到 R/S。README 原本「只寫 A..N」的承諾再次被打破，`README.md` §2 用專門段落誠實說明，並延伸舊格式分頁偵測（11 欄或 14 欄都會被擋下）。0014→0015 中間狀態（只跑了 0014 沒跑 0015）優雅降級：I..L 欄照常，M..Q 五欄各自獨立偵測缺欄位並留空 |
| P2-50 | 三語系文案＋Activity 標籤 | `UNVERIFIED` | `common.ts` 新增 `discountPcts`/`markupPct`/`cashDiscount`/`finalAmount`/`remainingBalance`；`GLOSSARY.md` 補上四個新詞條（Diskon/Markup/Potongan Tunai/Harga Akhir 三語對照）。`audit-format.ts` 依 LESSONS #28：`discount_pcts` 走專用渲染（`[8,10]` → "8% + 10%"，不是通用 asLabel）、`markup_pct` 附加 `%`、`cash_discount`/`final_amount` 走 `formatIDR`。`Diskon`/`Discount`/`折扣` 這個詞現在**允許**用在訂單折扣鏈脈絡（GLOSSARY.md §「订单层级的折扣链计算」明文放行）——跟 `order_items.line_discount`（刻意迴避這個詞）是兩件事，注釋裡寫清楚分界 |

**Migration `0015_order_discount_chain.sql` 狀態**：**`VERIFIED`(production)** — 2026-08-20 Jenzo 執行成功並回貼驗證結果，**34 項數字與期望完全相符**（含 `OFFER_TRIGGERS 3→5` 刻意變化、`DP_LE_AMOUNT_CHECK_GONE 0`＋`DP_LE_FINAL_CHECK 1` 的限制替換、十三個 audit 保留斷言全 1）。

**本機 Postgres 16 驗證**：完整重放 `0001→…→0014→0015` 後，驗證區塊 **34 項全數符合期望**（含 `OFFER_TRIGGERS` 3→**5**、`DP_LE_AMOUNT_CHECK_GONE` **0**、`DP_LE_FINAL_CHECK` **1**、`DISCOUNT_GUARD_EXEC_PUBLIC` **0**、十三個 audit 保留斷言＋`REFS_CHECK_CUSTOMER 1`）；行為測試 **18 項全過**（owner 算例逐字驗證 `10.000.000→[8,10]→+10%markup→−8.000→9.100.000.00`；空陣列/無 markup/無現金 → final=amount；單一 8% 折扣 → 9200000.00；client 塞假 final_amount 被 trigger 覆蓋；七種驗證拒絕案例——非陣列/元素等於 0/等於 100/負數/7 個元素/現金為負/組合導致負值——各自對到正確的例外訊息；dp>final 被新 constraint 擋；`can_discount` 關 + `can_edit_offer` 開 → 可以改基礎欄位但改不了折扣欄位；`can_discount` 開 + `can_edit_offer` 開 → 折扣欄位可以改，算出的 final_amount 跟算例吻合；`can_discount` 開但 `can_edit_offer` 關 → 整列寫入 0 筆，`can_discount` 單獨沒用；admin 一律繞過折扣把關；`ORDER_OFFER_UPDATED` 稽核紀錄的 after-json 帶有新欄位）；`pg_dump -s` 冪等連跑 3 次零漂移（濾除 `\restrict`/`\unrestrict` 雜訊，LESSONS #33）；額外實測「0014 在 0015 之後重跑」的真實後果——`order_sanci_offers_dp_le_amount_check`（舊 constraint）會跟新的 `dp_le_final_check` 並存，兩個 trigger 和三個 RLS policy 則完全不受影響（逐項量測，不是猜測），恢復方式是重跑 0015。typecheck ✓ eslint ✓ build ✓（`/offline` 仍為 `○` 靜態預渲染）；新增簡體字串已跑禁用詞掃描，無命中。

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **每一行明細（order_items）打折扣百分比不在範圍內**——`unit_price`/`line_discount` 仍然是人工輸入的絕對金額（Rp），這一刀的折扣鏈只存在於訂單層級（`order_sanci_offers`），不會延伸到明細行。
- **`cash_discount` 以外沒有任何自動去尾數/四捨五入邏輯**——要湊整數，人自己填 `cash_discount` 填到 `final_amount`變成想要的整數，資料庫不會自動幫忙猜。
- **一鍵列印 SO/DO/Invoice 仍然是下一刀**——這一刀在資料層新增的 `final_amount`/`discount_pcts`/`markup_pct`/`cash_discount` 讓下一刀的範本欄位對應更完整，但排版產生可列印文件本身完全沒做。
- **個別分店帳號的獨立權限仍然不存在**——`can_discount` 一樣是整個 partner 層級的旗標，不是單一分店帳號層級（本系統一店一帳號的既有設計，沿用 0014 的說法）。

### Google 試算表：SO 分頁自動填單工具（`integrations/sheets-so-filler/`，2026-08-20）

owner 既有的「Form SO INV dan DO-SANCI」試算表（人工複製 SO/DO/INV 三分頁一組，
DO／Invoice 100% 靠公式從 SO 分頁算出來，已對照真正的試算表驗證過）新增第二支
Apps Script，跟 `integrations/sheets-orders/`（每 15 分鐘整批同步全部訂單清單）
是**不同性質的工具**：這支是手動、單筆、當下用——選單「SANCI」→「Isi dari
sistem…」，輸入系統訂單編號，把該筆訂單的表頭與明細（P15:X26，最多 12 行）
寫進**目前打開的 SO 分頁**INPUT 儲存格；不建立分頁、不寫 DO/Invoice、不回寫
系統。跟同步腳本共用同一組「專用同步帳號」（沿用同一組 Script Properties），
不需要另開帳號。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-51 | `sheets-so-filler` 單筆訂單填單腳本 | `UNVERIFIED` | 完整儲存格對應表見 `integrations/sheets-so-filler/README.md` §5。P1=="No. SO" 才會執行；Q1 已有別的值時跳 YES/NO 確認再覆蓋；找不到訂單編號、登入失敗等情況都收斂成單一句清楚的印尼文錯誤訊息，不外露原始例外 |

**已知邊界（模板本身的物理限制，不是遺漏）**：
- **商品明細最多 12 行**（P15:X26）——超過的話只寫前 12 行，總結視窗會列出哪幾行被跳過的品名，不會靜悄悄漏掉。
- **折扣鏈最多 3 段**（Q7/Q8/Q9）——系統 `discount_pcts` 最多可以有 6 段，模板只留 3 格，超過時只填前 3 段並跳警告；這種情況下 SO 分頁自己算出的合計會跟系統 `final_amount` 對不起來，要以系統畫面為準。
- **Markup／現金折讓沒有專屬欄位**——寫成附註接在 Q13（Noted）最後面，精確數字仍要回系統核對。
- **Q6「Delivery By」找不到對應的系統欄位，完全不填**——盤點過所有訂單相關欄位都對不上這格的語意，寧可留給人工填也不亂猜寫錯資料；如果 Jenzo 確認它該對應到某個系統欄位，可以再補映射。
- **明細只有 migrasi 0014 之後建立的訂單才有**——舊訂單系統裡本來就沒有逐行商品資料，工具會照樣填表頭，明細留空並在總結視窗說明原因。

### Chip 視覺體系重構（純呈現層，2026-08-20）— `UNVERIFIED`

Owner 原話：「那些標籤有點看不懂，不夠明確」——Package 相關畫面上代碼／庫存／
啟用狀態三種完全不同性質的小標籤（chip）長得一樣重，使用者分不出是哪一種資訊。
純呈現層修正，**零查詢/action/資料流變動**：在 `web/app/globals.css` 的 STYLE
CONTRACT 裡把 chip 分成四個家族，一次定義、全站套用（`.chip.stock` 走
`lib/catalog-shared.ts` 的 `STOCK_STATUS_CHIP`，`.chip.ACTIVE/.DRAFT/.SUSPENDED/
.INACTIVE` 是既有全站沿用的字面 class 名稱，所以 CSS 一改、六個目標畫面之外的
既有頁面（Partner/Cabang/Staf/Akun 狀態）也一併變得一致，不是刻意擴大範圍，是
共用 class 系統本身就是這樣運作）：
- **代碼**（產品代碼/套裝代碼/訂單編號）→ `.code`：等寬字型＋描邊（不再是純填色）
  ＋小標籤圖示（CSS `mask` 內嵌 SVG，base64，非圖示庫）——讀起來像「一個可查詢
  的 ID」。
- **庫存狀態** → `.chip.stock.ok/.warn/.bad`：維持填色圓角膠囊，新增前導圓點——
  顏色不再是唯一線索。
- **啟用狀態**（Aktif/Draf/Ditangguhkan/Nonaktif）→ 描邊文字徽章＋方形小點，
  刻意跟庫存狀態反過來（不是填色）——紅色的「Ditangguhkan」不會再跟紅色的
  「Habis」長得像同一種東西。
- **數量** → 新增 `.chip.qty`（"×3" 樣式徽章），套用在訂單明細（admin +
  cabang 兩側的 `order-items-section.tsx`）。
- `new-order-form.tsx` 確認沒有渲染任何 package chip（純下拉選單）——不動。

**驗證**：`tsc --noEmit`／`eslint`／`npm run build` 全綠（`/offline` 仍 `○`）；
本環境網路白名單擋 Supabase（沿用既有已知限制），登入頁以外的畫面截圖沒有
意義，改用實際 `globals.css` 建一個獨立靜態頁在 Playwright 截圖驗證四種
chip 家族在亮/暗模式、390/1280px 下的呈現（見 commit 說明），非透過真實登入
流程——**待 Jenzo 在 production 用真帳號在 Admin → Produk 網格、Isi Package
畫面實際看過**才算 VERIFIED。零新增 UI 文案（設計改用視覺識別而非加字），
故無新 i18n 字串、無需 forbidden-zh 掃描新增項。

### Phase 2 第十切片（訂單文件 SO/DO/Invoice 一鍵產生，2026-08-20）

Owner 拍板：分店建單後，SANCI 逐筆人工決定要出哪些文件、出給誰看，取代原本
「複製 Google Sheet 分頁」的手工流程。Owner 明確糾正天真設計（原話「每個的
日期不同, 內容跟件數在so,do 不同,invoice 也不同」）——**SO/DO/Invoice 不是
同一張訂單的三種視圖**：三份文件各自有自己的日期，DO 跟 Invoice 各自有自己
的品項選擇跟數量（部分出貨/部分請款是真實情境：今天用一張 DO 出 3 件，下週
再用第二張 DO 補 2 件）。這一刀把文件本身變成獨立實體（`order_documents` +
`order_document_items`），不是從 `partner_orders` 算出來的唯讀視圖。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-52 | `order_documents` + `order_document_items` 資料表（DB 層） | `UNVERIFIED` | 兩張新表；`doc_number` 純資料庫層 `unique`（真正防線），編號本身在 Server Action 算（prefix+序號，不信任端；併發撞號時抓 23505 重算）；`order_document_items` 透過 `order_item_id` FK 指到既有 `order_items`（不重複複製名稱/代碼，維持單一事實來源），`quantity` 是**這份文件自己的**數量，可以小於訂單總數量（partial 出貨/請款） |
| P2-53 | 出貨/請款上限守衛（DB trigger） | `UNVERIFIED` | `fn_guard_document_item_overship`：DO 類型所有文件的 quantity 加總不得超過該 order_item 的 quantity；INVOICE 類型**獨立**算一套一模一樣的規則（出貨不佔用請款額度，反之亦然）；SO 類型完全跳過（SO 是整張訂單的快照，沒有「剩餘」這個概念）。錯誤訊息點名品項名稱＋剩餘數量，印尼文，非資料庫原始代碼 |
| P2-54 | 兩個 RPC 保證交易原子性 | `UNVERIFIED` | `fn_create_order_document`（建立文件表頭＋所有品項行，一次交易內）、`fn_replace_order_document_items`（Ubah 時整批刪除舊行＋寫入新行＋更新表頭日期/備註，同樣一次交易）——避免「表頭建好了但品項一半寫失敗」這種介於中間的壞狀態。兩者皆 admin-only（`fn_is_admin()` 檢查＋RLS 雙重防線） |
| P2-55 | RLS：admin-only 全面（DB 層） | `UNVERIFIED` | 兩張表各一條 `for all using fn_is_admin() with check fn_is_admin()`，**零**分店 policy（負面斷言 `DOC_NONADMIN_POLICIES`/`DOC_ITEM_NONADMIN_POLICIES` 皆 0）。分店可見度是刻意留白的未來選項——要開放時加 SELECT policy，不用改資料結構（模式沿用 0013→0014 的先例） |
| P2-56 | Admin 訂單詳情頁「Dokumen」卡片 | `UNVERIFIED` | `documents-section.tsx`：文件清單（type badge／`.code` 編號／日期／行數）＋三個建立按鈕（+Buat SO/DO/Invoice）；建立/編輯共用一個 modal（日期欄＋品項選擇表格：名稱/代碼、已訂購、已涵蓋（該類型其他文件的加總）、剩餘、輸入數量預設為剩餘、0=不納入）；type badge 用 chip 分類法擴充三個新成員 `.chip.SO/.DO/.INVOICE`（沿用既有描邊+方點機制，不是第五個 family）。0016 未跑時整張卡片降級成「功能尚未啟用」，頁面其餘部分不受影響（探測既有模式） |
| P2-57 | 列印頁 `/admin/orders/[orderId]/documents/[documentId]/print` | `UNVERIFIED` | Server component（沿用 `app/admin/layout.tsx` 既有的 admin 驗證，本頁不重複加驗證邏輯）；三種文件各自的版面（結構仿照 owner 提供的三份 Excel 範本，不是像素級複製）：SO 含表頭區塊、品項表、小計/折扣鏈/DP/尾款、銀行轉帳區塊、雙簽名欄、完整 Syarat & Ketentuan 條款全文（從範本 A47:A51 逐字取出）；DO 只有名稱/備註/數量三欄＋總數量＋三個簽名欄；Invoice 含買方資訊/PO 對應訂單編號/品項含價格/小計/DP/尾款/銀行區塊。`@media print` 隱藏 admin chrome 與列印按鈕本身，A4 版面，**黑底白字寫死，不跟 app 深色模式**。銀行/公司常數集中在新檔 `web/lib/company-info.ts`（值取自 Invoice 範本：BCA／542-5816168／PT WAHANA ERA INOVASI，City 取 SO 範本「KCP Jakarta Selatan」較完整的版本），檔頭註明是靜態設定、要改在這裡改，沒有畫面可以編輯 |
| P2-58 | 三語系文案＋Activity 標籤 | `UNVERIFIED` | `common.ts` 新增 `docTypeSO/DO/Invoice`（GLOSSARY.md 新增條目，跟 Invoice 同一原則：三語言都不翻譯，維持英文縮寫）＋六句 `auditOrderDocument*`/`auditOrderDocumentItem*`；`admin.ts` 新增 33 個鍵×三語（卡片標題、按鈕、modal 欄位、錯誤訊息）。`audit-format.ts` 依 LESSONS #28：`document_id`/`order_item_id` 補進 `SKIP`（UUID，兩個都是新關聯欄位）；`doc_type`/`doc_number`/`doc_date` 進欄位標籤表；`doc_type` 的值（SO/DO/INVOICE）透過 `valueLabel` 對應到自己（維持原樣但走 `Messages`，跟其他 enum 一致，非留白）；`ORDER_DOCUMENT_*`/`ORDER_DOCUMENT_ITEM_*` 各三個動作碼進 `ACTION_KEYS`。**列印文件本身的標籤刻意硬編印尼文、不跑 `Messages`**——這是客戶會簽名的紙本，簽字的客戶看得懂印尼文，不該因為 admin 當下切到哪個介面語言就跟著變，理由完整寫在 `GLOSSARY.md` 新增段落與列印頁檔頭註解裡；系統介面（卡片/按鈕/表單提示）仍完整三語系，這是兩件事。 |

**Migration `0016_order_documents.sql` 狀態**：**`VERIFIED`(production)** —
2026-08-20 Jenzo 執行成功並回貼驗證結果，**46 項數字與期望完全相符**（含
四個關鍵負面斷言 `DOC_NONADMIN_POLICIES 0`、`DOC_ITEM_NONADMIN_POLICIES 0`、
`RPC_EXEC_PUBLIC 0`、`RPC_EXEC_ANON 0`，以及十四個 audit 保留斷言全 1）。
本機 Postgres 16 完整重放 `0001→…→0015→0016` 後：
驗證區塊 **46 項全數符合期望**（含四個關鍵負面斷言 `DOC_NONADMIN_POLICIES`
0、`DOC_ITEM_NONADMIN_POLICIES` 0、`RPC_EXEC_PUBLIC`/`RPC_EXEC_ANON` 0、
`OVERSHIP_GUARD_EXEC_PUBLIC` 0，以及十三個 `AUDIT_KEEP_*`/`REFS_CHECK_CUSTOMER`
保留斷言全 1）；行為測試 **24 項全過**（`supabase/test-harness/40_behavior_
0016.sql`，延伸既有 harness）：admin 建立 SO 文件成功且含多行品項；分店對兩
張新表皆讀到 **0 列**，透過 RPC 建立文件也被擋（42501）；建立第二張 DO 得到
`-2` 尾碼、重複用同一個編號建立第三次撞到 `doc_number` 唯一約束（非
`client_request_id`，證實併發重試邏輯抓對錯誤）；跨兩張 DO 出貨 3+3（總量 5）
在第二張被拒且訊息點名品項與剩餘量（sisa 2），3+2 精確用完額度則成功；同一
品項的 INVOICE 額度**獨立**於 DO——DO 用完 5 件後 INVOICE 仍可開滿 5 件，但
INVOICE 自己開滿後第二張 INVOICE 就被拒（sisa 0）；編輯既有 DO 行數量超過剩
餘被拒且整筆交易回滾（原始數量原封不動，非部分寫入）、精確用完剩餘額度的編
輯則成功；admin 刪除文件允許，cascade 清空品項行，稽核記錄文件刪除**與**
cascade 品項刪除兩者；`ORDER_DOCUMENT_CREATED`（一跳）與
`ORDER_DOCUMENT_ITEM_CREATED`（two-hop：`document_id→order_documents.
order_id→partner_orders`）皆正確解析出 partner **與** branch；既有 9 種舊切
片動作碼中此 harness 可觸發的 6 種全部照常出現（其餘 3 種——`ORDER_
ATTRIBUTION_CORRECTED`／`ORDER_CUSTOMER_ARRIVED`／`ORDER_INTERNAL_NOTE_
CREATED`——本機 harness 本來就不會觸發，`fn_audit_row` 原始碼裡仍完整保留這
三個字串，由 migration 自己的 `AUDIT_KEEP_*` 斷言在原始碼層級驗證，非執行期
驗證）。冪等連跑 3 次 `pg_dump -s`（濾除 `\restrict`/`\unrestrict` 雜訊，
LESSONS #33）**零漂移**，46 項驗證數字在第 3 次重跑後逐字相同。⚠️ **0016 後
0001 檔尾數字變為 RLS_ENABLED 21 / POLICIES 48**（已本機實測，非推估；
`order_documents`/`order_document_items` 各一條 `for all` policy）**，
TRIGGERS 仍是 27**（兩張新表都以 `order_` 開頭，不計入 0001 只算 `partner%`
字首的計數，與 `order_items`/`order_sanci_offers`/`order_internal_notes`
同一模式）。0004/0005/0008/0009/0010/0011/0012/0013/0014/0015 十個舊檔尾**一
個數字都沒變**（已逐一實測）。重跑順序復原實測：重跑 0001 會讓 `fn_audit_row`
遺失 `ORDER_DOCUMENT`/`ORDER_DOCUMENT_ITEM` 字首（`prosrc like '%ORDER_
DOCUMENT%'` 從 `true` 變 `false`），**單跑一次 0016 完全復原**（46 項驗證數
字回到跟第一次執行完全相同）。typecheck ✓ eslint ✓ build ✓（`/offline` 仍
`○` 靜態預渲染）；新增簡體字串已跑禁用詞掃描，零命中；`id`/`en` 兩區塊掃描
CJK 殘留，零新增命中（既有註解裡的中文字屬本輪之前就存在，非本輪引入）。

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **分店完全看不到任何文件**——DB RLS 是唯一防線（零 SELECT policy），不是
  UI 藏起來。要開放時是加 policy，不是改資料結構（沿用 0013 先例的設計哲學）。
- **`fn_create_order_document`/`fn_replace_order_document_items` 不驗證
  `order_item_id` 真的屬於這張訂單**——兩個 RPC 都 admin-only，admin 本來就
  能看到所有訂單，所以不是跨 partner 外洩風險，但畫面上選錯訂單的品項不會
  被資料庫擋下。詳細記在 `migrations/README.md`「批次milik 0016」第 3 點。
- **SO 文件的「品項預設帶入全部」是應用層（Server Action）行為，不是資料庫
  行為**——RPC 本身對 SO 完全不做預設，只是忠實寫入呼叫者給的品項清單；這
  代表本機 DB 行為測試（40_behavior_0016.sql）測的是 RPC 機制本身，SO 的預
  設邏輯待 Jenzo 在 production 用真實 UI 操作驗證。
- **一份文件的品項不會凍結成獨立快照**——`order_document_items` 透過
  `order_item_id` 指回 `order_items`，如果 `order_items` 的
  `name_snapshot`/`code_snapshot`之後被 admin 修正，舊文件重新列印會顯示新
  名稱。要完全凍結需要另一張快照表，是另一個決定。
- **文件品項數量沒有上限**（除了型別本身）——CHECK 只有 `> 0`，跟
  `order_items`/`partner_package_items` 同一慣例。
- **列印頁不支援直接產生 PDF 附件寄送**——`window.print()`／瀏覽器「另存為
  PDF」是唯一路徑，沒有伺服器端產生 PDF 檔案並上傳/寄出的功能。
- **Email/PDF 附件寄送、UI 編輯銀行區塊、逐行折扣覆寫發票價格**——三者皆刻
  意不做，跟委派描述裡列的「刻意不做」清單一致（Invoice 價格完全來自
  `order_items`，不支援每份文件自己覆寫單價）。
- **production 尚未執行本 migration**——所有驗證數字皆本機 Postgres 16 測得，
  待 Jenzo 在 Supabase SQL Editor 貼上 `0016_order_documents.sql` 全文執行，
  回貼 46 項驗證結果核對後方可升級為 `VERIFIED(production)`。

### Phase 2 第十一切片（客戶資料匯入，2026-08-20）

Owner 指示（"客戶資料也進去"）：把 36 筆舊有客戶資料（來源在系統之外——Excel／
WhatsApp／業務同事的記憶）匯入 `customers`，**硬性要求**：匯入的客戶**分店完
全看不到**。這條硬性要求不是靠新機制做到的——`created_via_partner_id`/
`created_via_branch_id` = NULL 這個組合，配上系統從 0004/0007 就存在的 RLS，
本來就等於「零分店 policy 命中，只有 admin 看得到」，本切片只是驗證這個既有
機制真的擋得住，沒有新造輪子。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-59 | Migration `0017_customer_code_email.sql`：`customers` 新增 `customer_code`/`email`（DB 層） | `UNVERIFIED` | 兩個新欄位，皆 nullable、皆有 blank-guard CHECK（`sanci_products_code_not_blank` 同款式）；`customer_code` 額外有 partial UNIQUE index（`where customer_code is not null`）——**先查過 36 筆真實匯入資料再決定加**（零重複才加，不是照抄 0010 的慣例不查就加），`email` 刻意沒有 unique；`fn_audit_row` **完全沒有重新定義**（自 0015 以來第二次），因為沒有新表——`customers` 早在 0004 就對到 `CUSTOMER` 前綴，`to_jsonb(new)/(old)` 會自動帶出新欄位；`customers` 的 RLS **一個字都沒動**，硬性要求靠的是既有的 `c_partner_read`（0007），不是本次新加的東西 |
| P2-60 | 一次性匯入腳本 `web/scripts/import-customers/`（36 筆，跑一次） | `UNVERIFIED` | 沿用 `import-master-data/` 的所有慣例（同樣兩種登入方式、同樣「在自己電腦跑，不進部署」的框架）；`normalizePhoneID()` 從 `web/lib/orders-shared.ts` **逐字**搬過來（不是重寫，是複製）；2 筆 `phone: null`（Ibu Swanny、Mina）依 schema NOT NULL 規定**跳過**，腳本結尾明確列出姓名；電話裡帶括號備註的（例："087875714156 (Ibu Alin-agent properti)"）先拆出括號內文字轉存進 `notes`，剩下的數字再正規化；去重靠 `phone_normalized`：找到既有列只補**空欄位**（不覆蓋人已經編輯過的值），沒找到才 INSERT，`created_via_partner_id`/`created_via_branch_id` 皆寫 NULL——這就是硬性要求生效的地方 |
| P2-61 | `integrations/sheets-so-filler/Code.gs`：Q2（Code Customer）改為照抄 `customer_code` | `UNVERIFIED` | 舊版固定清空 Q2（"系統沒有客戶代碼"這句話現在過期了）；改成有 `customer_code` 就寫，沒有就照舊清空；連帶處理 0017 尚未執行時的優雅降級（PostgREST 對整個 SELECT 回 42703，跟 0014 的 `shipping_address` 是同一種症狀，用同一套「先試最寬、被拒就拿掉那個欄位重試」邏輯，這次擴充成兩個獨立可選欄位而不是一個） |

**Migration `0017_customer_code_email.sql` 狀態**：**`VERIFIED`(production)** —
2026-08-20 Jenzo 執行成功並回貼驗證結果，**24 項數字與期望完全相符**（含
`CUSTOMER_EMAIL_UNIQUE 0`〔刻意不設唯一〕、`CUSTOMER_POLICIES 4`〔RLS 完全
未變動〕、十三個 audit 保留斷言全 1）。本機 Postgres 16 完整重放
`0001→…→0016→0017`
後：驗證區塊 **24 項全數符合期望**（含關鍵斷言 `CUSTOMER_CODE_UNIQUE_PARTIAL
1`、`CUSTOMER_EMAIL_UNIQUE 0`、`CUSTOMER_POLICIES 4`——這一項是 RLS 完全未變
的直接證據，以及十三個 `AUDIT_KEEP_*`/`REFS_CHECK_CUSTOMER` 保留斷言全
1——證明 `fn_audit_row` 真的沒被碰過，不是宣稱）；行為測試 **6/6 PASS**
（`supabase/test-harness/50_behavior_0017.sql`：`customer_code`/`email` 填空
字串皆被 CHECK 擋下；兩筆 `customer_code` 都是 NULL 可以共存；兩筆
`customer_code` 都填同一個值被 unique index 擋下；**匯入形狀的客戶
（`created_via_partner_id`/`created_via_branch_id` 皆 NULL、沒有任何訂單）
admin 看得到、分店帳號讀到零筆**——這是本切片的核心，不是附帶測試）；冪等連
跑 3 次 `pg_dump -s`（濾除 `\restrict`/`\unrestrict` 雜訊，LESSONS #33）**零
漂移**，24 項驗證數字第 3 次重跑後逐字相同。0001/0004/0005/0008/0009/0010/
0011/0012/0013/0014/0015/0016 十二個舊檔尾**一個數字都沒變**（已逐一實
測）。typecheck ✓ eslint ✓ build ✓（`/offline` 仍 `○` 靜態預渲染——這一刀只
碰 SQL + 一個 `.gs` 檔，跟 web/** typecheck 完全無關，符合預期的 no-op 佐
證，同 0015 的紀律）。

**匯入腳本狀態說明（誠實邊界）**：這個 sandbox 環境**沒有真實 Supabase 憑
證**（不像 0016 之前的每一刀，這次連 `.env.local` 都沒有指向真專案），所以
`web/scripts/import-customers/run.mjs` **實際上不可能在這裡真的跑一次**。
已完成的驗證僅限於：①程式碼審閱（比對 `normalizePhoneID` 逐字相同、比對
`import-master-data/run.mjs` 慣例）；②本機 Postgres 16 harness 的 schema/RLS
層驗證（上面 24 項 + 6 項行為測試，證明資料庫這一側完全準備好接收這個腳本的
寫入）；③抽離腳本核心邏輯（電話正規化／括號備註拆分／依 `phone_normalized`
去重＋補空欄位）成純 JavaScript 在 Node 裡模擬跑過全部 36 筆資料（無網路、無
資料庫）——**模擬結果**：34 筆電話可正規化（2 筆 `phone: null` 照樣跳過）、
**發現資料本身有 1 組真實重複**（"Ibu Rosemary" 用同一支電話出現兩次，
`A/26-NS/017` 與 `A/26-NS/028`）——去重邏輯正確地把兩筆併成 1 筆客戶，模擬
出的最終數字是 **33 筆新建 + 1 筆「已完整無需更動」+ 2 筆跳過 = 36**。**真
的把資料寫進 Supabase 這一步，只有 Jenzo 用他自己的憑證在自己電腦上跑才能
驗證**——這條界線寫在 `web/scripts/import-customers/README.md` 開頭。

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **`customer_code` 的 partial unique index 只驗證過目前這 36 筆資料**——不
  是「證明了系統設計上永遠唯一」，是「這批真實資料裡沒有重複，所以現在加上
  是安全的」。如果哪天真的需要兩個客戶共用一個代碼，這個 index 要用新的
  migration 明講原因撤掉，不能悄悄放寬。
- **「匯入客戶分店看不到」完全靠寫入者自律，不是 schema 強制**——0017 沒有
  加任何 CHECK/trigger 強迫 `created_via_partner_id`/`created_via_branch_id`
  必須是 NULL；這兩個欄位本來就可以被任何 admin 寫入任何值。硬性要求成立是
  因為匯入腳本每次都明確寫 NULL，不是資料庫層面不可能被打破的保證。
- **UI 完全沒有變動**——沒有任何畫面能顯示/編輯 `customer_code`/`email`
  （包括 Admin 客戶列表/詳情頁）。Owner 這次只要求資料進去，沒有要求畫面跟
  著改；如果之後要在畫面上看到這兩個欄位，是另一個切片。
- **`web/lib/audit-format.ts` 沒有改動**——依 LESSONS #28 的判斷標準（actor
  UUID／storage path／內部鍵才需要 SKIP，enum／boolean 才需要 LABELS）逐項
  檢查過：`customer_code`/`email` 都是應該原樣顯示給人看的業務文字欄位，不
  是需要隱藏或翻譯的那一類，所以這個檔案本來就不需要動——不是漏做。
- **production 尚未執行本 migration，匯入腳本也尚未實際跑過**——所有驗證數
  字皆本機 Postgres 16 測得（schema/RLS 這一側）+ Node 純邏輯模擬（腳本邏輯
  這一側）。待 Jenzo 依序：①在 Supabase SQL Editor 貼上
  `0017_customer_code_email.sql` 全文執行，回貼 24 項驗證結果核對；②在自己
  電腦用 `web/scripts/import-customers/README.md` 的兩種憑證方式之一跑
  `run.mjs`，回貼結尾摘要（新建/更新/已完整/跳過的筆數）核對——兩步驟缺一
  不可，跟 `import-master-data/` 的兩步驟交接模式完全一致。

### Phase 2 第十二切片（Kalkulator Penawaran，2026-08-20，Jenzo 定案）

Owner 需求："UI 清楚,有照片,有數量有編號跟文字，價格"——分店staf要能在客戶面前
現場建立快速報價：選產品、填單價（目錄本身零價格，0010 鐵律）、調數量、套用折
扣鏈、即時看總價。**兩個明確跟本 app 其他頁面不一樣的 owner 拍板**（不是漏做
權限檢查，寫在這裡免得日後被誤判為漏洞）：

1. **純計算器，不是訂單**——使用期間**完全不寫入資料庫**，狀態只存
   localStorage（`web/lib/calculator-shared.ts`）。畫面上明講這件事
   （`calcIntroNote`）。
2. **折扣鏈不設 can_discount/can_edit_offer 權限門檻**（0014/0015 平常會擋）
   ——**每一間分店**都能用這個畫面的折扣鏈算給客戶看，跟他們對真實訂單的折
   扣權限無關。安全性成立的理由：計算過程什麼都沒寫進 `order_sanci_offers`，
   只有按下「Buat Pesanan」轉成真訂單時，套用折扣鏈的動作才會實際發生——而
   那個動作呼叫的是**跟 OfferSection 完全相同的** `setOrderOfferBranch`，
   RLS/trigger（0014/0015 的 can_edit_offer/can_discount）照常生效，沒有繞過
   （已核對：`web/app/cabang/pesanan/baru/new-order-form.tsx` 的
   `applyCalcHandoffIfNeeded` 呼叫路徑跟 `offer-section.tsx` 一字不差，唯一
   例外的是計算器本身，不是這條寫入路徑）。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-62 | `/cabang/kalkulator`：產品搜尋/分類篩選 + 加入購物車 + 單價/數量編輯 + 折扣鏈（多段%連乘 + markup + 現金折讓）+ 即時 subtotal→折扣後→markup後→最終金額分解 + sticky 底部總額列 | `UNVERIFIED` | 資料源與 `/cabang/produk` **完全相同**（`sanci_products` status ACTIVE，`sanci_catalog_access` 同一套 gate，未開通katalog時同樣清楚說明而非靜默空白）。折扣鏈數學**逐字**照抄 `fn_compute_order_offer_final`（0015）與 `offer-section.tsx` 的 client math：每段 ×(1-p/100) 連乘、再 ×(1+markup/100)、再 −cash，**只在最終結果 round() 一次**——畫面上的 breakdown（Subtotal/折扣後/Markup後）另外各自 round() 純供顯示，不會回饋進最終數字的計算，避免中途取整跟單一 round 的正式公式產生分歧（`lib/calculator-shared.ts::computeChainFinal` 有詳細註解）。UI 用 `.tabs`/`.tab`（Produk / Keranjang）分開瀏覽跟結算，避免單頁過長；產品清單可獨立捲動，sticky 底部列（`position:fixed`，自建 CSS Module 遵守 STYLE CONTRACT token）在兩個分頁都常駐顯示件數+最終金額，符合 owner「好計算」要求（客戶看得到即時數字）。草稿走 localStorage 防抖自動存（800ms，`lib/calculator-shared.ts` 仿 `use-local-draft.ts` 的「絕不靜默還原，只彈 Lanjutkan/Buang」原則，但實作是獨立函式組不是同一個 hook——資料形狀是陣列不是表單欄位）。重用既有元件而非重造：`STOCK_STATUS_CHIP`/`stockStatusLabel`、`.code`/`chip qty` chip 分類、`formatIDR`/`parseIDRInput`、`DraftBanner`（`values:{}` 因為它只讀 `savedAt`，見元件內註解）。三語系（id/en/zh）全部走 `Messages`，簡體字串已跑禁用詞掃描零命中，id/en 兩區塊掃描 CJK 殘留零命中。首頁（`/cabang`）新增「Kalkulator Penawaran」入口，跟「Produk SANCI」同一個 `produkVisible` gate（katalog table 存在就顯示，enabled 與否由頁面本身說明，不影響入口可見性）。typecheck ✓ eslint ✓ build ✓（`rm -rf .next && npm run build` 全綠，`/cabang/kalkulator` 出現在路由表，`/offline` 仍 `○` 靜態預渲染）。**沒有新 migration**——完全前端功能，符合任務要求「若發現需要 migration 就停下重新考慮範圍」，本切片始終不需要 |
| P2-63 | 「Buat Pesanan」交接到 `/cabang/pesanan/baru`：**明訂能帶過去/不能帶過去什麼**（⚠️ **已被下方「第十五切片」修正** — ②的「刻意不帶過去」結論已不成立，見該切片） | `UNVERIFIED` | 這是委派描述裡要求仔細想清楚的部分,完整推理記在下面獨立段落，這裡只記當時的最終決定：①**能帶過去**——小計（subtotal）與完整折扣鏈（discount_pcts/markup_pct/cash_discount），透過**一次性** localStorage handoff（`lib/calculator-shared.ts::CalcHandoff`，跟自動存檔的草稿是兩個不同 key，交接完就清除，不是持續同步）。到了新訂單頁,staf 看到摘要橫幅（`calcHandoffBanner`）,按「Gunakan angka ini」才會：(a) 把小計填進既有的「Total belanja pelanggan di toko（選填）」欄位（`partner_purchase_amount`，語意本來就是「幫 SANCI 準備報價參考」,重用而非濫用）；(b) 標記「訂單建立成功後自動套用折扣鏈」。訂單真的建立成功後（不管走一般 path 還是 confirmed-after-timeout path 都有接上）,呼叫**跟 OfferSection 同一個** `setOrderOfferBranch`,結果不管成功或失敗都會顯示明確橫幅（成功：`calcHandoffAppliedOk`；分店沒有折扣權限等原因失敗：`calcHandoffAppliedFailed`,非致命,訂單本身仍算建立成功——best-effort 模式跟 `copyPackageItemsToOrder`/invoice 上傳同一套原則,絕不因為這步失敗就假裝訂單沒建好）。**全程不繞過** can_edit_offer/can_discount——calculator 本身沒有的權限門檻,在這一步透過 RLS/trigger 原樣生效。②~~**刻意不帶過去**——計算器裡的**逐項產品清單與每行單價**完全不會自動變成 `order_items`~~ **這條決定已被下方第十五切片推翻**：owner 要求補上這個缺口，逐項產品清單（名稱/代碼/數量）現在會自動帶過去，單價則視 `can_edit_offer` 而定（見 P2-70）。舊的 UI copy（`calcHandoffScopeHint`/`calcConvertScopeNote`）已同步改寫，不再講「不會帶過去」 |
| P2-64 | 「Buat Pesanan」範圍決定背後的完整推理（為什麼當時不做逐項 order_items 自動帶入） | 已被 P2-70 部分推翻，理由保留供對照 | 查過 `web/app/cabang/pesanan/[orderId]/order-items-section.tsx`（cabang 側）：能改的欄位只有 note/color_code/custom_size/quantity，**完全沒有 unit_price/line_discount**——那兩欄的編輯 UI **純粹是 admin 端才有**（`order-items-section.tsx` 的檔頭註解自己寫「TIDAK ada kolom harga di sini sama sekali — itu murni sisi admin」，這句話至今仍真——cabang 端手動編輯 order_items 依然沒有價格欄位，改變的只是「Buat Pesanan」這個自動交接的寫入路徑），DB 層雖然 `fn_guard_order_item_price_cols`（0014）允許 can_edit_offer 的分店寫入這兩欄，但**當時沒有任何 cabang 端畫面呼叫這條路徑**。同時 `createCustomerAndOrder`（訂單建立本身）完全是 Package-based（0008）,品項來自 `copyPackageItemsToOrder` 複製 Package 內容,**不接受呼叫端傳入任意品項清單——這件事本身沒有變**,計算器裡憑空選的產品組合（不對應任何既有 Package）依然沒有寫入`createCustomerAndOrder`本身的位置。**P2-70 沒有推翻這個結論**，而是繞開它：新增一條**獨立於訂單建立本身**的第二段 best-effort 寫入（`copyCalcCartItemsToOrder`，在訂單建立成功**之後**呼叫，跟 `setOrderOfferBranch` 同一個模式），不改動 `createCustomerAndOrder`/`copyPackageItemsToOrder` 一個字。當時的結論「唯一誠實、不用新造 schema/UI 就能安全帶過去的東西是數字，不是品項」，準確地說應該是「不用新造 schema/UI 就能帶過去的是數字；品項需要一條新的獨立寫入路徑，但也不需要新 schema」——當時判斷「品項做不到」是因為只考慮了`createCustomerAndOrder`內部這一條路徑，沒有考慮訂單建立**之後**再补一段獨立寫入的可能性 |

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- ~~**逐項產品/單價不會自動流入 order_items**~~ ⚠️ **已在下方第十五切片
  （P2-70）補上**——當時的推理（見 P2-64）沒有錯,只是只考慮了「訂單建立
  本身改成接受品項清單」這一條路徑；後來補上的做法是訂單建立**成功之後**
  再加一段獨立的 best-effort 寫入,不動 `createCustomerAndOrder` 本身。
  cabang 端手動編輯 order_items 依然沒有 unit_price 欄位（P2-64 那句話這部
  分還是真的）。
- **不驗證 katalog 之外的商品**——計算器只能加入 `sanci_products` 目錄裡的
  產品,不支援臨時手打一個目錄外的品項/價格列（例如客戶想要目錄沒有的客製
  品）。這跟 `/cabang/produk` 的資料源一致,不是刻意縮減,只是同一個既有限制
  延伸過來。
- **計算器草稿與 handoff 都只存這台裝置的瀏覽器**——換裝置/換瀏覽器看不到彼
  此的計算器草稿,這是 localStorage 本質限制,跟其他草稿功能（Local Draft,
  Phase 1 #17）一致,不是本切片特有的坑。
- **沒有新 migration**——純前端切片,`order_sanci_offers`/`order_items` 的
  schema 與 RLS/trigger 完全沒有改動,`setOrderOfferBranch`/
  `updateOrderItemFields` 這兩個既有 Server Action 也**完全沒有被修改**（只
  是從新畫面呼叫既有函式）。

### Phase 2 第十三切片（customer_code 自動編碼，2026-08-21，owner 定案）

Owner 原話（要靈活編輯）："SANCI 已經手動給自己的直客編號，格式
`{SourceCode}/{YY}-{SalesCode}/{SeqNo}`（例：`A/25-C/001`、`E/26-KEN/019`）——
現在要讓系統自動生成，但來源代碼表跟業務員名單都要能新增/停用，不能寫死"。
0017 匯入的 36 筆舊資料本身**不受影響**（`customer_code` 是它們自己的文字
欄位，這一刀完全沒有回頭改寫過去的值——只有「以後新增的 SANCI 直客」才會
走自動編號）。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-65 | Migration `0018_customer_code_generation.sql`：兩張 admin-only 主檔 `customer_sources`（5 筆種子）/`sanci_sales_staff`（7 筆種子）、`customers.source_id`/`sales_staff_id`（皆 `ON DELETE RESTRICT`）、`customer_code_seq`（純 SEQUENCE，非 counter-table——沒有分區鍵，見檔頭理由）、trigger `fn_set_customer_code`（BEFORE INSERT customers：兩欄都填才生成，客戶端已填的 `customer_code` 永不覆蓋） | **`VERIFIED`(production)** — 2026-08-21 Jenzo 執行成功並回貼驗證結果，**43 項數字與期望完全相符**（含 `SOURCE_NONADMIN_POLICIES 0`、`SALES_NONADMIN_POLICIES 0`、`GEN_CODE_ONLY_SOURCE_NULL 1`、十五個 audit 保留斷言全 1）。 | 本機 Postgres 16 完整重放 `0001→…→0017→0018`：驗證區塊 **43 項全數符合期望**（含直接在驗證區塊本身插入測試客戶、讀回真實生成的字串比對——不是只斷言 trigger「存在」）；`fn_audit_row` 定義來源確認是 0016（0017 沒碰過），完整複製後只加兩行 CASE（`CUSTOMER_SOURCE`/`SALES_STAFF`），十五個 `AUDIT_KEEP_*` + `REFS_CHECK_CUSTOMER` 全 1。行為測試 `supabase/test-harness/60_behavior_0018.sql` **20/20 PASS**：種子資料核對（5 來源+7 業務員，逐筆比對 code/label/name）；生成格式**逐字**比對（`A/26-NS/003`，用 sequence `last_value` 算出精確期望值，不是只驗證格式）；preset 值不被覆蓋；只填 source_id（沒填 sales_staff_id）不生成；連續 loop-insert 10 筆確認 10 個不重複連號；分店帳號兩張主檔皆讀 0 筆、寫入被拒；停用來源不回頭改舊客戶的 `customer_code`、也不擋用其他啟用中來源建新客戶；FK RESTRICT 擋刪除仍被引用的來源/業務員（直接 SQL DELETE 測試）；`CUSTOMER_SOURCE_CREATED`/`SALES_STAFF_CREATED`/`CUSTOMER_SOURCE_STATUS_CHANGED` 稽核事件核實出現。冪等連跑 3 次 `pg_dump -s`（濾除 `\restrict`，LESSONS #33）**零漂移**；額外驗證 `pg_dump -s` **不含**序列目前值（只有 `START WITH 1` 定義，`last_value`/`setval` 不在 schema-only dump 裡）——避免序列狀態被誤判為 drift。**施工中修正一個真實 bug，不是憑空猜的**：種子資料原本寫 `ON CONFLICT (code) WHERE status='ACTIVE' DO NOTHING`，本機實測發現當某代碼被 admin 停用後重跑遷移會**靜默插入第二筆同代碼的 ACTIVE 資料**（partial index 的 WHERE 子句不再命中已停用的舊列）——改成 `WHERE NOT EXISTS (SELECT 1 FROM ... WHERE code = v.code)`（不分狀態）後重測確認修好，寫進 LESSONS |
| P2-66 | `web/app/admin/pelanggan/`：新頁面，列表（搜尋姓名/電話/代碼 + 顯示來源/業務員/Kode Pelanggan chip + 建立方式區分 SANCI 直營 vs 哪個 partner/branch）+「Tambah Pelanggan」彈窗（Sumber/Sales 下拉，成對驗證，存檔後明示生成的代碼）+ 兩個主檔管理分頁（Kode Sumber Tamu / Kode Sales，表格+狀態切換+新增表單，仿 `partner-actions.tsx`/`package-actions.tsx` 的 confirm+rowcount 慣例） | `UNVERIFIED` | `web/app/admin/actions-customers.ts`（新檔）：`createCustomerAdmin`/`createCustomerSource`/`updateCustomerSource`/`setCustomerSourceStatus`/`createSalesStaff`/`updateSalesStaff`/`setSalesStaffStatus`，全部走 `pesan(m)`/`safeWrite`/`client_request_id` 冪等 + 42P01/42703 優雅降級（0018 尚未執行時列表頁自動退化成只顯示基本欄位，不隱藏整頁）。`actions-lookup.ts` 新增 `customer`/`customerSource`/`salesStaff` 白名單。三語系（id/en/zh）全部走 `Messages`，新增約 50 個 key；簡體字串禁用詞掃描零命中。`admin-nav.tsx` 新增「Pelanggan」入口，順序放在 Produk 之後、Partner 之前（沿用既有註解「日常使用頻率」邏輯）。`web/lib/audit-format.ts`：`source_id`/`sales_staff_id` 歸入 SKIP（純 UUID 關聯，跟 `package_id`/`product_id` 同類——`customer_code` 本身已經是人類看得懂的值，Activity 畫面不需要再顯示 UUID）；`customer_sources.label` 新增欄位標籤；六個新稽核動作（`CUSTOMER_SOURCE_*`/`SALES_STAFF_*`）加入 `ACTION_KEYS`。`GLOSSARY.md` 新增「Kode Pelanggan」「Sumber」兩列 + 一段說明：`sanci_sales_staff` 沿用既有「Sales」譯法（跟 order 建立時的 Sales/PIC 下拉是同一個詞、不同表，畫面分頁本身已足夠區分，不另造新詞）。`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、`npx eslint .` ✓、`rm -rf .next && npm run build` ✓（`/admin/pelanggan` 出現在路由表，`/offline` 仍 `○` 靜態預渲染） |

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **沒有批次改派業務員/來源的工具**——已生成的 `customer_code` 是凍結文字，
  改主檔的 code/label 只影響**之後**新生成的客戶，不會回頭改寫任何一筆舊
  客戶的 `customer_code`（migration 頭部已寫明這是刻意決定：主檔代碼是穩定
  識別碼，改名是 admin 罕見的主動操作，不是需要「同步回歷史」的東西）。
- **沒有針對個別 source/sales 客製化代碼格式**——所有生成都走同一個公式
  `{SourceCode}/{YY}-{SalesCode}/{SeqNo}`，不支援某個來源用不同格式。
- **停用主檔一列不會提示/擋下正在使用該列的客戶**——FK RESTRICT 只在真的
  嘗試「刪除」時擋（UI 完全沒有刪除入口，只有停用），停用本身永遠允許。
- **匯入腳本（`web/scripts/import-customers/`）完全沒被碰**——36 筆舊資料的
  `customer_code` 保持純文字，不會回填 `source_id`/`sales_staff_id`（它們
  歷史上用的 sales 縮寫如 "Ken" 本來就不在 owner 現在給的 7 人名單裡，這是
  預期中的落差，不是遺漏）。

### Phase 2 第十四切片（分店客戶自動編碼，2026-08-21）

> ⚠️ **格式尚未經 Jenzo 在加入業務代碼後重新確認 —— 請務必檢查！**
> `{PartnerCode}-{BranchCode}-{StaffCode}/{YY}/{SeqNo}`，**實際生成範例：
> `GH-BSD-AS/26/001`**（Golden Home、BSD 分店、業務員代碼 AS、2026 年、
> 該分店今年第一筆）。詳見 `scratchpad/plan-0019-branch-customer-code.md`
> ——owner 只確認到「要有分行編號＋業務代碼」，具體格式是這一刀依照既有
> `order_number`（0004）風格提出的工作設計，尚未逐字拍板。如果形狀不對，
> 需要新一版遷移調整（`customer_code` 已生成的舊資料不會自動改寫，同
> 0018 的「凍結文字」原則）。

Owner 原話（跨多則訊息累積）："分行的編號呢" — 分店自己的客戶也要有代碼，
但規則要跟 0018 的 SANCI 直客不同；"可以自動產生,但是可以清楚知道哪一個
分行"；"要加上業務/店員代碼"（跟 0018"Sales"精神一樣，但用
`partner_staff`，不是 `sanci_sales_staff`）；"gd-bsd-多這種的類似"——風格
沿用既有 `order_number`（0004）。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-67 | Migration `0019_branch_customer_code.sql`：`partner_staff.code`（新欄，nullable，unique 於 `(partner_id, code)`）、`customers.attributed_staff_id`（新欄，FK→`partner_staff` `ON DELETE RESTRICT`）、新表 `partner_customer_counters`（PER 分店 PER 年，年度到就重置——跟 0018 的 GLOBAL sequence 刻意不同，理由見檔頭）、`fn_next_customer_seq`（mirror `fn_next_order_seq` 鎖列邏輯）、`fn_check_customer_staff_ref`（驗證 `attributed_staff_id` 屬於同一個 partner，mirror `fn_check_order_refs`）、`fn_set_customer_code` **重新定義**（不是新 trigger——同一個函式用 if/elsif 同時處理 0018 SANCI 直客 與 0019 分店建立兩條路徑，理由寫在檔頭；0018 路徑逐字保留未動） | **`VERIFIED`(production)** — 2026-08-21 Jenzo 執行成功並回貼驗證結果，**22 項數字與期望完全相符**（含 `COUNTER_POLICIES 0`、`NEXT_SEQ_EXEC_PUBLIC/_ANON/_AUTHENTICATED` 全 0〔LESSONS #26〕、`STAFF_POLICIES`/`CUSTOMER_POLICIES` 皆證明 RLS 未被動過）。 | 本機 Postgres 16 完整重放 `0001→…→0018→0019`：驗證區塊 **21 項全數符合期望**（結構檢查，不含真實 insert——理由：0018 的做法是在驗證區塊直接寫測試客戶進 `customers`，因為 `customer_sources`/`sanci_sales_staff` 是該遷移自己 seed 的全新主檔；0019 若比照會需要寫一筆測試 Partner/Branch 進生產表，污染 Jenzo 的 Partner 清單，所以字串證明改放測試套件而非遷移本身）。行為測試 `supabase/test-harness/70_behavior_0019.sql` **18/18 PASS**：`partner_staff.code` 唯一性 scope 是 `(partner_id, code)`，同代碼在不同 partner 可重複但同 partner 內被擋；生成字串**逐字**比對（`PA-A1-SA/26/001`，用 counter `last_seq` 算出精確期望值）；員工沒設代碼／完全沒指派員工兩種情況都是 `customer_code` 留 NULL、不報錯；0018／0019 兩條路徑在同一筆資料上**永遠不會同時觸發**（分別驗證 SANCI 直客與分店建立各自只長出自己的形狀）；`attributed_staff_id` 指到別的 partner 的員工被 `fn_check_customer_staff_ref` 擋下；FK RESTRICT 擋刪除還被引用的員工；年度邊界重置（模擬 2026→2027，同分店歸零、不同分店互不影響）；`fn_next_customer_seq` 拒絕分店帳號直接呼叫、`partner_customer_counters` 對分店帳號回傳 0 筆（LESSONS #26）；`STAFF_UPDATED`/`CUSTOMER_CREATED` 稽核事件照常出現，`fn_audit_row` 不需重新定義。冪等連跑 3 次 `pg_dump -s`（濾除 `\restrict`，LESSONS #33）**零漂移**；counter 表既有列不受重跑影響（遷移本身沒有對它 INSERT，只有 `CREATE TABLE IF NOT EXISTS`）。重跑復原鏈實測：重跑 0018 會讓 `fn_set_customer_code` 掉回舊版（分店路徑消失），重跑 0019 一次即可完全恢復（`prosrc` 直接量測，非推論）。**回歸零**：0014-0018 既有 92 項行為斷言全數重跑，92 PASS 0 FAIL。**施工中發現一個 0018 遺留的既有互動（不是 0019 造成的迴歸，已個別驗證：只裝 0001-0018、不裝 0019 也會出現同樣現象）**：`0018` 的 `trg_set_customer_code` 把空字串 `customer_code=''` 靜默轉成 `NULL`（設計用意是讓半填的表單不報一個看不懂的 23514），但這個轉換發生在 CHECK constraint（0017）看到值**之前**，導致 `50_behavior_0017.sql` 原本斷言「空字串會被 CHECK 拒絕」的 T1 從 0018 上線那一刻起就不再成立——已更新該測試以斷言目前真實行為並記入 LESSONS #37，`0017_customer_code_email.sql` 本身（CHECK constraint 定義）一個字元都沒被動過 |
| P2-68 | 分店端 UI：`web/app/cabang/staff/[branchId]/**` 與 admin 端 `web/app/admin/partners/[id]/branches/[branchId]/**`（新增/修改員工表單）皆加上「Kode Staf」欄位（選填、大寫字母/數字、建立時從姓名自動建議初始值但可自由覆蓋/清空——純 UI 便利，資料庫從不強制）；兩處員工列表卡片顯示代碼 chip。分店端 `web/app/cabang/pelanggan/**`（列表卡片 + 詳情頁）新增顯示 `customer_code` chip（原本這兩頁完全沒有這個欄位——0017/0018 只加了 admin 端顯示）| `UNVERIFIED` | `web/app/admin/actions-staff.ts`（分店與 admin 端共用同一份）：`createStaff`/`updateStaff` 新增 `code` 參數，走 `pesan(m)`/`safeWrite`/兩個 unique constraint（`client_request_id`/`partner_staff_code_partner_key`，LESSONS #21/#27 逐一翻譯錯誤訊息）+ 42703 優雅降級（LESSONS #12）。`web/lib/staff-code-suggest.ts`（新檔）：兩處表單共用同一份初始值建議邏輯，避免 LESSONS #27 那種「複製到兩處、只驗一處」的漂移。三語系（id/en/zh）新增約 12 個 key，簡體字串禁用詞掃描零命中。`web/lib/audit-format.ts`：`attributed_staff_id` 歸入 SKIP（純 UUID 關聯，`partner_staff.code` 本身則**不需要**新增規則——早就靠 `code: c.code` 這條通用欄位名對照涵蓋，跟 partners/branches/customer_sources/sanci_sales_staff 的 `code` 共用同一條規則）。`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、`npx eslint .` ✓、`rm -rf .next && npm run build` ✓、`/offline` 仍 `○` 靜態預渲染 |
| P2-69 | **業務員歸屬設計決策**：`web/app/cabang/pesanan/actions.ts` 的 `createCustomerAndOrder`（建客戶+訂單同一步，最常見路徑）重用**已經**被 `verifyActiveStaffInBranch` 驗證過的 `sales_staff_id` 作為新客戶的 `attributed_staff_id`（驗證順序特意移到建客戶**之前**，避免驗證失敗卻已經留下孤兒客戶）；`createCustomerOnly`（獨立「Simpan Pelanggan Saja」按鈕，跟訂單表單共用同一個 `<form>`）新增可選 `salesStaffId` 參數——表單上業務員欄位如果使用者填了就一併送出並驗證，沒填（最常見情形）則 `attributed_staff_id` 留 NULL，不報錯。**沒有新增獨立的員工選擇器 UI**——因為讀了現有程式碼後確認訂單建立表單裡本來就有一個業務員下拉選單，兩個入口共用同一份即可 | `UNVERIFIED` | 決策依據見 migration `0019_branch_customer_code.sql` 頭部「KEPUTUSAN DESAIN ATRIBUSI STAF」整段，含讀碼證據（三個具體事實：訂單建立已強制業務員欄位、獨立存客戶按鈕原本完全不送業務員、分店端 Pelanggan 頁面沒有建立表單只有列表+編輯） |

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **格式未經 owner 逐字拍板**（見上方警示框）——這是本切片最重要的待確認
  項目，優先於其他所有細節。
- **沒有批次替既有員工補上代碼的工具**——舊員工 `code` 維持 `IS NULL`，
  直到分店/admin 自己用「Ubah Staf」逐一補上（跟 0018 對舊主檔代碼的
  態度一致）。
- **資料庫層沒有驗證「員工必須是 ACTIVE 狀態」才能生成代碼**——沿用 0018
  對 `source_id`/`sales_staff_id` 的同一個立場（FK 不管狀態）；真正擋
  INACTIVE 員工的是應用層的 `verifyActiveStaffInBranch`，不是資料庫。
- **沒有讓分店自己搬移/合併員工代碼衝突的工具**——`(partner_id, code)`
  唯一性衝突時，Server Action 直接回報「這個代碼已被使用」，沒有自動改名
  或建議替代代碼的機制。
- **`customers.attributed_staff_id` 只有兩條寫入路徑**（見 P2-69），透過
  `web/app/cabang/pelanggan/actions.ts` 的 `updateCustomer`（只能改既有
  客戶，不能建立）永遠不會寫到這個欄位。

### Phase 2 第十五切片（Kalkulator 品項交接補完，2026-08-21，owner 定案）

Owner 要求把第十二切片（P2-62/63/64）當時明講「刻意不做」的缺口補上：計算器
購物車裡的**逐項產品清單**（不只是小計＋折扣鏈的數字）要能一起帶進「Buat
Pesanan」建出來的訂單。完整背景見上方 P2-63/P2-64（已在原地修正，不是留著
不管）——當時的判斷本身沒有錯，只是只評估了「訂單建立本身
（`createCustomerAndOrder`）改成接受任意品項清單」這一條路徑；這次做法是
**訂單建立成功之後**再補一段獨立的 best-effort 寫入，完全不動
`createCustomerAndOrder`/`copyPackageItemsToOrder` 一個字。

**驗證 0014 的分店 INSERT policy 是否真的足夠（委派任務要求先查再動手）**：
讀了 `oi_partner_insert` 的完整定義（`0014_permissions_items_shipping.sql`
§8）——`with check (exists (select 1 from partner_orders o where o.id =
order_items.order_id and fn_can_edit_branch(o.branch_id) and o.status =
'REGISTERED'))`。剛建立的訂單一定是 `REGISTERED`、一定是建立者自己分店的
訂單（`fn_can_edit_branch` 對自己分店恆真），結論：**這條 policy 對這個用
途完全足夠，不需要新 migration**——跟委派任務的預期一致。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-70 | Kalkulator 購物車品項（產品/名稱/代碼/數量/單價）隨「Buat Pesanan」一起交接進 `order_items` | `UNVERIFIED` | **Hand-off 擴充**（`web/lib/calculator-shared.ts`）：`CalcHandoff` 新增 `lines: CalcHandoffLine[]`（productId/name/code/unitPrice/qty），跟既有的小計/折扣鏈欄位共用同一個 key、同一套「讀一次就清除」語意——沒有新增第二個 localStorage key，也沒有改變既有的一次性/ephemeral 特性。`kalkulator-client.tsx` 的 `handleConvertToOrder` 寫入時原樣附上 `lines`（name/code 只給 banner 摘要用，實際寫入前會重新從 `sanci_products` 撈一次，見下）。**新 Server Action**（`web/app/cabang/pesanan/actions.ts::copyCalcCartItemsToOrder`，緊鄰 `setOrderOfferBranch` 之上）：逐字複刻 `copyPackageItemsToOrder` 的 idempotency/error-handling 慣例——`client_request_id` 用 `{orderClientRequestId}:calc-item:{product_id}` 確定性鍵（重試不會產生重複行）；name_snapshot/code_snapshot 一律**重新**從 `sanci_products` 撈（不信任 localStorage 快照，LESSONS #6）；unit_price/qty 則保留 client 輸入（katalog 本身沒有價格，0010，店員手填的價格沒有更權威的來源可撈）；best-effort，呼叫時機在訂單**已經**建立成功之後，失敗絕不影響已建立的訂單。**價格欄位降級**：`trg_order_item_price_guard`（0014）對 `unit_price` 的把關原樣生效——分店沒有 `can_edit_offer` 時 INSERT 帶 `unit_price` 會被 trigger 拒絕（訊息含"Kolom harga per baris"字串，程式碼比對這段文字而非倚賴 SQLSTATE，因為 `raise exception` 沒指定代碼，預設落在通用的 P0001），程式碼**捕捉這個特定拒絕**、同一行**不含 unit_price 重試一次**——商品照樣建立（name/code/qty 齊全），只是沒有價格；回傳值 `priceGuardDegraded` 讓呼叫端知道發生了這個降級,不當成錯誤處理,也不悄悄吞掉。**呼叫點**：`new-order-form.tsx` 的 `applyCalcHandoffIfNeeded`（跟 `setOrderOfferBranch` 完全同一個呼叫時機、同一個觸發條件——只有staf按過「Gunakan angka ini」的 `calcApply` 為真才會執行）,兩段寫入（折扣鏈／品項）各自獨立 best-effort、各自有自己的結果橫幅（`calcOutcomeMsg`／新增的 `calcItemsMsg`）,不會互相影響彼此的成功/失敗判定。**文案**：`calcHandoffScopeHint`（交接前橫幅）／`calcConvertScopeNote`（計算器頁面底部）兩處原本明講「產品清單不會帶過去」的舊承諾已改寫為新行為的誠實敘述；新增 `calcItemsAppliedOk`/`calcItemsAppliedPriceNote`/`calcItemsAppliedPartial`/`calcItemsAppliedFailed` 四個 key,分別對應全部成功（可能附帶價格降級提示）／部分成功／全部失敗三種結果,三語系（id/en/zh）全部走 `Messages`,`satisfies Shape` 型別檢查會抓漏翻。**沒有新 migration**——完全複用 0014 既有的 `oi_partner_insert` policy 與 `trg_order_item_price_guard`（驗證見上方獨立段落）。`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、`npx eslint .` ✓、`rm -rf .next && npm run build` ✓（`/cabang/kalkulator`／`/cabang/pesanan/baru` 皆出現在路由表,`/offline` 仍 `○` 靜態預渲染）;新增簡體字串已跑禁用詞掃描零命中,id/en 區塊 CJK 殘留掃描零命中 |

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **計算器裡目錄外的商品依然不能加入購物車**——沒有改變,見 P2-62 既有限制
  （計算器只能加入 `sanci_products` 目錄裡的產品）。
- **cabang 端手動編輯 order_items 依然沒有 unit_price/line_discount 欄位**
  ——`order-items-section.tsx`（cabang 側）沒有被這一刀觸碰,價格欄位的編輯
  UI 仍然純粹是 admin 端的東西（P2-64 那句話這部分沒有變）。這一刀只是讓
  「Buat Pesanan」這一個特定的自動交接動作,在建立當下把已經在計算器裡填好
  的單價**一併寫入**（如果權限允許的話）,不等於分店現在有了編輯已建立
  order_items 價格的能力。
- **沒有批次修正/重新套用機制**——如果 staf 沒有按「Gunakan angka ini」就
  直接建單（例如手滑跳過banner,或本來就不是從計算器過來的一般建單流程）,
  計算器裡的品項就跟折扣鏈一樣單純被留在原地不會自動生效,hand-off 依然
  存在直到staf下次打開計算器頁面時被判斷為已經舊掉的內容（沿用既有
  一次性 hand-off 邏輯,見 lib/calculator-shared.ts 檔頭）。
- **價格降級沒有補救 UI**——`priceGuardDegraded` 為真時,分店只會在橫幅看到
  誠實的文字說明,沒有提供「事後幫我把價格補上」的按鈕（分店端本來就沒有
  unit_price 編輯 UI,見上,所以這也不是這一刀縮減的範圍,是既有邊界的自然
  延伸）。
### UI/UX 與效能 audit 補跑，2026-08-21

補跑 Audit round 3（2026-08-17）四領域裡因額度中斷而沒做完的兩塊。上一輪的
安全＋正確性結論不受影響，這一輪**完全沒有碰資料庫**——零 migration、零 RLS、
零 schema 變更，也沒有動任何 Server Action 的寫入語意。

審計範圍是**今天的整個 app**，不是 2026-08-17 當時的樣子：8/17 之後新增的
Apple 風設計系統 v2、三語系、chip 視覺體系、Package 產品組成、訂單折扣鏈、
一鍵產生 SO/DO/Invoice、客戶管理頁與 Kalkulator Penawaran 全部納入。

> ⚠️ **一個誠實的範圍缺口**：上面那一節「第十五切片（Kalkulator 品項交接
> 補完）」是本輪 audit **掃完之後**才併進 main 的（兩者平行作業，基準點都是
> `ef2c8b5`）。本輪的結論**沒有涵蓋**該切片新增/改動的程式碼——
> `new-order-form.tsx` 的品項交接段落、`calculator-shared.ts` 的新函式、
> `cabang.ts` 的新文案都沒有被這次的 UI/UX 與效能檢查看過。合併後兩邊的
> `tsc`/`eslint`/`next build` 已對整棵 `web/` 一起跑過並全綠（LESSONS #31），
> 但那是「不衝突」，不等於「已審計」。

**結論：P1 = 2、P2 = 6、P3 = 3，全部已修**；另有 4 項因為需要 owner 判斷或
會動到平行作業中的共用契約，**只回報不動手**（列在最後）。

#### 已修

| 級別 | 問題 | 修法 |
|---|---|---|
| **P1** | `/offline` 是**唯一必須離線可開**的畫面（`public/sw.js` 會把它快取進每台手機），卻在 client bundle 裡塞了整份 `MESSAGES`——common+cabang+admin×三語共 946 個 key，只為了讀 3 個字串。單一物件字面值的屬性無法 tree-shake，所以整本字典都進去了：頁面 JS **45.4 kB**（First Load 148 kB），而其他頁面基準是 103 kB | 改成只 import `common` 這一片（仍是同一份 `satisfies Shape` 真理來源，**沒有複製任何譯文**）。實測 **45.4 kB → 7.67 kB（−83%）**，First Load 148 → 110 kB，且 `/offline` 仍是 `○` 靜態預渲染 |
| **P1** | 兩個訂單詳情頁把互相獨立的查詢排成一串。`/cabang/pesanan/[orderId]`：extras → canManage 那批 → cancelInfo → shipping/items/offer 共**四個**依序的來回，但四者都只需要查主查詢就已知的 `order.id`/`partner_id`/`branch_id`；同一頁還把 `partner_access_policies` **同一列**連續查兩次（`edit_scope` 一次、offer flags 一次，拆開只是為了讓 `can_discount` 的 42703 不要拖垮 `edit_scope`）。`/admin/orders/[orderId]`：`partner_branches` 與 `audit_logs` 各自又是一個獨立階段 | 全部收進既有的 `Promise.all` 波次。cabang 端從約 **9 個序列來回降到 5**，admin 端從 **6 降到 3**；`packageDetail` 與 invoice signed URL 真的依賴前一波但彼此無關，改成同一波。這是分店 staf 每天用手機開最多次的畫面 |
| P2 | 訂單狀態 chip **admin 與 cabang 兩套視覺語言**：cabang 走 `status-badge.tsx` 的 `.chip.ok`/`.chip.neutral`（實心藥丸），admin 兩處卻用 `.chip.ACTIVE`/`.chip.SUSPENDED`（**實體狀態**家族：描邊＋方點）。STYLE CONTRACT §2b 明文把「order status via status-badge.tsx」列為實心藥丸的例子，而且 REGISTERED/CANCELLED 的訂單並不是「Aktif/Ditangguhkan」的實體——在 `/admin/orders` 同一列裡，訂單狀態 chip 與 partner 狀態 chip 會並排出現，正是這套分類法當初要消滅的歧義 | 比照 `catalog-shared.ts` 的 `STOCK_STATUS_CHIP`，在 `lib/orders-shared.ts` 新增 `ORDER_STATUS_CHIP`，三個呼叫點（admin 列表、admin 詳情、`status-badge.tsx`）全部改成 import 常數，class 字串只定義一次 |
| P2 | 兩個折扣鏈表單的分隔線寫 `var(--border, #e5e5e5)`。**合約裡根本沒有 `--border` 這個 token**（是 `--line`），所以永遠走 fallback 的寫死色：亮色底下剛好正確，深色模式下變成黑底上一條近白色的亮線 | 改用 `var(--line)`；上方那個 `fontSize:14` 的 `<h3>` 一併換成合約本來就為這個角色準備的 `.overline` |
| P2 | **admin 側 `loading.tsx` 一個都沒有**，cabang 側有 7 個。每個 admin 頁都是 `force-dynamic` 且卡在 Supabase 查詢上，所以切換導航時畫面停在舊頁、沒有任何「正在載入」的訊號。（§165 記載改版時「loading 改 skeleton」，但實際上只落在 cabang） | 依既有 cabang 模式（只用合約 class、零文案所以不需要 i18n）補上五個常用 admin 路由：`/admin`、`/admin/orders`、`/admin/orders/[orderId]`、`/admin/produk`、`/admin/pelanggan`；`/admin` 那個同時當作更深層 partner 路由的後備 |
| P2 | `/admin/produk` 一次載入**全部產品**（今天 169 筆，且無分頁），而它的 `<img>` **沒有 `loading="lazy"`**——首次載入就把 169 張照片全部抓下來。cabang 端同一份資料的 `/cabang/produk` 從上線起就是 lazy 的 | 補上 `loading="lazy"` + `decoding="async"`，與 cabang 端一致；Package 內容的縮圖同樣補上 |
| P2 | 站內 tab／麵包屑／返回鍵用的是 `<a href>` 而非 `<Link>`：Partner／Cabang／Pelanggan 三個詳情頁的分頁切換、admin 麵包屑、cabang 三個「回首頁」。結果是只改一個 query string 也要**整份文件重新載入**——JS 重新解析、重新 hydrate，`app/admin/layout.tsx` 的兩個驗證查詢也跟著重跑一次 | 全部改 `next/link`。**刻意不動兩處**：`offline-card.tsx` 的「再試一次」（本來就要強制真的重新連網，原本就有 eslint-disable 與註解說明）、`documents-section.tsx` 的列印連結（開新分頁） |
| P2 | `/admin/pelanggan` 每筆客戶都撈 `address`／`email` **但兩個都沒有畫在畫面上**，而這份清單沒有上限；同一頁的五個讀取（客戶＋四張主檔）也是「先一個階段、再一個平行階段」，儘管彼此無關 | 兩個 select（wide／narrow）都拿掉那兩欄；五個讀取併成同一波，只留「0018 沒跑時才會觸發」的 narrow 重試維持序列 |
| P3 | Kalkulator 購物車 56px 縮圖的「沒有照片」字樣是 **10px**，低於合約寫死的全站 13px 下限（同一角色的 `produk.module.css` 用的是 `var(--fs-caption)`，因為那個框大得多） | 13px 字串在 56px 框裡本來也放不下，所以改成單純的灰底方塊——本身已經讀得出「沒有照片」，不用靠縮到違反合約的字級 |
| P3 | 兩個型錄畫面的分類 filter chip 都是 `min-height: 36px` 且**沒有手機加大**，對照合約寫明的 `--tap: 44px`；globals.css 的 `.btn.sm` 早就有 <768px 加大到 44px 的處理。這正是 staf 站在客戶面前用手指點的東西 | 兩個 CSS Module 都補上 `<768px → var(--tap)`；桌機維持 36px（滑鼠不需要） |
| P3 | 產品 `<img>` 上的 eslint-disable 註解寫「詳見 `lib/catalog-shared.ts` 的說明」，但**那份說明根本不存在** | 把它真的寫出來：為什麼這裡用原生 `<img>` 而不是 `next/image`（公開 Supabase bucket＋照片在上傳時就已壓縮過一次），以及代價是呼叫端必須自己負責 lazy／預留空間／`onError` placeholder——這次在 `/admin/produk` 抓到的漏 `loading="lazy"` 正是這個代價沒被履行 |

#### 查過確認沒問題（記下來避免下輪重複查）

- **三語系文案衛生零缺失**：`id`/`en` 兩區塊掃 CJK 殘留零命中；zh 區塊掃 GLOSSARY 的 15 個繁體禁用詞零命中；全 app JSX 文字節點掃硬編英文/印尼文，只命中 `Partner Hub`（品牌名，本來就不翻）。key 集合有 `satisfies Shape` 把關，漏翻是編譯期錯誤。
- **service_role 沒有外洩**：`lib/supabase/admin.ts` 出現在 `"use client"` grep 結果裡只是因為**註解裡提到這個字串**，檔案本身沒有 `"use client"`，也沒有任何 client 元件 import 它。同理 `app/admin/partners/[id]/page.tsx`。
- **沒有橫向捲動**：`body{overflow-x:hidden}` ＋ `.tablewrap{overflow-x:auto}`，寬表格在自己的容器裡捲，頁面本身不會。
- **z-index 疊法正確**：modal/overlay 40 > sticky 頂欄 30 > kalkulator sticky 底欄 25。
- **沒有真正的 N+1 迴圈查詢**（唯一一個在下方「只回報」第 1 點）。
- **`<img>` 全部有 `onError` → placeholder**，不會留破圖。

#### 只回報、沒有動手（需要 owner 或另一次排程判斷）

1. ~~**`copyPackageItemsToOrder`（`app/cabang/pesanan/actions.ts`）是真正的 N+1**：每個 package 品項各做一次 SELECT（存在性檢查）再一次 INSERT，而且是**依序**的——20 個產品的 package ＝ 建單當下 40 個序列來回，全部發生在弱網下最不能拖的寫入路徑上。**沒有自己改**，因為它牽涉 idempotency 語意（`client_request_id` 的唯一約束才是真防線，LESSONS #3/#21）與逐行錯誤彙總；改成批次寫入是正確方向，但屬於要單獨驗證的改動，不該在 UI audit 裡順手做。~~ **已在下方「`copyPackageItemsToOrder` 批次寫入，2026-08-21」補完**——單獨驗證過 RLS/trigger/upsert 語意後改成一次 upsert。
2. ~~**i18n context 把用不到的那一半送給每個 client**：`I18nProvider` 收的是完整 `Messages`，所以每個 `/cabang/**` 頁面都夾帶整份 admin 文案，每個 `/admin/**` 頁面則夾帶整份 cabang。沒有自己改：型別安全的做法要動共用契約，而現在有另一個 agent 正在改同一批呼叫 `useMessages()` 的檔案，正是 LESSONS #31 講的情境。~~ **已在下方「i18n 按區拆分，2026-08-21」補完**——`calc-cart-handoff` 已併入 main，共用契約已可安全動。
3. **`@supabase/supabase-js` 整包（184 kB 原始／約 68 kB gzip，含這個 app 從未使用的 Realtime client）進了 6 條路由的 first-load**：`/`、`/cabang`、`/admin/produk`、`/admin/partners/[id]`、`/cabang/pesanan/[orderId]`、`/cabang/pesanan/baru`——就是這幾頁比 103 kB 基準高出約 70 kB 的原因。除了登入頁真的需要它在關鍵路徑上，其餘都只在「按登出」或「上傳檔案」時才用得到，可以改成動態 import。**沒有自己改**：會動到上傳與登出路徑的 async 結構，那裡有弱網/補償邏輯（LESSONS #2/#18/#29），值得單獨一刀。
4. **三個 admin 清單沒有 `.limit()`**：`/admin/produk`（169 筆且持續增加）、`/admin/pelanggan`（36 筆匯入＋所有分店建的客戶）、`/admin`（partner，量小無妨）。cabang 端對應頁面都有 100/200 的上限。**沒有自己加上限**：在沒有分頁的情況下加 cap，會讓 admin 搜尋悄悄漏掉超過上限的客戶——那是「這個客戶不存在」等級的誤導，屬於產品決定（要一起做分頁），不是 audit 可以順手決定的。
5. **`copyCalcCartItemsToOrder`（同一個 `actions.ts`，kalkulator 交接用的姊妹函式）跟 `copyPackageItemsToOrder` 改之前一模一樣的 N+1 形狀**：逐品項 SELECT 存在性檢查＋INSERT、依序執行，外加自己專屬的 price-guard 降級重試（trigger 拒絕 unit_price 時再送一次不含價格的版本）。2026-08-21「`copyPackageItemsToOrder` 批次寫入」那一刀動工時發現、讀過確認共享同一種來回次數問題，**刻意沒有動它**——委派範圍明講只改 Package 那個函式，price-guard 降級重試的批次寫入設計（ON CONFLICT DO NOTHING 不容易表達「這批裡有些要降級、有些不用」）需要單獨想清楚，不該跟著順手改。

另外兩件小事記錄但不修：`.seg` 在手機是 40px（合約寫 44px）、admin 的寬表格沒有 `.mobile-only` 卡片版（`.desktop-only`/`.mobile-only`/`.reccard` 在 admin 側零使用）——後者在 admin＝桌面的定位下是合理取捨，但 §4 的遷移對照表把它列為 wave-2 應該要做的事，兩者的落差記在這裡供 owner 決定。

**驗證**：`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、`npx eslint .` ✓、
`rm -rf .next && npm run build` ✓，對**整棵 `web/`** 跑（LESSONS #31）。`/offline`
仍為 `○` 靜態預渲染，且體積從 45.4 kB 降到 7.67 kB。零新增 i18n key（新增的
skeleton 完全沒有文案），故無新的禁用詞掃描項目。本輪**沒有任何 migration／
schema／RLS 變動**，也沒有修改任何 Server Action 的寫入語意——`audit-format.ts`
依 LESSONS #28 逐項檢查過，本輪沒有新增/更名任何會進 audit diff 的欄位或動作碼，
所以該檔案不需要動（是「檢查過不用改」，不是漏做）。

**尚待真人驗證**（本環境網路白名單擋 supabase.co，沿用既有限制）：以上皆為
靜態分析＋建置產物實測，chip 分類、skeleton、觸控目標、深色模式分隔線這四項
需要 Jenzo 用真帳號在手機＋桌面實看過才能升級 VERIFIED——這與 §158-167 設計
系統 v2 本身待驗的狀態一致，可以同一次看完。


### i18n 按區拆分，2026-08-21

接續上面「UI/UX 與效能 audit 補跑」的只回報項目 #2。動工前重新驗證了它的前提
（前一輪已驗過，這輪再核一次是因為 `calc-cart-handoff` 併入後檔案內容可能已
變動）：全庫 grep `m.admin.*`/`messages.admin.*` 只出現在 `app/admin/**` 與
`lib/audit-format.ts`（後者只被 `app/admin/**` import），`m.cabang.*` 只出現
在 `app/cabang/**`，零例外——按區拆分的前提依然成立。

**做了什麼**：`Bundle`/`Messages`（三區合一）型別整個拿掉，改成兩個型別不同
的窄型別：

- `CommonMessages`（`common` 這一片的形狀）
- `CabangMessages = { common: CommonMessages; cabang: <cabang 這一片> }`
- `AdminMessages = { common: CommonMessages; admin: <admin 這一片> }`

`common.ts`/`cabang.ts`/`admin.ts` 三個翻譯真理來源檔案**完全沒動**
（`git diff --stat` 三個檔案零差異）——只是把送到 client 的「包裝」換小。

- `lib/i18n/index.ts` 的 `getMessages()` 拆成 `getCommonMessages()`／
  `getCabangMessages()`／`getAdminMessages()`，各自在 `lib/i18n/messages/index.ts`
  的 `pickXxxMessages()` 裡直接組出該區需要的物件，不會先組出三區合一的物件
  再切。
- `lib/i18n/provider.tsx` 的 `I18nProvider`/`useMessages`/`useI18n` 拆成
  `CabangI18nProvider`/`useCabangMessages`/`useCabangI18n`、
  `AdminI18nProvider`/`useAdminMessages`/`useAdminI18n`、以及只給登入頁用的
  `CommonI18nProvider`——三者共用一個 12 行的 `createScope<M>()` 小工廠，沒有
  複製貼上整個 context 樣板三次。`DraftBanner`/`LocaleSwitcher` 這兩個「cabang
  與 admin 都會掛載」的共用元件改用 `useCommonMessages()`/`useCommonI18n()`：
  依序探測 Cabang→Admin→Common 三個 context 中真正掛載的那一個（每個頁面永遠
  只掛一個），不需要在 layout 疊兩層 provider。
- 3 個掛載點（`app/admin/layout.tsx`、`app/cabang/layout.tsx`、`app/page.tsx`
  登入頁）改成呼叫各自範圍的 `getXxxMessages()` + 掛對應的 Provider；登入頁
  重新確認過真的只讀 `m.common.*`，改掛 `CommonI18nProvider`。
- 45 個 `useMessages()`、35 個 `getMessages()`、42 個 `Messages` 型別匯入，
  依所在目錄機械式改成對應區域的名字（`app/admin/**` → Admin，`app/cabang/**`
  → Cabang）——純換名字，沒有動任何元件的渲染/業務邏輯，`git diff` 逐檔比對過。
- 6 個共用 `lib/**` 檔案（`safe-write.ts`、`catalog-shared.ts`、
  `orders-shared.ts`、`documents-shared.ts`、`compress-image.ts`、
  `use-local-draft.ts`）逐一查過各自實際讀哪個切片：全部只讀 `common`，改成
  最小結構型別 `{ common: CommonMessages }`——`CabangMessages`/`AdminMessages`
  都自動滿足這個形狀,呼叫端不用轉型。`audit-format.ts` 讀 `common`+`admin`
  兩者,且重新驗證過只被 `app/admin/**` import,改成 `AdminMessages`。

**驗證**：`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、`npx eslint .` ✓、
`rm -rf .next && npm run build` ✓，對整棵 `web/` 一起跑（LESSONS #31）。CJK/
繁體禁用詞掃描對本輪 diff 零命中（沒改任何翻譯內容，三個真理來源檔案零
diff）。`/offline` 仍是 `○` 靜態預渲染、7.67 kB,不受影響。

**實測數字**——這裡要拆成兩層講清楚,兩者衡量的是不同東西：

1. **`next build` 的 Route 表格幾乎沒變**（`/cabang/pesanan/[orderId]` 
   First Load JS 改動前後都是 183 kB；`/admin/orders/[orderId]` 都是 114 kB;
   Size 欄位的個位數 kB 差異只是改名後識別字串變長的雜訊)。這是**預期中的
   結果,不是驗證失敗**：這個表格量的是 webpack client bundle,而這次要砍的
   是**RSC 傳給 `<I18nProvider messages={...}>` 的 props 資料**——跟
   `/offline` 那個修法(client 元件直接 import 大物件字面值,真的進了 JS
   bundle)是完全不同的機制,§"Why this matters" 已經先講明這點。
2. **真正被砍掉的是 props 資料本身**——直接量測 `pickCabangMessages`/
   `pickAdminMessages` 回傳物件的 `JSON.stringify` 位元組數(把
   `common.ts`/`cabang.ts`/`admin.ts` 用 `tsc` 編譯成純 JS 後用 Node 量,三
   語言都測過,以下是 `id`(印尼語,預設語言)的數字)：

   | 掛載點 | 改之前(common+cabang+admin 三區合一) | 改之後 | 省下 |
   |---|---|---|---|
   | `/cabang/**`(`CabangI18nProvider`) | 57,400 B 原始／15,354 B gzip | 24,229 B／7,337 B gzip | **−33,171 B 原始(−58%)／−8,017 B gzip(−52%)** |
   | `/admin/**`(`AdminI18nProvider`) | 57,400 B 原始／15,354 B gzip | 41,000 B／11,574 B gzip | **−16,400 B 原始(−29%)／−3,780 B gzip(−25%)** |

   admin 文案本輪量到 500 key／33,162 B 原始／9,317 B gzip,cabang 文案
   256 key／16,390 B 原始／5,010 B gzip——跟上一輪 audit 記錄的「500 個
   key,33 kB／9.3 kB」「252 key,15.6 kB／4.9 kB」數量級一致(cabang 從
   252→256 key 是 `calc-cart-handoff` 併入後新增的幾個計算器交接文案,不是
   這輪造成的)。cabang 端省得比 admin 端多,因為 admin 文案本來就比 cabang
   文案大一倍多(500 vs 256 key)——對每天用手機、弱網跑單的分店 staf 來說,
   這正好是最該省的那一半。

**尚待真人驗證**：以上是靜態分析＋建置產物＋直接位元組量測,沒有真的用瀏覽器
開發者工具量過線上頁面的實際網路傳輸量(本環境網路白名單擋
supabase.co,無法完整登入測試)——跟本檔其他項目一樣,建議跟其他待驗證項目
一起用真帳號驗一次。


### `copyPackageItemsToOrder` 批次寫入，2026-08-21

接續上面「UI/UX 與效能 audit 補跑」的只回報項目 #1。單獨排程、單獨驗證，跟
UI/UX audit 那一輪切開，因為這裡牽涉 idempotency 語意，不該順手做。

**改了什麼**：`app/cabang/pesanan/actions.ts` 的 `copyPackageItemsToOrder`
（建立訂單時把 Package 的品項複製進 `order_items`）從「每個品項各一次
SELECT 存在性檢查、再一次 INSERT，依序執行」改成「先把整批要寫入的列組好，
一次 `.upsert(rows, { onConflict: "client_request_id", ignoreDuplicates:
true })`」：

- **來回次數**：20 個產品的 package，建單當下從 **40 個依序來回（20×
  SELECT+INSERT）降到 1 個**——不管品項數是多少都是 1。
- **函式對外契約完全沒變**：簽名還是
  `copyPackageItemsToOrder(supabase, orderId, packageId, orderClientRequestId):
  Promise<{ok:true}|{ok:false}>`，呼叫點（`createCustomerAndOrder`）與
  `itemsCopyWarning` 的處理方式都沒動。product join 失敗（`!product`）的
  品項一樣標記 `anyFailed`、一樣不寫入——跟改之前逐字一致。
- **沒有新 migration，沒有動 RLS／trigger**：純 app 層改動。

**為什麼這樣做保住 idempotency（給審閱者的證明，不用重新推導）**：

1. `order_items.client_request_id text unique`（migration 0014）是**全域**
   unique constraint，本來就是這裡唯一真正的防重複防線（LESSONS #3/#21）——
   舊寫法的「SELECT 存在再 INSERT」本身不是防線，這條 constraint 才是；新
   寫法沒有拿掉它，只是換一種方式**利用**它。
2. `ignoreDuplicates: true` 編譯成 PostgREST 的
   `Prefer: resolution=ignore-duplicates`，對應 Postgres 的
   `INSERT ... ON CONFLICT (client_request_id) DO NOTHING`。`DO NOTHING`
   是**逐列**判斷衝不衝突,不是整個 statement all-or-nothing——retry 時同一
   批品項裡「已經落地的」被個別跳過,「還沒落地的」照常寫入,跟舊寫法逐列
   SELECT-then-INSERT 給的保證完全一樣,只是省掉中間那一趟 SELECT。
3. `ignoreDuplicates: true`（不是預設的 `false`／merge-duplicates）意味著
   PostgREST **不會**生成 `DO UPDATE`,所以這次批次寫入實際觸發的 RLS 只有
   `oi_partner_insert`（INSERT policy）,已存在的舊列完全不會被這次呼叫
   touch 到,不需要額外考慮 UPDATE policy（`oi_partner_update`）。
4. `RETURNING`（`.select("id")`）不包含被 `ON CONFLICT DO NOTHING` 跳過的
   列——所以 retry 時 `data.length < rows.length` 是**預期行為**,不是失敗
   訊號。這裡直接沿用既有的 `safeWrite`（`web/lib/safe-write.ts`）:它只在
   有 `error` 或 `data` 是 `null`/`undefined` 時判定失敗,空陣列 `[]` 一樣
   算 `ok: true`——不需要在 `copyPackageItemsToOrder` 裡額外判斷「回傳筆數
   夠不夠」。

**讀過確認沒問題（不是猜測，逐項讀原始碼/type 定義得出）**：

- **RLS INSERT policy**（`oi_partner_insert`, migration 0014）：`WITH CHECK`
  子句讀 `order_items.order_id`（新列自己的欄位,不是回查 order_items 本身,
  不是 LESSONS #25 那種自我回查陷阱）,判斷式是
  `exists (select 1 from partner_orders o where o.id = order_items.order_id
  and fn_can_edit_branch(o.branch_id) and o.status = 'REGISTERED')`。Postgres
  的 RLS 是逐列套用,不因為是不是同一個 INSERT 語句裡的多列而改變——這批要
  寫入的列全部共用**同一個** `order_id`（同一張剛建立的訂單）,所以批次跟
  逐列送的判斷結果完全相同。
- **order_items 上的 trigger**（migration 0014 §6–7）：`trg_audit`、
  `trg_set_created_by`、`trg_order_item_price_guard` 全部是
  `FOR EACH ROW`,不是 `FOR EACH STATEMENT`,函式本身也沒有任何跨列/序列
  相依的邏輯（不像 `fn_next_order_seq` 那種取號函式）——多列 INSERT 下,
  Postgres 對每一列各自呼叫一次,結果跟 N 次單列 INSERT 逐字相同。
  `trg_order_item_price_guard` 特別檢查過：Package 品項的 payload 從未帶
  `unit_price`/`line_discount`,而 guard 本身開頭就是「這兩欄都沒被觸碰就
  直接放行,不查表」,所以這個 trigger 在這條路徑上實際上完全不會執行到
  查表那段。
- **`@supabase/supabase-js` 版本**（`package.json` 釘 `^2.49.0`,環境實際
  裝到 `2.112.3`）：`node_modules/@supabase/postgrest-js/src/
  PostgrestQueryBuilder.ts` 的 `upsert()` 簽名確實支援
  `{ onConflict, ignoreDuplicates }`,原始碼裡逐字確認過它組出
  `Prefer: resolution=ignore-duplicates` 表頭與 `on_conflict` query
  string——不是猜測既有版本的行為。

**沒有拿現成 Supabase 環境測過（本環境網路白名單擋 supabase.co,跟本檔其他
項目一樣的既有限制）**：以上全部是讀 migration SQL＋`postgrest-js`
原始碼＋PostgREST/Postgres 已知的 `ON CONFLICT` 語意得出的結論,**不是**
拿真的資料庫跑出來的觀察。尚待 Jenzo 用真帳號驗證：①用一個有多品項
（建議 ≥5 個）Package 建立訂單,確認 `order_items` 裡每個品項都完整落地、
`quantity`/`name_snapshot`/`code_snapshot` 正確;②刻意製造一次「回應遺失、
client 重送」的情境（例如提交後立刻切斷網路,或用既有的 debug 手法模擬逾時
重試),確認重送不會產生重複的 `order_items` 列,而且沒落地的品項這次真的
補上了。

**驗證**：`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、
`npx eslint .` ✓、`rm -rf .next && npm run build` ✓，對整棵 `web/` 一起跑
（LESSONS #31）。`copyCalcCartItemsToOrder`（kalkulator 交接用的姊妹函式,
`actions.ts` 同檔案較後段）讀過確認**共享同一種 N+1 形狀**（逐品項
SELECT 存在性檢查＋INSERT,外加自己的 price-guard 降級重試邏輯）——**刻意
沒有動它**,照委派範圍留給另一次排程判斷,這裡只記錄下來避免下一輪漏看。

### Phase 2 第十六切片（Admin 代任意 partner/分店建立訂單，2026-08-22）

Owner 有多個 admin 帳號，全部要能直接下單（包含即將建立的「SANCI 自營」
partner），不想再維護第二套分店帳號。訂單結構不放寬：**每筆訂單仍然必須
屬於一個 partner+分店**（訂單編號格式、RLS、attribution 都建立在這之上），
所以 admin 流程是「選 partner → 選分店 → 之後跟分店端建單語意完全相同」。
所有 `platform_admins` 一律平權，沒有 admin 分級。**零 migration、零 RLS
變動**——admin 寫入本來就被 `c_admin_all`/`o_admin_all`/`oi_admin_all`
（全部 `for all ... fn_is_admin()`，讀 0004/0014 逐條確認）涵蓋。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-71 | 新頁 `/admin/orders/baru`（server page + client form，仿 cabang 拆分）＋ `/admin/orders` worktop 的「+ Buat Pesanan」按鈕（v1 唯一入口；導頁不用 modal——表單太大；**沒碰 `admin-nav.tsx`**，該檔由平行 agent 施工中）。表單：Partner（ACTIVE）→ Cabang（ACTIVE；換 partner 連鎖清空 cabang/package/staf，換 cabang 清空 staf；下游資料用 Server Action 動態載入，失敗顯示明確錯誤＋重試鈕，不偽裝成「沒有資料」〔LESSONS #10〕）→ 之後鏡射分店表單：電話優先查重（debounce 600ms，查詢失敗**不**顯示「查無此人」〔SPEC §84〕）、Package 下拉＋手動輸入 fallback、Sales/PIC、Jalur Pesanan 必選、Total Belanja 選填、收貨地址（既有客戶地址 prefill、僅在欄位空白時〔LESSONS #1〕）、備註、invoice 上傳（P2-73）。成功畫面：訂單編號＋摘要（獨立 SELECT 證實才顯示〔SPEC §68〕）＋「Buka Pesanan」連到 `/admin/orders/[orderId]` | `UNVERIFIED` | 三語系新增 63 個 `orderCreate*` key（id/en/zh，文字逐字沿用 cabang 對應 key——GLOSSARY「一個概念一個詞」；簡體禁用詞掃描零命中、id/en 字串值零 CJK）。**GLOSSARY 無新詞**——全部復用既有詞條。**v1 刻意沒有 localStorage 草稿**（分店表單有）：這張表單的關鍵值是連鎖下拉（partner→cabang→staf/package），選項每次動態載入，「文字回來了、選擇回不來」的半還原草稿比沒有草稿更誤導——記錄為已知邊界，不是遺漏 |
| P2-72 | 新 Server Actions `web/app/admin/actions-create-order.ts`：`createOrderForBranch`（主寫入）＋讀取用 `getPartnerOrderOptions`/`getBranchStaffOptions`/`searchCustomerByPhoneAdmin`/`getOrderSummaryAdmin`。**每個 action 先驗 admin**（idiom 逐字沿用 `actions-users.ts`：先 `auth.getUser` 再查 `platform_admins`，DB 錯誤≠「不是 admin」〔LESSONS #10〕）；RLS `admin_all` 仍是真正的邊界。partnerId/branchId server 端驗互相隸屬＋雙 ACTIVE（DB 端 `trg_check_order_refs`〔0004〕是最後一道）；staf 驗證**在建客戶之前**（0019 既定順序）；冪等完全沿用分店：`client_request_id` 基底＋`:customer`/`:order`/`:item:{product_id}` 後綴、`safeWrite`/`confirmByRequestId`/`isRequestIdConflict`、response 遺失時 partial 誠實回報（SPEC §70）。`actions-lookup.ts` 白名單新增 `order`。**刻意沒有** cabang 端的「欄位還沒 migration」fallback 階梯：此頁誕生時 0001–0019 已全部 production VERIFIED，缺欄位是配置錯誤不是過渡態——回明確「模組未啟用」訊息（檔頭有完整理由） | `UNVERIFIED` | **共用抽取**：`verifyActiveStaffInBranch`＋`copyPackageItemsToOrder` 從 `cabang/pesanan/actions.ts` 搬到新檔 `web/lib/order-create-shared.ts`（兩者不含 Messages、簽名乾淨——「抽取乾淨就選共用 helper」成立；設計註解整段跟著搬，cabang 檔留 cross-reference，行為零改動）。**新客戶 attribution**：`created_via_partner_id`/`created_via_branch_id`=所選分店、`attributed_staff_id`=所選 sales——讀 0018/0019 確認 branch 格式 customer_code trigger 條件是「created_via 兩欄＋attributed_staff_id 皆非空」，與行為者無關，所以 admin 代建的客戶編碼與分店自建完全一致，分店 RLS（`fn_can_view_branch(created_via_branch_id)`）也看得到這個客戶。訂單編號/created_by/audit trigger 均不看行為者（讀 0004 確認）；audit actor 會是 `SANCI_ADMIN`（`fn_audit_row` 的 `fn_is_admin()` 分支），`audit-format.ts` 的 `ORDER_CREATED`/`CUSTOMER_CREATED`/`roleSanciAdmin` 都已存在且本切片**零新欄位**——LESSONS #28 巡檢無新增項 |
| P2-73 | Invoice 上傳**納入** v1：先讀 0009 §6 storage policy 確認 `order_invoices_insert`/`update` 都含 `public.fn_is_admin()`——admin 瀏覽器 session 本來就允許上傳任何訂單路徑，**不需要任何 migration**。新檔 `orders/baru/invoice-upload-admin.ts` 鏡射 cabang 的 `invoice-upload.ts`（壓縮→直傳 bucket→Server Action 記 path；上傳失敗＝警告、永不取消已建立的訂單），另建 `setOrderInvoicePathAdmin`（cabang 版 `setOrderInvoicePath` 走 `partner_users` 身份，admin 帳號過不了）——path 前綴驗證＋非 REGISTERED 拒絕＋rowcount 檢查照抄 | `UNVERIFIED` | `compressImage` 收 `HasCommon` 結構型別，AdminMessages 直接可用，錯誤訊息走 `m.common.compress*` 既有 key |

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **建單表單沒有 offer/折扣欄位**——與分店端相同：offer 是建單後在
  `/admin/orders/[orderId]` 詳情頁（既有 `order-offer-form.tsx`）設定。
- **入口只有 `/admin/orders` 列表頁一顆按鈕**——不動 `admin-nav.tsx`
  （平行 agent 施工中，避免 merge 衝突）。
- **沒有「Simpan Pelanggan Saja」按鈕**（分店表單有）——admin 已有
  `/admin/pelanggan` 的「+ Tambah Pelanggan」入口；注意那條路徑建的是
  SANCI-direct 客戶（created_via 全 NULL），跟本表單「代分店建客戶」
  （created_via=所選分店）是兩種不同 attribution，不要混用。
- **沒有 Kalkulator 交接**——那是分店端 localStorage 流程。
- **沒有 localStorage 草稿**（理由見 P2-71）。

**驗證**：`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、`npx eslint .`
✓、`rm -rf .next && npm run build` ✓（`/admin/orders/baru` 出現在路由表
5.06 kB／First Load 180 kB，與 `/cabang/pesanan/baru` 的 182 kB 同級；
`/offline` 仍 `○` 靜態 7.67 kB）——整棵樹一起跑（LESSONS #31）。

**待 Jenzo real-world 驗證（本環境連不上 supabase.co，以下只在代碼/SQL 層
讀證過，未實測）**：
1. admin 帳號在 `/admin/orders/baru` 為真實分店建一筆單（新客戶）；
2. 訂單編號格式正確（`{PARTNER}-{BRANCH}-{YYMMDD}-{####}`，計數器與分店
   自建共用同一序列）；
3. 該分店帳號登入後看得到這筆訂單**和**這個新客戶，客戶代碼是 0019 branch
   格式（`GH-BSD-AS/26/001` 樣式；沿用該切片「格式未逐字拍板」的既有警示）；
4. 訂單詳情頁 Isi Pesanan 有 package 品項（選了真 Package 的情況）；
5. Activity 分頁 `ORDER_CREATED`/`CUSTOMER_CREATED` audit 列 actor 顯示
   SANCI Admin；
6. admin 表單上傳 invoice 成功、分店端詳情頁看得到同一張 invoice；
7. 弱網重試不產生重複訂單/客戶（提交後斷網再重送同一表單）。

### Phase 2 第十七切片（Admin 端 Kalkulator Penawaran，2026-08-22）

Owner 的 admin 帳號（全部 `platform_admins`）要能直接用報價計算器，不必切到
分店帳號。做法是**同一個元件服務兩條路由**（不是複製一份）：
`kalkulator-client.tsx`＋`kalkulator.module.css` 從 `app/cabang/kalkulator/`
搬到 `web/lib/`（git mv，保留歷史），新路由 `/admin/kalkulator` 與既有
`/cabang/kalkulator` 都 import 它。折扣鏈數學、購物車、草稿機制三者零改動。
**零 migration、零 RLS 變動**——純讀取功能。

| # | 功能 | 狀態 | 備註 |
|---|---|---|---|
| P2-74 | 新頁 `/admin/kalkulator`（server page＋`loading.tsx` skeleton，照 2026-08-21 admin skeleton 慣例）＋ `admin-nav.tsx` 新導覽項（`navCalculator`，排在 Produk 之後——同樣以產品目錄為起點的日常工具） | `UNVERIFIED` | **產品來源**：不走 `sanci_catalog_access` gate（那是「目錄開給哪個 partner」的開關，admin 是目錄的主人）——直接查 `sanci_products` 走 admin RLS `sp_admin_all`（讀 0010 §5 逐字確認：`for all using fn_is_admin()`，且不回查自己那張表〔LESSONS #25 註解原文就寫在 policy 上方〕），與 `/admin/produk` 同一條查詢路徑，只多 `.eq("status","ACTIVE")`——計算器是拿「現在真的能訂的東西」報價，不是管理目錄（INACTIVE 在 /admin/produk 看得到、在這裡刻意看不到；cabang 端這層過濾本來就由 `sp_partner_read` RLS 做掉）。`order("name").limit(200)` 與 cabang 頁一致，兩邊行為同步。缺表（42P01）顯示 `catalogMigrationMsg`、其他錯誤顯示 `errorLoad`——照 /admin/produk 的錯誤處理慣例。auth 由 admin layout 統一把關（頁面本身零寫入，RLS 是真正邊界〔LESSONS #5〕） |
| P2-75 | i18n 搬遷：計算器元件實際讀到的 33 個 key 從 `cabang` slice 搬進 `common` slice（26 個 `calc*`＋`calcPageTitle`＋5 個目錄清單 key〔`produkSearchPlaceholder`/`filterAll`/`noProductsYet`/`noProductsMatchSearch`/`noPhotoPlaceholder`〕＋1 個合併 key），元件改讀 `useCommonMessages()`（i18n 拆分時建的跨區 hook，Cabang/Admin/Common 三種 provider 下都能解析）。**逐一追蹤實際用途才搬，不按名字前綴搬**：`calcIntroNote`/`calcConvertCta`/`calcConvertScopeNote`（提到分店訂單流程）與全部 `calcHandoff*`/`calcItems*`（只被 cabang 訂單表單讀）**留在 cabang slice**。三個真理來源檔案的譯文**一字未改**（純搬遷，`satisfies Shape` 三語言互鎖）；cabang 端其他讀這些 key 的檔案（`produk-list-client.tsx`、`order-list-client.tsx`、`pesanan/actions.ts`）機械式改讀 `m.common.*` | `UNVERIFIED` | **順手消掉一組跨 slice 重複**：`cabangOfferFinalNegative`（cabang）與 `orderOfferFinalNegative`（admin）三語言逐字相同——若只把 cabang 那份搬進 common、admin 那份留著，反而**製造**「同一譯文活在兩個 slice」的違規，所以合併成 `common.offerFinalNegative` 一個 key，三個呼叫點（計算器、cabang `setOrderOfferBranch`、admin `setOrderOfferAdmin` 錯誤翻譯）全指向它。**留下的一個已知名字影子**：`produkSearchPlaceholder` 在 admin slice 還有一個**措辭不同**的同名 key（admin 產品頁搜尋不含分類）——不是譯文重複，common.ts 註解有標明。**實測 payload 數字（id 語系，`tsc` 編譯後 Node 直接量 `JSON.stringify` 位元組；en/zh 同量級）**：`common` 194→227 key，7,818→9,481 B 原始（+1,663）／gzip 2,775→3,390（+615）；`cabang` slice 256→223 key（−33）；`admin` slice 563→564（−1 合併＋2 新增）。**每個掛載點的實際變化**：cabang 頁 payload 24,229→24,223 B（−6 B，純搬遷、位置互換，符合預期）；admin 頁 45,617→47,469 B（+1,852 原始／+541 gzip——這是本功能的真實成本：admin 現在真的要用這些文案）；**登入頁（CommonI18nProvider）7,818→9,481 B（+1,663 原始／+615 gzip）——登入頁用不到計算器文案卻要背著它們**，這是「搬進 common」方案自知的代價，換來的是零譯文重複＋單一元件；若日後 common 再被這樣加大，該考慮為跨區元件開第四個 slice 而不是繼續塞 common |
| P2-76 | 元件雙區化的兩個介面決定：①草稿 localStorage key **按區分開**（`sanci:kalkulator:cart`〔cabang，維持原值，既有草稿不失效〕vs `sanci:kalkulator:cart:admin`）——admin 與分店是不同登入，但同一台瀏覽器輪流登入是可能的（SANCI 辦公室測試機），key 相同會讓 admin 的購物車草稿在分店 session 裡冒出「有未完成的草稿」（反向亦然），理由寫在 `calculator-shared.ts` 註解；②「Buat Pesanan」CTA＋scope note 走 **prop**（`convert: { cta, scopeNote } | null`）而不是搬 key——文字屬於 cabang slice（明講分店訂單流程），cabang route 從自己的 slice 填值傳入，admin route 傳 `null` | `UNVERIFIED` | **admin v1 刻意不接「Buat Pesanan」**：hand-off（`CalcHandoff`）寫 localStorage、由 `/cabang/pesanan/baru` 讀取；admin 建單表單 `/admin/orders/baru`（第十六切片）沒有 hand-off 支援，接上它是獨立的一刀。所以 admin 路由上 CTA 與 scope note **整個不渲染**（不是 disabled），計算器就是純報價工具；`handleConvertToOrder` 另有 `!convert` 早退當保險。**cabang 行為逐字驗過**：rename-aware `git diff` 全文核對——每一處渲染字串都是「同一份譯文換了 slice 位置」或「同一份譯文改由 prop 傳入」，行為零改變。**sticky 底欄 admin 變體**：`.stickyBarAdmin` 在 ≥900px 時 `left: var(--side-w)`——admin shell 的側欄（sticky，無 z-index）底部有「Keluar」與語言切換，viewport 全寬的 fixed 底欄（z-index 25）會蓋住它們；<900px 側欄變頂欄（globals.css §7），offset 不需要 |

**本切片刻意不做／範圍縮減（已知邊界，非遺漏）**：
- **admin 端沒有「Buat Pesanan」**（見 P2-76）——v1 admin 計算器是獨立報價工
  具；hand-off 到 admin 建單表單是可能的後續切片，接的時候只要把
  `/admin/kalkulator/page.tsx` 的 `convert={null}` 換成 admin 自己的文案＋
  在 `/admin/orders/baru` 補 hand-off 讀取即可，元件本身不用再動。
- **admin 不顯示 INACTIVE 產品**——刻意（報價用），要看全目錄去 /admin/produk。
- **GLOSSARY 零新詞**——`navCalculator` 直接用既有詞條「Kalkulator Penawaran /
  Offer Calculator / 方案计算器」，不造縮短版新詞。
- **`/offline` 變大是本切片的已知副作用**（見下方驗證）——不是 bug，是
  offline-card 直接 import `common` 整個 export（LESSONS #38 的繫結規則）。

**驗證**：`rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` ✓、`npx eslint .` ✓、
`rm -rf .next && npm run build` ✓（整棵樹一起跑，LESSONS #31）。路由表：
`/admin/kalkulator` 出現（169 B／First Load 109 kB）；`/cabang/kalkulator`
Size 4.32 kB→184 B、First Load **113 kB 不變**（元件搬進 lib 後進了兩條路由
共享的 chunk，總量沒變，只是計帳位置變了）；**`/offline` 仍 `○` 靜態，但
7.67→9.2 kB（First Load 110→112 kB）**——offline-card 直接
`import { common }`，common 加的 33 key × 3 語系（約 +5 kB 原始）整包跟進
（LESSONS #38：搖不掉物件屬性）。+1.5 kB 對離線後援頁不算致命但是真實成本，
如果 Jenzo 覺得不值，替代方案是讓 offline-card 改 import 一個只含
offline 三句話的微型 export——記在這裡，沒有先斬後奏。禁用詞掃描：diff 新增
行零命中繁體禁用詞；CJK 掃描 38 行命中**全部**位於 zh 區塊（id/en 區塊零
CJK）。草稿 key 分區與 cabang 舊 key 不變已在 `calculator-shared.ts` 常數層
面核對。

**待 Jenzo real-device 驗證（本環境連不上 supabase.co，只在代碼層讀證過）**：
1. admin 帳號側欄看到「Kalkulator Penawaran」，開 `/admin/kalkulator`：產品
   格帶照片、加入購物車、單價/數量/折扣鏈輸入正常；
2. 折扣鏈數學與分店端一致（試 10.000.000 → 折扣 8 再 10 → markup 10% →
   現金折讓 8.000 = 9.100.000）；
3. admin 頁**沒有**「Buat Pesanan」按鈕與其說明文字；桌機下底部總額欄不會
   蓋住側欄左下的「Keluar」；
4. 分店端 `/cabang/kalkulator` 一切如舊：草稿橫幅、Buat Pesanan 交接到新訂
   單頁、交接後草稿清空；
5. 同一台瀏覽器先用 admin 堆一個購物車草稿、登出改登分店帳號——分店計算器
   **不**出現 admin 的草稿（反向同理）；
6. 三語言切換在兩條計算器路由都正常；`/offline` 斷網仍開得起來。

**同日 UX 修訂（owner 實機用過的直接回饋：「我不要點一下會+1，沒辦法編輯，
要點完進去一個購物車頁面」）**——三處改動，兩條路由（cabang/admin）共用同一
份元件所以同時生效：

1. **產品卡片點擊不再無聲 +1**：尚未入車的卡片點一下加入（數量 1）；已入車
   的卡片本體不再是點擊目標，改由照片右上角的 **−/×N/+ stepper** 直接增減
   （− 到 0 時整列移除，回到未選狀態）。卡片從 `<button>` 改為條件式
   `role="button"` 的 `<div>`（HTML 不允許按鈕巢套按鈕），未入車狀態保留鍵盤
   Enter/Space 操作。
2. **底部總額欄右側新增真正的按鈕**：產品分頁時顯示「Keranjang (n)」主色鈕
   （沿用既有 `calcTabCart` key，零新譯文），點了切到購物車分頁並捲回頁首
   （原本左側總額文字雖可點但看不出可點，且切換後停在原捲動位置、購物車較
   短會像「空白頁」）。
3. **轉單 CTA 移到購物車分頁**（僅 cabang；admin v1 本來就無 CTA）：流程變成
   「選品 → 進購物車確認 → Buat Pesanan」，比舊的「產品格上直接轉單」貼合
   實際店面操作，也正是 owner 要的先進購物車再動作。

驗證：`tsc`／`eslint`／`build` 全綠，`/offline` 9.21 kB `○` 不變。零新 i18n
key、零 DB 變動。待 Jenzo 實機補驗：卡片 stepper 增減、−到 0 移除、
「Keranjang (n)」按鈕切換並捲頂、cabang 轉單 CTA 只在購物車分頁出現且行為
如舊。

**追加（同日，owner 回饋「折扣的欄位要有顏色來區分不同的折扣」）**：折扣鏈
每個 slot 一個固定顏色（6 色對 6 slot 上限：藍/綠/橙/紫/teal/粉），同一顏色
用在**兩處**——輸入列（左側色條＋同色標籤）與 breakdown 的對應折扣行（色點
＋同色文字）——一眼就能對上「這欄輸入＝那行潛扣」。色彩只當強調（線/點/字），
底色仍走主題 token，深淺色模式皆可讀；並非只靠顏色區分（編號 Diskon 1/2/…
仍在，色弱者不受影響）。`kalkulator.module.css` `.disc0–.disc5`。

**再追加（同日，owner 連續實機回饋四則）**：
1. **「Kosongkan」不再依賴 window.confirm**——手機 PWA 環境下瀏覽器原生確認框
   可能完全不出現（直接視同按下確定），owner 實測一按全清。改為 UI 內兩段式
   確認（按鈕變成問句＋「Ya, kosongkan」/「Batal」），且清空後出現「Kembalikan」
   橫幅可整車復原（品項＋折扣＋markup＋現金一併回復）；橫幅存續到復原或開始
   重新加入商品為止，不用計時器。新 key `calcClearConfirmYes`/
   `calcClearedUndoMsg`/`calcClearedUndoCta`（common，三語）。
2. **購物車縮圖 56→48px、可點放大**——點縮圖開 overlay/modal 看大圖（含品名＋
   Tutup），沿用全站 `.overlay`/`.modal`。新 key `calcPhotoViewAria`。
3. **折扣欄拿掉預寫的 placeholder「8」**——看起來像已填好的數字，誤導。
4. **產品照片一律 `object-fit: contain`（原 cover）**——owner：「每個 product
   照片要調整成相同大小，東西要完整」。格子尺寸不變（同大小），改成完整顯示
   不裁切，留白底色 `--surface2`。同步套用六處：kalkulator 卡片/縮圖、
   cabang produk 格子/詳情、admin produk 格子、Package 內容縮圖。

驗證同上（tsc/eslint/build 全綠，`/offline` 9.35 kB `○`）。

### 載入速度審計＋修復第一批（2026-08-22，Jenzo 指示「全面audit 載入速度」後說「開始」）

審計報告（P0×4/P1×7/P2×5/P3×3，report-only）已交付對話中；本批落地低風險高回報項：

| 項 | 修法 | 效果（build 實測） |
|---|---|---|
| #4 照片快取 1 小時 | 三處 `cacheControl` 3600→31536000（URL 帶 `?v=` 版本號，內容永不變，安全）。**注意：既有 169 張為舊標頭，需重跑 `import-master-data/run.mjs` 覆寫**（run.mjs 已附註） | 型錄重複瀏覽從 4.3 MB/169 次往返 → 0 |
| #2a 預抓過 middleware | middleware 對 `next-router-prefetch`/`purpose: prefetch` 早退，不再每個預抓打一次 `auth.getUser()` | 100 筆列表 = 省最多 100 次 Supabase auth 呼叫 |
| #3 登出鈕背整包 SDK | `admin-nav.tsx`＋`sign-out-button.tsx` 改 handler 內動態 import（載入失敗＝解鎖按鈕，不炸畫面） | `/cabang` 首頁 174→**108 kB**；admin layout 不再夾帶 supabase chunks（manifest 驗證）→ 全部 `/admin/**` −65 kB |
| #5a cabang 缺骨架 | 新增 `app/cabang/loading.tsx`（零文案），覆蓋 `/cabang`、akun、profil、staff 四路由 | 按「回首頁」不再定格像當機 |
| #9 列表預抓 | 訂單/客戶列表列連結＋admin 訂單表兩處 `prefetch={false}`；主導航維持預設 | 滑列表不再每列發請求 |
| #17/#18 | cabang 型錄 `<img>` 補 `decoding="async"`；partner logo 補 `loading="lazy"` | 微小 |

**同日追加 #12/#14**：`/offline` 改 import 微型字典 `messages/offline.ts`（3 鍵×3 語，
common 用 spread 收編同一來源、零譯文重複）——**9.35→1.01 kB**、仍 `○` 靜態；
`sw.js` 快取名 v1→v2 並附「改 shell 必升版」註解（activate 的清理邏輯從此真的會觸發）。

**同日 #6/#7 完成（查詢併波，10 頁）**：cabang 首頁 5→2 趟、pesanan/baru 5→2、
pesanan 4→2、staff 6→2~3、pelanggan 詳情 5→2~3、produk/kalkulator 各 4→3（目錄
閘門保持序列）、pesanan 詳情再收 1 趟；admin 分行頁各分頁 →1~2、package 詳情
4→1、列印頁 5→2、orders 移除多餘探測（42703 降級路徑原樣保留，實核）。手法
與先前兩個訂單詳情頁相同：只改執行順序，查詢欄位/篩選/錯誤處理零變動。

**同日 #1 完成（region 錯配證實並修正）**：Jenzo 回報 Supabase 在
**ap-south-1（孟買）**，Vercel 無設定＝預設美東 iad1——每趟 DB 查詢繞
美國↔印度半個地球（單趟 ~0.2s）。新增 `web/vercel.json` `regions:["bom1"]`
（Vercel 孟買機房，與 DB 同城）。這是乘數級修正：所有頁面的每一趟查詢延遲
同步下降一個量級。附註：DB 在孟買而使用者在印尼（雅加達↔孟買 ~70-90ms）不是
最優選址，但搬 Supabase region 是大工程且伺服器↔DB 的多趟往返才是大頭——
伺服器貼著 DB 即可，此決策記錄於此。

**同日「不必要的來回」第一刀（owner 指示「有些不需要來回跑」）**：
`next.config.ts` 啟用 `experimental.staleTimes.dynamic: 30` —— 30 秒內回到
看過的頁面直接用手機記憶體渲染，零伺服器請求（Next 14 預設值，15 改成 0，
此處有意恢復）。安全前提已核實：全部 Server Action 寫入都呼叫
`revalidatePath()`，該革新同時清掉 client router cache——自己剛存的改動
永遠立即可見；可能最多舊 30 秒的只有「別人在這 30 秒內改的東西」。

**同日「不必要的來回」第二刀**：12 個頁面（cabang 全部 11 頁＋admin layout）
移除頁面層 `auth.getUser()` 那趟 `/auth/v1/user` 網路驗證——RLS 身分查詢
（partner_users 自己那列／platform_admins `pa_read`）查無即未登入，把關的
本來就是資料庫（LESSONS #5）；middleware 每次真導航仍照常刷新 session。
每頁再省一趟來回。error≠空結果的三態全數保留（DB 打嗝→錯誤卡，不會誤踢去
登入頁，LESSONS #10）；admin layout 改 `.limit(1).maybeSingle()`（3+ 位 admin
下 fn_is_admin 會看到多列，無 limit 會炸）。登入頁 `/`、middleware、全部
Server Action 的 getUser 原樣未動。

尚未做（照審計排序）：#8 計算機批次寫入（單獨排程）、#10 縮圖變體（等 #4 上線後評估）、#11 分頁警語（待 owner 決定）、#2b middleware 瘦身（高風險最後）、#16（隨時可做）。上傳三處的動態 import（#3 後半）因涉弱網補償鏈，另行單獨驗證。

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
- [ ] **Jenzo 在 Supabase SQL Editor 執行 `supabase/migrations/0017_customer_code_email.sql`**（阻塞 P2-59 標為 VERIFIED；回貼 24 項驗證結果核對，見該檔頭部）
- [ ] **Jenzo 在自己電腦跑 `web/scripts/import-customers/run.mjs`**（阻塞 P2-60 標為 VERIFIED；需先完成上一步；照 README.md 兩種憑證方式擇一，回貼結尾摘要——期望新建 33／已完整 1／跳過無電話 2）

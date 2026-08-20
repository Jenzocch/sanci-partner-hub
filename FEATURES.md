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

Jenzo 指示「認真 audit」。四領域分工,安全與正確性兩塊由 Opus 完成(UI/UX 與效能兩塊首輪遭額度中斷,**尚未補跑**)。

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

**Migration `0013_order_offer_amount.sql` 狀態**：`UNVERIFIED`(production) — **尚待 Jenzo 在 Supabase SQL Editor 執行**。本機 Postgres 16 完整重放 `0001→0003→0004→0005→0006→0007→0008→0009→0010→0011→0012→0013` 後：驗證區塊 **27 項全數符合期望**（含四個關鍵負面／型別斷言 `OFFER_NONADMIN_POLICIES 0`、`OFFER_NO_CLIENT_REQUEST_ID 0`、`OFFER_FK_NOT_CASCADE 0`、`OFFER_AMOUNT_TYPE numeric(15,2)`，以及十一個 audit 保留斷言＋`REFS_CHECK_CUSTOMER 1`）；行為測試 **40/40 PASS**（admin 增改刪、upsert 同一 `order_id` 只有一列、`created_by` 由 trigger 帶入、`updated_at` 走 `trg_touch`、amount −1 與 null 被擋、amount 0 被接受、**分店讀自己訂單的方案金額 0 列**、分店 insert 被 RLS 擋、update/delete 影響 0 列、anon 0 列、FK RESTRICT 實測擋下刪訂單、`ORDER_OFFER_CREATED/UPDATED/DELETED` 三個動作都帶出正確的 partner **與** branch、`before`/`after` 帶出新舊金額、分店讀不到 `audit_logs`）；`fn_audit_row` 回歸實測 `PACKAGE_CREATED`／`PRODUCT_CREATED`／`PRODUCT_STATUS_CHANGED`／`CATALOG_ACCESS_UPDATED`／`PACKAGE_ITEM_CREATED`（partner 正確、branch 仍為 null）／`ORDER_CUSTOMER_ARRIVED`／`ORDER_INTERNAL_NOTE_CREATED`／`ORDER_CANCELLED`／`CUSTOMER_PHONE_CHANGED` 全部照舊，且零筆裸表名動作碼；冪等連跑 3 次 `pg_dump -s` 零漂移。⚠️ **0013 後 0001 檔尾數字變為 RLS_ENABLED 18 / POLICIES 38，但 TRIGGERS 仍是 27**（已本機實測，非推估；`order_sanci_offers` 以 `order_` 開頭，三個 trigger 不會被 0001 的 `partner%` 計數納入，與 `order_internal_notes` 相同、與 `partner_package_items` 相反）。0004/0005/0009/0010/0011/0012 六個檔尾**一個數字都沒變**（已逐一實測）。亂序重跑實測：0012 最後跑會掉 `ORDER_OFFER` 但**保住** `PACKAGE_ITEM`；0010 最後跑兩個都掉；**單跑一次 0013 全部復原**。typecheck ✓ eslint ✓ build ✓（`/offline` 仍為 `○` 靜態預渲染）。

**本切片刻意不做（已知邊界，非遺漏）**：
- **分店／合作商看不到方案金額**。這是 owner 當下的決定（「先只有 SANCI 看得到」），不是技術限制。要開放的話是**加一條 SELECT policy**，資料結構不用動——這正是當初不把它做成 `partner_orders` 欄位的理由。
- **產品目錄永遠不放價格**。這條 0010 的鐵律**完全沒有被鬆動**。這裡存的是「針對某一筆訂單、由人決定的成交／方案金額」，不是產品定價。兩者差在：一個綁 `order_id`，一個會綁 `product_id`——後者這個系統裡不存在，也不會有。往後做 audit 的人請不要把這一刀誤判成違反零價格規則。
- **系統不算任何東西**。不比對 `partner_purchase_amount`、不算折扣%、沒有任何定價規則（沿用 0009 訂下的硬邊界）。數字是人打的，意思是人定的。
- **試算表是單向的**。表上改任何格子都不會回寫系統，也永遠不會自動刪列。要雙向同步是另一個決定（而且要先想清楚衝突怎麼解），不要往這支腳本上補。
- **方案金額不隨訂單快照凍結**。跟 0012 的套裝內容一樣：它是「目前生效的值」，改了就是改了，`audit_logs` 留完整前後值。要凍結需要另一張表。
- **訂單詳細頁的 Activity 分頁看不到 `ORDER_OFFER_*`**。那個查詢過濾 `entity_type='partner_orders'`，而這些列是 `order_sanci_offers`——跟 0009 的內部備註完全一樣的情形，不是壞掉。要看在**合作商 Activity** 和**分店 Activity** 兩個分頁（0013 刻意把 `partner_id` 和 `branch_id` 都填好就是為了這個）。

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

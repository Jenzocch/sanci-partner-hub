# SANCI Partner Hub — LESSONS

> 本輪主題：開工日起始版——SPEC 指定的四大原則＋從 Jenzo 其他系統（Gudang One／FQMS／Denikin／GMS）付過代價繼承的教訓。
> 給 AI：動工前掃一遍；新教訓照格式補進來；發現某條錯了就刪掉。

## SPEC 指定原則（§4，違反即 P1 以上）

### 1. Local Draft Priority — 晚到的 Server Response 不可蓋掉未提交草稿
- **規則**：優先序 Local Unsaved State > Server State > Default/Prefill。
- **為什麼**：資料 fetch 是非同步的——草稿在掛載時還原好，幾百毫秒後 API 回來把欄位重設成 DB 版，使用者的字就消失了（Denikin 真實踩過）。
- **修法模式**：還原的草稿存進 ref，回填時明訂優先序；**只有真的寫進 DB 成功才清草稿**——存檔失敗保留草稿讓使用者直接重按。

### 2. No Fake Success — 不完整結果／timeout／response loss 不得顯示成功
- **規則**：Client 沒拿到完整成功回應，就必須向 Server 確認實際狀態，不得先顯示成功。
- **為什麼**：弱網下「Server 已 commit 但 response 丟失」是常態；顯示失敗導致重送＝重複資料，顯示成功但其實沒寫入＝資料遺失。兩邊都靠「查 Server 實況」解，不靠猜。

### 3. Duplicate Prevention — SELECT→沒有→INSERT 不是防重複
- **規則**：防重複必須用 DB Unique Constraint + idempotency key／request ID + server-side validation。先查再寫在併發下必炸（兩個 browser 同時建 GH，兩邊 SELECT 都查無）。
- **按鈕 disable 只是體驗，不是防線。**

### 4. Master Data — 已被使用的主檔用 Deactivate，不用 Hard Delete
- **規則**：Partner／Branch／Staff 有歷史 dependency 一律停用（Active/Inactive），不刪除。
- **為什麼**：刪一筆主檔靜默清掉整段歷史是真實發生過的災難（GMS）。配套：主檔外鍵預設 `ON DELETE RESTRICT`，不用 CASCADE。

## 繼承教訓（來源標註；技術棧不匹配時跳過）

### 5. UI 藏起來 ≠ 權限控管〔battle-tested〕
三層都要：UI 隱藏（體驗）、API 檢查、DB/RLS 強制。每條角色規則寫完問一句：「開 devtools 直接打 API 繞得過嗎？」本專案 Partner Boundary 是 P0（SPEC §32–34），這條是本專案最貴的一類坑。

### 6. 授權欄位 look-up-don't-trust〔battle-tested〕
partner_id／branch_id／role 永不信 client 傳值，後端從 auth_user 查表核發。否則就是提權漏洞（Partner A 冒充 Partner B）。

### 7. 成功訊息不是證據〔battle-tested，佔全部事故 1/3〕
存檔✓／Deployed✓／exit 0 都只是「某個東西發生了」。每次「完成」用獨立方法驗內容本身：UI 說 created → 另外查 DB 確認只有一筆；UI 說 Own Branch Only → 用 Cirebon user 實際打 Bandung 資料確認被拒（SPEC §97）。

### 8. NOT NULL DEFAULT 的預設值若在業務語意上是「最糟」，忘記填就是靜默災難〔Denikin〕
設 DEFAULT 前問「這個值在業務上代表什麼」；種子／匯入後跑 `GROUP BY` 該欄位——全部集中同一值＝沒填。本專案警戒點：status、access policy 欄位的預設值。

### 9. repo 裡的 migration ≠ production 已套用〔battle-tested〕
PR merge ≠ SQL 已上線。migration 一律冪等（IF NOT EXISTS）；給 Jenzo 跑的 SQL 貼全文＋自帶驗證查詢，請他回貼結果核對（從 repo 複製常拿到舊版）。

### 10. DB 錯誤 ≠ 查無資料；error 不併進 loading〔Denikin〕
兩種錯誤碼分開處理；DB 錯誤不得偽裝成業務結論（如「帳號停用」）。任何資料載入都要有明確 error 分支＋重試入口——`if (loading) return spinner` 會把壞掉的功能偽裝成「慢」，bug 活很久沒人回報。SPEC §37 的 List 三態就是這條。

### 11. Server timestamp，不信 client 時間〔SPEC §67 + battle-tested〕
Audit、created_at 一律 DB `now()`。手機時間不可信。

### 12. 部署順序解耦〔battle-tested 設計類〕
程式可先上、SQL 後跑——新表/欄位不存在時功能降級或隱藏，頁面不能炸。但**使用者填了的值不准無聲丟掉**：降級只適用「沒填就不帶欄位」，有填而缺欄位要明確指路跑 migration。

### 13. 開發語言 ≠ 使用者語言：AI 寫的 UI 字串會漏進開發語言〔Gudang One〕
跟 Jenzo 用中文開發、UI 是別的語言時，子代理寫的字串特別容易混入中文。機制化：加自動守門測試「渲染輸出出現開發語言字元＝失敗」；委派子代理時把「UI 一律用○○文」明寫進任務提示。（本專案 UI 主語言待定，定案後立刻套用。）

### 15. RLS policy 裡的子查詢也受 RLS 過濾——「查不到」會被誤讀成「不存在」〔本專案 2026-08-14 實測抓到〕
- **症狀**：partner_staff 的可見性規則寫「有派任在可見分店，**或沒有任何有效派任**」；OWN_BRANCH 模式下 Cirebon 使用者竟看得到 Bandung 員工的名字。
- **根本原因**：policy 子查詢讀 partner_staff_assignments 時同樣被該表的 RLS 過濾——Bandung 派任「查不到」，員工被誤判為無派任孤兒而放行。
- **修法**：把「這個員工有沒有有效派任」的判斷搬進 security definer 函式（`fn_can_view_staff`），繞過 RLS 看真實資料。
- **教訓**：RLS policy 引用其他受 RLS 保護的表時，先問「這個子查詢被過濾後語意還對嗎？」`NOT EXISTS` 型判斷幾乎一定要用 security definer。**這個 bug 只有行為測試抓得到——語法檢查與 schema 檢視都看不出來**；每條 RLS 規則都要配至少一個「以受限身分實測」的斷言。

### 16. Supabase Dashboard 的 SQL Editor 分頁可能被歸類到 Logs Explorer（ClickHouse 引擎），不是資料庫〔本專案 2026-08-14 實測踩到〕
- **症狀**：貼 migration SQL 按 Run，回傳 "Error: Failed to get project's logs"；畫面出現「Logs now run on a ClickHouse-backed engine」提示。Table Editor 檢查後確認資料庫裡**完全沒有建表**——不是顯示錯誤，是查詢真的沒進資料庫。
- **根本原因**：那個查詢分頁被歸類進側欄的 LOGS 區（Supabase 的日誌查詢走獨立的 ClickHouse 引擎，語法跟 Postgres 不同），不是連到實際 Postgres 資料庫的 SQL Editor。
- **修法**：左側窄圖示直排選正確的 SQL Editor 圖示（在 Table Editor 圖示正下方，通常像 `>_`），開全新 New query 分頁重貼。
- **教訓**：**給非工程師跑的 SQL 貼上「怎麼確認真的執行成功」的獨立查證步驟**，不能只信任「Run 沒有紅字」——這裡連錯誤訊息本身都會誤導（看起來像日誌服務暫時故障，其實是查詢送錯地方）。之後給 Jenzo 的操作指示要先教他認出正確的 SQL Editor 入口，或請他跑完後直接去 Table Editor 核對表格是否出現，兩步都做才算數（呼應鐵律 7：成功訊息不是證據）。

### 17. Vercel 檔案直傳部署：無工具可設環境變數，公開值直接隨建置檔案帶入即可〔本專案 2026-08-14〕
- **情境**：MCP 的 Vercel 工具集沒有「設定 project 環境變數」的 tool；但 Next.js 的 `NEXT_PUBLIC_*` 變數在 build time 就會被內聯進打包後的程式碼，runtime 才設定沒用。
- **修法**：既然 Supabase anon key + URL 本來就設計成公開值（安全性靠 RLS，不靠藏 key），直接在這次部署上傳的檔案裡帶一個 `.env.production`（Next.js build 時會自動讀），不進 git 版控，只存在於這次 Vercel 上傳的檔案清單裡。
- **教訓**：只有「本來就該公開的值」才適用這招；換成 service_role key 或任何真密鑰，這個捷徑就是洩漏，必須走真正的 secret 管理（Vercel 後台環境變數／密鑰管理服務）。

### 18. 新 Vercel 專案的部署 target/alias 行為不一致，不能預設猜測〔本專案 2026-08-14〕
- **症狀**：同一組程式碼、同樣呼叫 `deploy_to_vercel({target:"preview"})`，第一次部署被 Vercel 自動標成 `target:"production"` 並綁上正式 alias；第二次同樣呼叫卻是 `target:null`、`alias:[]`，只給了部署專屬網址。
- **教訓**：**不要在文字裡宣稱「這是 preview / 這是 production」，除非剛查過那次部署回傳的 `target`/`alias` 欄位**——平台行為會變，猜測會變成對使用者的誤導。每次部署後都查 `get_deployment` 的實際欄位，如實轉述，而不是複誦上次的措辭。

### 19. 建立 Auth 帳號需要 service_role key，anon key 做不到〔本專案 2026-08-14〕
- **情境**：SPEC §27/§46 要 SANCI Admin 能在畫面上建立 Partner 的登入帳號（P-07）。但 `auth.users` schema 不透過一般 PostgREST 暴露，建立使用者要呼叫 `auth.admin.createUser`，這個 API 只認 `service_role` key。
- **決策**：這把 key 一旦外洩等於繞過全部 RLS，是資料庫的最高權限；Jenzo 明確被告知不要貼到對話裡，這個環境也就沒有它。
- **教訓**：要解鎖有兩條路：① Jenzo 到 Vercel 後台自己加 `SUPABASE_SERVICE_ROLE_KEY` 環境變數（不貼給我），Server Action 從 `process.env` 讀，金鑰全程留在伺服器端不進瀏覽器；② 改用 Supabase Edge Function，金鑰整個留在 Supabase 那側。兩條路都需要 Jenzo 再做一次操作，不是程式碼問題。
- **✅ 2026-08-17 已解除（走路線 ①）**：功能做完了，這條保留是因為**用 service_role 的紀律比功能本身重要**。四條硬規矩：①**admin 檢查一定在前**——先用使用者自己的 session client 查 `platform_admins`，通過才建 service_role client（順序顛倒＝那段程式碼後面全裸奔）；②**service_role 只用於它唯一做不到的事**（`auth.admin.createUser/deleteUser`），其餘寫入照常走一般 client 讓 RLS 再擋一次；③檔案內 `assertServerOnly()` 硬失敗＋變數名**不加 `NEXT_PUBLIC_`**（Next.js 結構上就不可能把它內聯進瀏覽器）；④驗收要跑 **bundle 掃描**確認 client chunk 零命中——而且要**反向驗證掃描本身有效**（在同一批檔案裡找得到某個已知的 UI 字串），否則「零命中」可能只是 grep 找錯地方（LESSONS 驗證類的假陰性）。

### 29. 兩段寫入的補償刪除，前提是「證明這是我剛建的」——查不出狀態時寧可留孤兒，也不能刪〔本專案 2026-08-17〕
- **情境**：建立登入帳號＝先建 auth 帳號、再寫 `partner_users` 連結列。第二段失敗會留下孤兒 auth 帳號（app 裡完全看不見，但那個 email 從此不能再用）。直覺解法是「失敗就把剛建的 auth 帳號刪掉」。
- **危險在哪**：`createUser` 本身逾時的情況下，我們**手上沒有 user id**。若改用 email 去搜尋然後刪除，命中的可能是一個**既有帳號**——包括 SANCI Admin 自己的（admin 本來就沒有 `partner_users` 列，長得跟「孤兒」一模一樣）。補償動作反而變成刪掉正常帳號。
- **規則**：補償刪除只能針對**本次呼叫證明是自己建立的** id。狀態查不出來時三種結局要分清楚：查到列＝其實成功（回報成功）、查無列＝證實是孤兒（刪）、**查詢本身失敗＝不確定（不刪，誠實回報部分狀態並附上 email，叫使用者別重建）**。
- **教訓**：**補償（compensating action）本身也是破壞性操作，一樣要先確認再動手。**「回滾」聽起來安全，但在不確定的狀態下回滾，跟在不確定的狀態下宣稱成功一樣糟——只是壞的方向不同。DB 層再加一道保險：`auth_user_id` 的外鍵設 `on delete restrict`，連結列真的存在時 Postgres 會直接拒絕這個刪除。

### 20. 防抖草稿要在「確認成功」時連 timer 一起取消，否則已排程的寫入會把剛清掉的草稿復活〔本專案 2026-08-14〕
- **情境**：草稿自動存檔一定要防抖（每次按鍵都寫 localStorage 太吵），而清草稿的正確時機是「伺服器確認寫入成功」那一刻。兩件事湊在一起就有時間差。
- **症狀**：使用者打完最後一個字（排程 800ms 後寫入草稿）立刻按 Simpan，伺服器 300ms 就回成功 → `clear()` 刪掉 key → 剩下的 500ms 到期，排程中的那次寫入把草稿**又寫回去**。下次打開表單會跳出「有未完成的草稿」，內容是剛剛已經成功存進 DB 的資料——使用者會以為存檔失敗。
- **修法**：`clear()`（以及 `discard()`）第一件事就是 `clearTimeout`，不能只刪 storage key。
- **教訓**：**任何「延後執行 + 之後清除狀態」的組合都要問一句「排程中的那一次會不會在清除之後才落地？」**這類 bug 只有在真的按下去、而且時機剛好時才會出現，靠讀 code 很容易漏掉——本輪是用假的 React/DOM/localStorage 跑「排程後立刻 clear」的斷言才釘住的。

### 21. idempotency 欄位的 unique 衝突代表「上一次其實成功了」，不是「使用者填重複」〔本專案 2026-08-14〕
- **情境**：`partners` 上同時有 `code` 和 `client_request_id` 兩個 unique constraint，兩者違反時 Postgres 都回 `23505`。
- **症狀（原本的寫法）**：只判斷 `error.code === "23505"` 就顯示「Kode partner GH sudah dipakai.」。弱網重試時撞到的其實是 `client_request_id` 那條——資料明明已經好好存進去了，畫面卻告訴使用者代碼重複，逼他改代碼再存一次，於是真的多出一筆。
- **修法**：`23505` 要再看 constraint 名稱（`isRequestIdConflict()` 檢查訊息裡有沒有 `client_request_id`）。是 idempotency 欄位就回頭用該 id 反查並回報**成功**，其他才是使用者的欄位錯誤。
- **教訓**：**同一張表有多個 unique constraint 時，錯誤碼不足以判斷發生什麼事，要看是哪一條。**idempotency key 存在的意義就是讓重試安全；把它的衝突當成使用者錯誤，等於親手拆掉自己的防重複機制（呼應鐵律 3）。

### 22. 固定路徑 + upsert 的公開檔案，一定要自帶版本參數，否則使用者換圖後看到的還是舊圖〔本專案 2026-08-14 設計時預先擋掉，待真人驗證〕
- **情境**：Partner Logo 存成 `partner-logos/<partner_id>/logo.webp`（一個 partner 一張圖，用 upsert 覆蓋）。好處是不會累積垃圾檔案，但代價是**檔案內容變了、網址一個字都沒變**。
- **會發生什麼**：公開 bucket 的網址走 CDN／瀏覽器快取（我們自己還設了 `cacheControl: 3600`）。使用者換了新 logo、存檔成功，畫面卻還是舊 logo——他的結論一定是「這系統壞了／我剛剛沒存到」，接著重存好幾次。功能其實完全正常，錯的是快取。
- **修法**：存進 `logo_url` 的網址後面加版本參數（`?v=<上傳當下時間>`）。DB 存的字串每次都不同 → 一定拿到新圖；檔案本身仍然只有一份。
- **教訓**：**「覆蓋同一個路徑」和「網址就是快取的 key」是天生衝突的**，只要檔案給使用者看，就要在寫入 DB 的那一刻決定版本字串。順帶一提，這類 bug 在開發者機器上常常看不到（強制重新整理、devtools 關快取），是典型的「只有真實使用者會遇到」型缺陷——也因此它列在 Jenzo 的驗收步驟裡：換第二張圖確認畫面真的跟著換。

### 23. Auth middleware 的 matcher 沒排除離線後援路徑，離線後援機制反而依賴它要繞過的東西〔本專案 2026-08-14〕
- **情境**：加 PWA app-shell cache 時，`sw.js`／`manifest.webmanifest`／`/offline` 這三個路徑本質上不需要登入，`/offline` 尤其該在系統本身出問題時都還能開。
- **症狀**：`middleware.ts` 的 matcher 只排除 `_next/static`、`_next/image`、`favicon.ico` 和圖片副檔名，沒排除這三個路徑——結果它們也被拉去跑 Supabase auth 檢查（`supabase.auth.getUser()`）。本機測試沒設 Supabase env 時這三個路徑直接 500；即使 env 正常，也是白白多一次不必要的 auth round-trip，離線時更是本末倒置：離線後援頁面的可用性去依賴一個只有連得上網才能過的檢查。
- **修法**：matcher 明確排除 `sw\.js`、`manifest\.webmanifest`、`offline`。
- **教訓**：**任何「系統壞掉/離線時的後援機制」都要問一句：這個後援本身有沒有偷偷依賴它要繞過的那個東西？**這類 bug 平常測不出來（開發時通常已登入、也有網路），只有在真的斷網或 auth 掛掉時才會發現後援也一起掛了——所以要主動測，不能等它發生才發現。

### 24. PostgREST 的關聯查詢（embed）只認外鍵，「兩張表指向同一個父表」不能直接互相 embed——而且 typecheck 完全抓不到〔本專案 2026-08-16，第一個真帳號登入當場踩中〕
- **情境**：`partner_users` 和 `partner_access_policies` 都各自 FK 指向 `partners`，彼此之間沒有外鍵。Phase 1 寫了 `partner_access_policies:partner_id(...)` 想從 partner_users 直接 embed 過去，複製到五個頁面（含 Phase 2 兩頁——**抄既有慣例時把 bug 一起抄走**）。
- **症狀**：對 supabase-js 來說關聯字串只是字串，typecheck ✓ build ✓ 全綠；**執行時** PostgREST 找不到兩表之間的關聯，整個查詢報錯。而且潛伏了整個 Phase 1——因為從來沒有真的 partner 帳號登入過這些頁；Jenzo 建立第一個測試帳號登入的那一刻才爆（「Data akun gagal dimuat」）。
- **修法**：拆成兩段查詢（先拿 partner_id，再 `.from("partner_access_policies").eq("partner_id", ...)`），或走真外鍵的巢狀路徑 `partners:partner_id(..., partner_access_policies(...))`。本專案選前者（與 admin 端已驗證的分開查詢慣例一致）。
- **教訓**：①embed 字串的正確性是**執行期**的事，唯一的驗證方法是真的跑一次該頁——「沒有真帳號可測」的頁面等於一行都沒驗過；②修掉一處立刻 grep 全庫同 pattern（這次一抓抓到五處）；③新頁面抄舊頁面慣例前，先確認那個慣例真的在 production 跑過。

### 25. RLS 讀取 policy 絕不可回查自己那張表——INSERT…RETURNING 會被「同指令不可見」規則整句擊殺〔本專案 2026-08-16，production 分店建客戶全滅後定案〕
- **情境**：`customers`/`partner_staff` 的 SELECT policy 呼叫 security definer 函式，函式內 `select … from customers where id = cid` 回查自己那張表。supabase-js 的 `.insert().select()` 編成 `INSERT…RETURNING`，RETURNING 的列要過 SELECT policy——而 **Postgres 規定：同一條指令插入的列，對該指令內部發出的任何查詢都不可見**（與函式標 STABLE/VOLATILE 無關，實驗證明過）。於是 policy 判 false，整筆以 42501 回滾。
- **陰險之處**：admin 完全測不到（`fn_is_admin()` 短路、不回查表），只有分店身分會中；而且失敗訊息長得跟「伺服器忙」一模一樣。production 第一個分店帳號按下 Buat Pesanan 才現形。
- **修法**：policy 的「自己這半」直接吃列上就有的欄位（`fn_can_view_branch(created_via_branch_id)`），只有「別張表那半」（例：有訂單在可見分店）才進 security definer 函式（那裡 LESSONS #15 仍適用）。
- **教訓**：①寫任何 SELECT policy 前問一句：「這條規則需不需要查我自己這張表？」需要＝設計錯了，改成用列上欄位表達；②RLS 類修改的驗收必測「**最低權限身分的 insert+RETURNING**」，admin 測過不算數；③audit 報告的機制解釋也要驗證——這次原假設（STABLE 快照）是錯的，照它修可能修不乾淨。

### 26. security definer 函式的 EXECUTE 面要主動管理：入口函式全鎖、policy 輔助函式必須開〔本專案 2026-08-16〕
- PostgREST 會把 public schema 裡可執行的函式全部暴露成 `/rpc/`。`fn_next_order_seq`（取號）忘了 revoke → 未登入都能亂灌任何分店的流水號（跳號＋儲存 DoS）。
- 反向的坑：policy 表達式是以**查詢者**身分執行的，把 policy 用到的輔助函式（fn_can_view_branch 等）也 revoke 掉，查表會直接炸 `permission denied for function`——不是安靜的 0 列（實測過）。
- **規則**：每個新 security definer 函式誕生時就決定 EXECUTE 面——「只給 trigger/RPC 內部用」→ revoke public/anon/authenticated；「被 RLS policy 引用」→ 明確 grant anon+authenticated。寫在 migration 裡，不靠預設值。

### 27. 一張表兩個 unique constraint 時，每個「23505 → 好懂訊息」的翻譯都要照抄一次——複製 CRUD pattern 時漏掉就是啞巴錯誤〔本專案 2026-08-17 audit round 2〕
- **情境**：`sanci_products` 同時有 `client_request_id`（idempotency）和 `sanci_products_code_key`（業務碼）兩個 unique constraint,兩者違反都回 23505（呼應 LESSONS #21）。`actions-packages.ts`（先寫的）在 idempotency 分支之後補了 `if (written.code === "23505") return {field:"code", message:"Kode package sudah dipakai."}`；`actions-products.ts`（照著抄的）只抄到 idempotency 分支就停了，兩個 CRUD 函式（createProduct/updateProduct）都漏了這段。
- **症狀**：admin 建立/改名產品時撞到重複代碼，看到的是「Tidak bisa menyimpan sekarang. Coba lagi sebentar lagi.」——按 Simpan 重試永遠不會成功,因為問題不是網路是代碼重複,訊息卻叫他重試。
- **修法**：`actions-products.ts` 的 `written.reason === "db"` 分支裡,`isRequestIdConflict` 判斷之後、通用 `serverSibuk` 之前,補上 `if (written.code === "23505") return {field:"code", message:"Kode produk sudah dipakai."}`，create/update 兩處都要補。
- **教訓**：抄 CRUD pattern 到新表時，「這張表有幾個 unique constraint、每個各自的錯誤訊息」要逐一核對來源檔案，不能只抄到第一個分支就收工——這類 bug typecheck/build 都是綠的,只有真的觸發那個 constraint 才會現形。

### 28. `audit_logs` 的 diff 渲染器（SKIP/LABELS）是全域共用的——新表新增任何 actor UUID／storage path／boolean 欄位,都要照著既有欄位的待遇補一份,不會自動繼承〔本專案 2026-08-17 audit round 2〕
- **情境**：`web/lib/audit-format.ts` 的 `SKIP` 集合和 `LABELS`/`VALUE_LABELS` 對照表是**所有**表共用的通用渲染器,不是每張表各自的 schema。0009 加了 `customer_arrived_by`（跟 `created_by`/`cancelled_by` 同類的 actor UUID）和 0010 加了 `photo_url`（跟 `logo_url` 同類的 storage path）,但兩個都沒有比照舊欄位加進 `SKIP`；`sanci_catalog_access.enabled` 是新的 boolean 欄位,`asLabel` 原本只認得字串枚舉,布林值會被 `String()` 變成英文的 `"true"/"false"` 直接漏進印尼文介面（呼應 LESSONS #13）。
- **症狀**：Admin 打開訂單/Partner 的「Activity」分頁,標記客戶到店後的 diff 會多印一行原始 UUID（`customer_arrived_by: 3fa85f64-...`）；開/關某 partner 的產品目錄存取,diff 顯示 `enabled: true → false` 而不是印尼文。兩者都不是安全漏洞（僅 admin 可見）,但違反這個檔案自己在註解裡定的規矩（「Kolom internal... jangan pernah ditampilkan mentah」）,也是本專案上一輪才修過的同一類 bug（P2-2,UUID 洩漏進 Activity）。
- **修法**：新表產生的每個新欄位都要問一次「這是 actor UUID／storage path／純內部鍵嗎」→ 加進 `SKIP`；「這是要給人看的業務值嗎」→ 加進 `LABELS`（布林值另外在 `asLabel` 里特判,不能只加字串枚舉表）。
- **教訓**：`audit-format.ts` 沒有 TypeScript 型別把它和資料表 schema 綁在一起,新增/修改資料表的 migration 完成後,必須手動巡一次這個檔案的 `SKIP`/`LABELS`——這是純字串比對,漏掉不會有任何編譯期或執行期錯誤提示,只會在 UI 上安靜地洩漏原始值。

### 30. 「讓 admin 看得到使用者密碼」要當場說清楚做不到，並給出真正解決痛點的替代品——不要靠存明文去滿足字面要求〔本專案 2026-08-17〕
- **情境**：Jenzo 要求「密碼由各店家自行設定，可是 SANCI 可以看到」。前半合理，後半在技術上與安全上都不該做：Supabase Auth 存的是單向雜湊，存進去就讀不回來；要「看得到」只能自己另存一份明文或可逆加密。
- **為什麼不能照做**：一旦存明文，任何拿到資料庫的人（或任何一個 admin 帳號）就看得到所有店家的密碼；而店家普遍重複使用密碼，等於連他們的銀行、WhatsApp 一起賠進去。這不是「比較不安全」，是把系統變成別人資安事故的來源。
- **正確回應的三段式**：①**指出真正的痛點**——他要的其實不是「看到密碼」，是「店家忘記密碼時我能處理」；②**照做能做的那半**（移除自動產生、改由 admin 輸入店家指定的密碼——建立當下他本來就知道，因為是他自己打的）；③**補上真正解決痛點的功能**（重設密碼）。結果是需求被滿足了，而且沒有留下明文。
- **UI 也要誠實**：畫面用「系統只存密碼的指紋，任何人都讀不回來」這種白話講清楚，不要用「雜湊」這種技術詞，也不要含糊帶過讓使用者以為某處查得到。
- **教訓**：**使用者的需求描述是「他想解決的問題」的代理，不是規格書。** 遇到「字面上做了會造成傷害」的要求，正確做法既不是照做、也不是單純拒絕，而是把不可能的部分講清楚、把背後真正的需求找出來、再用安全的方式滿足它。順帶把界線寫進程式碼註解（本例寫在 `lib/supabase/admin.ts`：連 service_role 也讀不回密碼，不准為此建可讀回的欄位），讓下一個人不會重新提議一次。

### 31. 兩個 agent 平行改同一套共用 API（`pesan`/`submitSafely`）時，只跑各自那一半的 typecheck 不夠——要等兩邊都收工，對整棵樹跑一次才算數〔本專案 2026-08-18，三語系上線收尾〕
- **情境**：cabang 側與 admin 側 i18n 翻譯分兩個 agent 平行做，各自負責的檔案範圍內 typecheck 都過。admin agent 收工報告時提到 `app/cabang/**` 還有 7 個檔案沒過——那些其實是 cabang agent 早就翻完、但沒改完全部呼叫點的殘留：舊的 `PESAN` const 匯入、`submitSafely()` 漏了新必填的 `messages` 欄位、`compressImage()` 還是硬編印尼文錯誤訊息完全没走 `Messages`。
- **為什麼各自 typecheck 會漏**：cabang agent 在自己改的範圍內東西是自洽的（`pesan(m)` 呼叫點都改了大部分，只漏了幾個共用 helper 函式內部沒同步），但 `web/lib/safe-write.ts`/`web/lib/compress-image.ts` 這兩個共用檔案的介面收斂（`messages` 從選填變必填）是**跨兩個 agent 範圍的契約改動**，任何一邊單獨跑 `tsc` 都測不出對方那一側殘留的舊呼叫方式。
- **教訓**：平行 agent 改共用底層模組的簽名時，**收工判準不是「我改的檔案 typecheck 過」，是「清掉 tsbuildinfo 快取後對整個 `web/` 跑一次 `tsc --noEmit` + `next build` 都過」**——尤其當任務描述本身就提到「另一個 agent 那邊還有殘留」時，那正是提示要立刻做整合驗證，不要假設對方會自己收尾。
- **順帶補的洞**：`compress-image.ts` 的 `pesanKompres()` 一開始完全獨立於 `Messages`（直接回傳印尼文字串），三語系翻完admin/cabang兩側的 UI 文字後，這個檔案不會被任何一個「翻譯 UI 文字」agent 摸到——它是*邏輯*檔，不是頁面。壓縮失敗（格式錯、太大、讀不出來）這種邊界情境的訊息最容易被三語系上線漏掉，因為平時測試路徑根本不會走到失敗分支。

### 32. 容器被回收時，HEAD 可能完全正常而只有「工作目錄＋索引」被還原到舊 commit——LESSONS #14 教的 `git log origin/main..HEAD` 這時是綠的，看不出任何異常〔本專案 2026-08-19，Package 內容切片開工當下踩到〕
- **情境**：接手任務要在 `partner_packages`／`sanci_products`／`audit-format.ts` 上加東西，結果整個 `supabase/migrations/` 只剩 0001–0003，`web/lib/i18n/` 整個不存在，`docs/SPEC-PHASE2.md` 也不見了。
- **實況**：`git status` 有 **249 個已 staged 的刪除（`D`）＋44 個修改**；工作目錄內容與 33 個 commit 之前的 `ddf1b36` **逐位元組完全相同**，而 `HEAD` 卻好端端停在 `b3f21ff`＝`origin/main`。
- **為什麼 #14 抓不到**：#14 的處方是「先對 git 實況」——但它預設 HEAD 會跑到舊 commit。這次 HEAD 是**對的**，`git log origin/main..HEAD` 回傳空、`git rev-parse HEAD` 等於 origin/main，兩個檢查全綠。真正的異常只在 `git status` 裡。**另外一個同源徵兆**：`node_modules` 只裝了 26 個頂層套件（`npx eslint` 直接 `ERR_MODULE_NOT_FOUND`），`npm ci` 補裝回 320 個。
- **危險在哪**：這種狀態下如果直接照任務描述動工，會得出「規格說的檔案不存在」的錯誤結論，然後**在 33 個 commit 前的舊樹上重建那些檔案**——產出的 commit 會把整個專案倒退回舊版再加上新功能，diff 巨大到沒人看得出來哪裡錯了。這正是 #14 最後一句「不要在舊樹上疊分歧版本」講的災難，只是入口不同。
- **修法**：確認**沒有東西會遺失**再還原，三個條件缺一不可：① `git merge-base --is-ancestor <那個 commit> HEAD` 為真（內容永久留在歷史裡）；② `git status --porcelain -uall` 沒有 untracked 檔案；③ `git stash list` 是空的。三項都成立時工作目錄裡沒有任何獨一無二的東西，`git reset --hard HEAD` 是零損失的。順手 `git tag` 標一下那個 commit 更保險。
- **教訓**：**開工前的 git 健檢要看 `git status`，不能只看 `git log`／HEAD。**「HEAD 是對的」不等於「檔案是對的」——工作目錄、索引、HEAD 是三個可以各自被弄壞的東西。判斷還原安不安全的標準也不是「看起來像垃圾」，而是**能不能證明這些內容在別處還在**；能證明就放心還原，不能證明就先問，不要憑感覺刪。

## Owner 已定調的決策（不要再重複提議）

- **技術選型 = Next.js + Supabase**（2026-08-14 定案）。
- **UI 主語言 = Bahasa Indonesia**（2026-08-14 定案）。全 UI 印尼文；code 內 domain naming 維持英文（SPEC §87）；enum/status 內部值維持英文、顯示層轉印尼文。
- **先 prototype 驗收、再真實作**（2026-08-14 流程確認）。UI/流程層面的改動先改 prototype 給 Jenzo 點，成本最低。

### 14. 推 main 前對 git 實況〔battle-tested〕
`git fetch && git log origin/main..HEAD` 先看遠端有沒有跑在前面；遠端 session 容器可能被回收重建，本地被還原到舊 commit——type check 突然報「你明明加過的東西不存在」時，**先對 git 實況再修錯誤**，不要在舊樹上疊分歧版本。

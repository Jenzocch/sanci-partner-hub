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

### 33. `pg_dump -s` 的輸出**每次都不一樣**——冪等驗證用它直接 diff 會穩定報出假的 schema drift〔本專案 2026-08-20，0013 冪等測試當下踩到〕
- **情境**：本專案驗證 migration 冪等的標準做法是「同一份 SQL 連跑三次，每次 `pg_dump -s` 後跟基準 diff，要求零差異」（0012 就是這樣驗的）。0013 照做，結果三次**全部**報 DRIFT。
- **實況**：差異只有兩行，而且長這樣——
  ```
  5c5
  < \restrict Pk15FtdK8Zg7txm51xwTNkfiO1MFAfPgYXyJVhffnrDfnrtCcAv16xZloZ3s55E
  ---
  > \restrict k6LKT9LIFHOCEc3jP8EoBCn9RauqE2MMn8PzbdmyBY5zVWM0u1DXuEFbINtCtVi
  ```
  `\restrict` / `\unrestrict` 是新版 pg_dump（本機為 16.13）加的安全機制，**每次執行都重新亂數產生一組 token**。它跟資料庫內容一點關係都沒有。真正的 schema 一個位元都沒變。
- **危險在哪**：這是**假陽性**，而且是會一直重現的那種。看到 DRIFT 的人有兩條錯路：① 以為 migration 真的不冪等，回頭去「修」一個不存在的問題（很可能把好好的 `create ... if not exists` 改壞）；② 反過來，因為「每次都這樣，應該沒事」而養成忽略 DRIFT 的習慣——那就等於整個冪等驗證從此形同虛設，下次真的漂移時也不會有人發現。第二條比第一條更貴。
- **修法**：diff 前把這兩行濾掉，而且要**明講理由**，不要默默 `grep -v`：
  ```bash
  diff <(grep -v '^\\\(un\)\?restrict ' dump0.sql) <(grep -v '^\\\(un\)\?restrict ' dumpN.sql)
  ```
  濾掉之後 0013 三次重跑確實是零差異，冪等成立。
- **教訓**：**驗證工具本身的輸出也可能有雜訊，「diff 不為空」不等於「東西變了」——先看差異的內容是什麼，再決定它代表什麼。** 這跟 LESSONS #7（成功訊息不是證據）是同一枚硬幣的反面：#7 說不要輕信綠燈，這一條說不要輕信紅燈。兩邊的正確動作一樣——**去看實際內容**，而不是看訊號的顏色。順帶一提，濾除規則要寫成「只濾掉這兩個已知的 pg_dump 標記」，不能寫成寬鬆的模式，否則哪天真的 drift 落在被濾掉的範圍裡就永遠看不到了。

### 34. 委派任務的規格描述可能已經過期——已 commit 的文件比對話裡的計畫更權威，兩者衝突時要停下來，不要照描述硬做〔本專案 2026-08-20，第八切片開工時發現〕
- **情境**：0014 切片的委派描述要求建一套折扣鏈計算引擎（輸入多組百分比、markup%、現金折讓，資料庫算出 `final_amount`，還附了一個算好的範例數字）。動工前照規矩讀 `GLOSSARY.md`/`FEATURES.md`，發現**同一個 commit**（0013，`dc223a2`，就是這一刀的 HEAD）裡剛寫進去兩句話：「系統不計算折扣，只記錄人決定的那個數字」、「系統不算任何東西……沒有任何定價規則」，而且明講是 owner 當天拍板的決定。
- **為什麼這是真衝突,不是我判斷錯**：兩份文件都不是舊檔案——是這一刀要接續的那個 commit 自己寫的,日期完全對得上,語氣是「拍板」不是「暫定」。委派描述裡的折扣範例雖然具體(有精確數字),但具體不等於是最新決定——完全可能是稍早的討論記錄,在 owner 後來拍板「不計算」之後就已經過期,只是沒有人回頭更新委派描述。
- **當下沒做的事,也不該做的事**：沒有自己選邊站(「委派描述比較新所以照做」或「文件比較正式所以不做」),也沒有默默把功能做小一點就算了事,更沒有假裝沒看到衝突直接開工。
- **修法**：只做兩份文件都不禁止的子集(單純記錄用的欄位,不牽涉計算),把牴觸的部分完整記在 migration 檔頭、README、FEATURES.md 三個地方,講清楚「為什麼沒做」而不是「還沒做」,並在交付報告裡把這件事單獨挑出來講給接手的人(不要埋在一堆其他完成項目中間,讓人以為只是順帶一提)。
- **教訓**：**執行委派任務前的文件盤點,不是只為了學會怎麼寫 code,也是為了抓委派本身可能已經過期的地方。** 尤其當委派描述的具體程度(精確範例數字)給人一種「這一定是最新溝通」的錯覺時,更要對照 commit 時間戳——時間比細節更可靠。發現衝突後,正確的判斷權在委派任務的人(或最終的 owner)手上,不在執行任務的當下這一步——執行者的責任是把衝突攤開講清楚、做不會加深問題的子集,不是自己選一個答案。

### 35. 一個具名 CHECK constraint 被後面的 migration「取代」（DROP 舊的、CREATE 新的）時，前面那個 migration 自己的 `if not exists` 冪等判斷會把舊的復活——ATURAN BESI 現有的檢查只涵蓋 `fn_audit_row`/policy，沒涵蓋這個模式〔本專案 2026-08-20，0015 開工時實測發現〕
- **情境**：0014 用 `do $$ if not exists (select … where conname = 'order_sanci_offers_dp_le_amount_check') then alter table … add constraint … $$` 建立 `dp_amount<=amount`。0015 需要把這條規則改成 `dp_amount<=final_amount`（不是同一條規則加寬，是名字都不一樣的兩個 constraint）——正確做法是 0015 自己 `drop constraint if exists`（舊的）+ `create if not exists`（新的），兩者都不編輯 0014 本身（ATURAN BESI：已跑過的檔案不能動）。
- **沒想到的地方**：如果照 ATURAN BESI 的既有邏輯以為「只要不重新定義 `fn_audit_row`/policy 就安全」，會漏掉這一類風險——0014 的那個 `if not exists` 區塊，判斷的是「這個名字的 constraint 現在存不存在」，跟它是不是「同一份邏輯規則」完全無關。0015 跑完之後，`order_sanci_offers_dp_le_amount_check` 這個名字確實不存在了（被 0015 drop 掉）——如果有人事後又把 0014 重新貼到 SQL Editor 跑一次（例如以為「補跑一次沒關係」），0014 的判斷式看到「不存在」就會**把舊 constraint 加回來**，而 0015 新增的 `dp_le_final_check` 完全沒被動到——變成兩條規則同時生效，其中舊的那條在特定情境（`final_amount > amount`，也就是套用 markup 的訂單）會比新規則更嚴格，悄悄拒絕本來該被允許的 DP 金額，畫面上不會有任何紅字或錯誤訊息解釋為什麼。
- **這跟 fn_audit_row 的舊坑不是同一件事**：`fn_audit_row` 用 `CREATE OR REPLACE FUNCTION`，誰跑在最後誰贏，ATURAN BESI 早就把這個模式的後果整理成表格。具名 CHECK constraint 用的是「DROP 舊名字 + ADD 新名字」，機制完全不同——受害的不是「最後跑的那個贏」，而是「中間任何一個舊檔案的冪等判斷式，會把新檔案剛做的事情看成『還沒做過』」。
- **修法**：這一類「後面的 migration 用不同名字取代前面 migration 建的 constraint/index」的情況，都要在**前面那個 migration 自己的區塊註解**旁邊補一句「這個名字如果被後面的檔案 DROP 掉，重新執行本檔會把它加回來」，並在 `migrations/README.md` ATURAN BESI 表格裡，用實測結果（不是推論）記录「重跑前面那個檔案，唯一真的改變的是這條 constraint，兩個 trigger 和三個 policy 完全沒事」——逐項量測過才能這樣寫，不能用「應該不會有事」帶過。
- **教訓**：ATURAN BESI 目前整理的兩種模式（`CREATE OR REPLACE FUNCTION` 覆蓋、policy 名字沒被新檔案 DROP）都是「最後跑的贏」；具名 constraint 的 DROP+CREATE 模式是**第三種**、方向相反的模式（「中間跑的那個，因為看不到後面發生的事，會把後面的成果撤銷」）——每次一個新 migration 用不同名字取代舊 migration 建立的東西時，都要問一句「如果舊那份被重新執行，它的冪等判斷式現在還成立嗎」，不能只套用前兩種模式的直覺。

### 36. `ON CONFLICT (col) WHERE <predicate>` 對「已經存在但不符合 predicate」的舊列完全視而不見——拿它做 idempotent 種子資料，只要那一列的狀態被改過，重跑就會靜默造出重複資料〔本專案 2026-08-21，0018 施工當下實測發現〕
- **情境**：`customer_sources`/`sanci_sales_staff` 的唯一性刻意設計成「只在 ACTIVE 之間唯一」（partial unique index `where status = 'ACTIVE'`，跟 0010 同一種寫法）。第一版種子資料直覺地把 index 的 predicate 原樣搬進 `INSERT ... ON CONFLICT (code) WHERE (status = 'ACTIVE') DO NOTHING`，心想「跟 index 用同一個 predicate 一定安全」。
- **實測炸點**：`update customer_sources set status='INACTIVE' where code='D'` 之後重跑同一段種子 INSERT——`code='D'` 那一列已經是 INACTIVE，不再落在 `WHERE status='ACTIVE'` 這個 conflict target 的範圍內，Postgres 判定「沒有衝突」，於是真的又 INSERT 了一筆 `code='D', status='ACTIVE'` 的新資料。結果同一個代碼同時存在兩列（一列 INACTIVE 一列 ACTIVE），且完全沒有任何錯誤或警告——這正是 LESSONS #9（repo 裡的 migration ≠ production 已套用，Jenzo 隨時可能重貼同一份 SQL）會撞上的場景。
- **為什麼直覺會失靈**：`ON CONFLICT` 的「有沒有衝突」是拿**新列的值**去測 conflict target 那個 index 的 predicate 是否成立，不是去問「這個 code 在系統裡是不是已經有一列了」。種子資料的 INSERT 一律帶預設值 `status DEFAULT 'ACTIVE'`，所以新列永遠落在 predicate 裡；已存在的舊列如果狀態被改到 predicate 外，就從「衝突偵測」的視野裡直接消失——這跟一般人以為的「這個 index 應該會擋住重複」是反的。
- **修法**：種子資料的冪等判斷要問「這個 code 不論狀態存不存在」，不是「這個 code 在 ACTIVE 集合裡存不存在」——改成 `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.code = v.code)`（check-then-insert，不看狀態）。這類一次性、非併發的 migration 種子資料，check-then-insert 的非原子性不是風險（跟 LESSONS #3 禁止的「SELECT-lalu-INSERT 防重複」是不同場景——那條講的是防止*使用者*併發寫入產生重複，這裡是 migration 腳本單執行緒地建初始資料）。
- **教訓**：**partial unique index 的 predicate 是為了「業務規則允許什麼」設計的（只在 ACTIVE 之間唯一），不是為了「種子資料重跑安不安全」設計的——兩個問題答案不一定一樣，拿前者的 predicate 直接套進 `ON CONFLICT` 之前，要先問一句「如果這一列的狀態被改到 predicate 之外，會發生什麼事」。** 這類 bug 平常的驗證方式（跑一次、看種子筆數正確）完全測不出來——只有「先改狀態、再重跑」這個明確模擬 LESSONS #9 場景的動作才抓得到，本專案是施工當下主動這樣測才發現，不是事後回報的事故。

### 37. 一個 migration 的 BEFORE 觸發器悄悄改寫欄位值，會讓另一個 migration（甚至更早的）CHECK constraint 的行為測試斷言失效——CHECK 本身完全沒被動過，斷言依然可能不再成立〔本專案 2026-08-21，0019 施工當下驗證時發現〕
- **情境**：0017 的 `customers_customer_code_not_blank` CHECK 寫 `check (customer_code is null or btrim(customer_code) <> '')`，`supabase/test-harness/50_behavior_0017.sql` 的 T1 直接送 `customer_code=''`，斷言 Postgres 用 `check_violation` 擋下來。這條斷言在只有 0001..0017 的資料庫上百分之百成立。
- **實測炸點**：0019 施工當下依規矩對 `0001→…→0018→0019` 整條鏈重放，跑到 50_behavior_0017.sql 時 T1 報「FAIL blank customer_code was accepted」——INSERT 沒有噴 23514，反而**成功**存進一筆 `customer_code IS NULL` 的資料。回頭用只裝到 0018（完全沒有 0019）的乾淨資料庫單獨重跑同一段測試，結果一模一樣——**證明這不是 0019 造成的迴歸，是 0018 上線那天就已經存在的狀態，只是從來沒有人在 0018 之後、對著完整鏈重新跑過 0017 的測試檔**。
- **根本原因**：Postgres 對一次 INSERT 的執行順序是「BEFORE ROW 觸發器先跑（可以改寫 NEW 的欄位值）→ 用改寫後的值去檢查 CHECK constraint」。0018 的 `fn_set_customer_code`（BEFORE INSERT）開頭就有 `if new.customer_code is not null and btrim(new.customer_code) = '' then new.customer_code := null; end if;`——這是**刻意**的設計（註解寫明：讓表單留白的呼叫端得到「當作沒填」而不是一個看不懂的 23514），但它的副作用是：CHECK 永遠只會看到「已經被改寫成 NULL」的值，NULL 在 CHECK 語意裡自動視為通過（NULL 比較結果不是 false）。CHECK constraint 這條規則自己一個字元都沒變，變的是「值在到達 CHECK 之前先被誰動過手腳」。
- **為什麼容易被忽略**：兩個檔案（0017 定義 CHECK、0018 定義觸發器）都各自獨立測試都會過——0017 的測試檔本來就是設計成在「還沒有 0018」的資料庫上跑（它自己的檔頭寫了 `0001..0017`），單獨看完全合理；0018 自己的測試檔（60_behavior_0018.sql）也沒有理由去重跑 0017 的舊測試檔。只有「把兩者疊在一起、按照 ATURAN BESI 規定的完整鏈重放順序去跑」才會現形——而這正是本專案每次驗收新 migration 時实际在做的事，只是這次是第一次有人在 0018 上線之後真的把 0017 的測試檔也跑過一遍。
- **修法**：不去改 0017（CHECK constraint 本身沒有錯，也不該為了遷就一個新加的行為而改舊 migration 的規則定義）也不去改 0018（BEFORE 觸發器的空字串→NULL 轉換是刻意且合理的設計，不是 bug）——改的是**測試檔本身**：更新 T1 的斷言，讓它反映「完整鏈跑起來之後」真正會發生的行為（空字串成功存成 NULL，不是被拒絕），並在測試檔和 README 裡清楚寫明這是哪個 migration 造成的行為轉變、什麼時候發現的、為什麼原本的斷言不再適用。测试文件（不是 migration 本身）是可以隨著系統真實行為演進而更新的，只要更新的理由寫清楚、覆蓋率沒有因此變少。
- **教訓**：**「這個 migration 的 CHECK/policy/trigger 我完全沒有碰」不等於「跟它相關的行為測試斷言依然成立」——後面的 migration 只要在同一張表上加一個會改寫欄位值的 BEFORE 觸發器，就足以讓前面某個完全獨立、完全沒被觸碰的 CHECK constraint 的可觀測行為整個變掉。** 這跟 LESSONS #35（具名 constraint 被 DROP+CREATE 取代）是同一個家族但機制不同：#35 是「後面的 migration 直接拿掉了前面建立的東西」，這裡是「後面的 migration 沒有拿掉任何東西，只是在它前面加了一層會動手腳的關卡」——兩種都要求同一個習慣：**新 migration 在同一張表上裝 BEFORE 觸發器時，問一句「這張表现有的每一條 CHECK constraint，收到的值還會是呼叫端原本送出的那個值嗎？」**，而不是只確認「我自己這條 CHECK 邏輯有沒有被改」。這類 bug 只有对着完整重放鏈跑舊測試檔才抓得到，光看 migration SQL 文字或只跑新測試檔都看不出來。

### 38. 一個大物件字面值的「屬性」不能被 tree-shake——client 元件只讀其中三個字串，整本字典還是會進 bundle〔本專案 2026-08-21，UI/UX+效能 audit 補跑時實測〕
- **情境**：`lib/i18n/messages/index.ts` 把三語系文案組成單一常數 `MESSAGES`（common+cabang+admin × id/en/zh，共 946 個 key）。`app/offline/offline-card.tsx` 是 client 元件，`import { MESSAGES } from "@/lib/i18n/messages"` 之後只用到 `offlineTitle`／`offlineBody`／`retry` **三個字串**。
- **實測炸點**：`next build` 顯示 `/offline` 的頁面 JS 是 **45.4 kB**（First Load 148 kB），而其他頁面的共用基準是 103 kB。改成只 `import { common } from "@/lib/i18n/messages/common"` 之後降到 **7.67 kB**（First Load 110 kB）——**同一個檔案、同一份譯文、只換了 import 的粒度，就少掉 83%**。
- **為什麼直覺會失靈**：大家對 tree-shaking 的印象是「沒用到的就會被拿掉」，但 bundler 能搖掉的單位是**匯出的繫結（export binding）**，不是物件內部的屬性。`export const MESSAGES = {...}` 是**一個**繫結；只要有人碰它，整個物件字面值就必須完整保留（屬性隨時可能被動態索引——這裡確實就是 `MESSAGES[locale]`）。拆成 `common`/`cabang`/`admin` 三個獨立 export 之後，才有三個可以各自被搖掉的單位。
- **這次特別貴的原因**：中招的偏偏是 `/offline`——**唯一一個被 service worker 快取進每台使用者手機、而且必須在完全沒有網路時打得開**的畫面（LESSONS #23 講的就是它）。「離線後援頁面」扛著 45 kB 用不到的 admin 文案，跟 #23 的教訓是同一個家族：後援機制本身悄悄背上了它不需要的東西。
- **教訓**：**client 元件 import 一個「字典型」常數之前，先問「這個 export 的繫結有多大，不是我用到多少」。** 共用文案/設定/對照表要按使用區塊拆成多個 export，而不是一個大物件加深層路徑存取。驗證方法只有一個：**看 `next build` 的 Route 表格，把可疑頁面跟共用基準相減**——原始碼看起來完全正常，typecheck/eslint 全綠，只有建置產物的數字會說話（呼應 #7：成功訊息不是證據）。同一輪也用這招定位到 `@supabase/supabase-js` 整包（含本專案從未使用的 Realtime client，約 68 kB gzip）進了六條路由的 first-load。

### 39. 「冪等、可安全重跑」的匯入腳本 ≠ 不會毀掉手動修改——重跑前先查 audit（本專案 2026-08-24，真實資料損失）
- **事故**：owner 2026-08-22 在 Admin → Produk 手動換了 15 個產品的照片（audit 證實全部儲存成功）。2026-08-24 為了讓 169 張照片套用新的 cache 標頭，AI 指示 owner 重跑 `import-master-data/run.mjs`——腳本按設計 upsert 全部欄位＋覆寫照片檔，把 15 張手動換上的照片用 Excel 原圖蓋掉。storage 無版本備份，**照片永久損失**，只能請 owner 用留存的原始檔逐一重傳。
- **根因**：README 寫著「Aman dijalankan ulang (idempotent)」，AI 把「冪等」讀成「重跑無害」。但冪等只保證**不產生重複**，完全不保證**不覆寫後來的手動修改**——兩個獨立性質被混為一談。
- **修法**：run.mjs 預設模式改為「只新增不存在的產品，已存在的整列跳過（含照片）」；要覆寫必須明確 `--timpa` 且有 8 秒警告倒數；README 改寫並附「重跑前先查 audit_logs 有無手動修改」的 SQL。
- **教訓**：**叫 owner 重跑任何會寫資料的腳本之前，先列出它會寫哪些欄位/檔案，再查 audit_logs 確認這些目標自初次執行後有沒有被手動改過**——有就先擋下來想清楚。設計匯入腳本時，「安全重跑」的正確定義是「重跑不會蓋掉比它新的資料」，不是「重跑不會出錯」。這與 #7（成功訊息不是證據）同族：一個寫著「安全」的標籤，要先問它保證的到底是哪一種安全。

### 40. supabase-js `.or()` 的字串是 PostgREST 邏輯樹原文——使用者輸入含逗號/括號會拆斷整條 filter，必須雙引號包裹＋跳脫；且 like/ilike 的 `*` 會被 PostgREST 當成 `%`〔本專案 2026-08-26，型錄伺服器搜尋施工時讀 source 確認〕
- **機制**：`.or("name.ilike.%q%,code.ilike.%q%")` 原封不動進 `or=(...)` 參數（讀 node_modules PostgrestFilterBuilder.ts 證實），PostgREST 用逗號分隔條件、括號分組——搜尋詞 `Sofa 2,5 (L)` 沒處理就會變成語法錯誤或錯的條件。**修法**（lib/catalog-query.ts `catalogIlikeOrFilter`，順序不能反）：①先 LIKE-escape（`\`→`\\`、`%`→`\%`、`_`→`\_`，讓輸入被當字面值，鏡射舊 client `includes()` 語意）；②包 `%…%`；③整個 operand 用雙引號包住並跳脫 `\`/`"`（PostgREST 引號內全部字元字面化）。單獨的 `.eq()`/`.ilike()`（垂直 filter）不吃邏輯樹解析，逗號安全，不用引號。
- **已知且接受的邊界**：PostgREST 把 like/ilike operand 裡的 `*` 當 `%` 同義詞，跳脫不掉——使用者打 `*` 會得到萬用字元（結果是超集合，不會漏也不會炸），文件註明即可，不要用更多跳脫魔法去對抗。
- **教訓**：把使用者輸入塞進任何「本身有語法」的字串參數前，先查那層的保留字元與引號規則——URL encoding 是傳輸層的事，救不了參數值內層的語法衝突。

### 41. migration 的 §0 前置守衛若檢查「fn_audit_row 的現行版本是否還是上一個 definer 的」，會把自己的復原路徑鎖死——守衛要檢查「前置 migration 的物件存在」，不是「它的函式版本還在生效」〔本專案 2026-08-26，0021 施工當下實測抓到〕
- **情境**：0021 重定義 fn_audit_row（逐字複製 0018 版＋一行新 mapping）。第一版 §0 守衛寫「現行 fn_audit_row 的 prosrc 必須含 CUSTOMER_SOURCE（=0018 版生效）才准跑」，直覺是「確保 0018 跑過了」。
- **實測炸點**：ATURAN BESI 的復原場景——舊檔（如 0001）被重跑、fn_audit_row 被打回舊版——此時 prosrc 裡沒有 CUSTOMER_SOURCE，而「重跑最後一個 definer（0021）」正是官方復原步驟；那個守衛卻在這一刻拒絕執行 0021，把唯一的單檔復原路徑鎖死（實測：rerun 0001 → 0021 被自己的守衛擋下）。
- **修法**：守衛改查前置 migration 的**物件存在**（to_regclass 查 0018/0019 的表、information_schema 查 0020 的欄位）——物件存在＝那些檔確實跑過＝整份複製安裝下去是安全的（而且正是復原）；物件不存在才是真的「前置沒跑」該擋的情況。0010 §0 的守衛（查 order_internal_notes 表）早就是這個模式。
- **教訓**：**「這個檔案重跑一次」在本專案是復原手段，不只是初次安裝——寫 §0 守衛時要把「損壞後重跑我來修復」的場景當成一等公民測一遍**，否則守衛越「嚴謹」越危險：它擋掉的第一個人就是來救火的人。判斷準則：守衛該問「前置檔案跑過嗎」（物件存在，單調不變），不要問「前置檔案的效果現在還在嗎」（會被後續/重跑改變的狀態）。

### 42. 從 owner 的文件/試算表抓資料產匯入 SQL 時，同一份資料常有多個過期副本——先把「抓到的值」亮給 owner 核對，等他說對才准跑〔本專案 2026-08-26，owner 當場攔下錯價〕
- **事故（未遂）**：批次匯入基準價，來源用了試算表裡的「PRICE LIST - SANCI INDONESIA (MARET 2026)」分頁，154 筆 SQL 都產好交付了。owner 看了一眼說「那個價格是錯的」，貼上正確的 177 列——兩邊價差普遍 20–30%（如 WMRC611-180：舊分頁 30,000,000 vs 正確 40,200,000）。那個分頁標題寫著年月、看起來就是正式價目表，但其實是舊版；同一本 workbook 裡另有 Master Data 分頁（含 HARGA LAMA 欄）和折扣價矩陣分頁，全是「價格」的過期或變形副本。
- **為什麼沒釀災**：①SQL 是交給 owner 貼進 SQL Editor 的，values 清單人眼可讀，owner 有機會在執行前看到實際數字；②add-only 設計（on conflict do nothing）讓「跑了錯的再跑對的」也救得回來（先 delete 錯的 base rows 即可）。若當時做成「AI 直接寫入」或「覆蓋式」，錯價就直接上線給全部分店看了。
- **教訓**：**營運文件（試算表尤其）裡同名資料幾乎必有多份，「標題最像正式版」不等於「現行版」。產出任何要寫入生產資料的東西之前，把解析出來的樣本（前幾筆＋筆數＋極值）亮給 owner，明確問「這是現行的對嗎」，等他核對過才執行。**這與 #39 同族：#39 是「寫入前查有沒有比你新的手動修改」，本條是「來源本身可能就不是現行版」。順帶：匯入 SQL 一律 add-only ＋ 執行後回報六類計數（總數/對到/新寫/跳過/找不到/歧義），這次正是靠回報表的 E 列抓到 8 個系統裡還沒建的產品。

### 43. Server component 的 `toLocaleString` 用的是**伺服器**時區（Vercel = UTC），不是讀者的——所有時間顯示必須明寫 `timeZone`〔本專案 2026-08-28，owner 實測回報〕
- **症狀**：owner 在雅加達 20:36 下單，訂單頁顯示 13:36（差 7 小時）。程式碼看起來完全正常：`new Date(order.created_at).toLocaleString("id-ID")`，locale 也對。
- **根因**：這些頁是 **server component**，格式化發生在 Vercel 的 Node 行程裡；`toLocaleString` 沒給 `timeZone` 就用**執行環境**的時區，而 Vercel 跑 UTC。locale（`id-ID`）只決定「怎麼寫」（月份名稱、分隔符），完全不決定「哪個時區」——兩件事很容易被混為一談。實測證據：`Intl.DateTimeFormat().resolvedOptions().timeZone` 在 build 環境回傳 `UTC`。
- **修法**：`lib/orders-shared.ts` 出一組共用函式（`formatDateWIB`／`formatDateShortWIB`／`formatDateTimeWIB`），全部明寫 `timeZone: "Asia/Jakarta"`；**不改資料庫存的值**（照舊 timestamptz UTC，LESSONS #11），純顯示層。不走「在瀏覽器渲染時間」那條路：會產生 hydration mismatch，還逼這些 0 KB client JS 的頁面為了格式化日期而載入 JS。
- **順帶抓到的第二個 bug**：日期範圍篩選原本用 `T00:00:00.000Z`～`T23:59:59.999Z` 當一天的邊界。以雅加達的牆上時鐘看，**當天凌晨 00:00–07:00 建立的訂單會從「當天」的篩選結果中消失**（它們的 UTC 時戳落在前一天）。改用 `wibDayBoundsToIso()`（`+07:00` 偏移，印尼無日光節約時間所以固定）。實測反證：`00:30 WIB` 的訂單在舊邊界 `false`、新邊界 `true`。
- **另一類，不可混用**：純日期欄位（Postgres `date`，如 `order_documents.doc_date`）**不是時間點**，不能套 WIB——「8月28日」就是 8月28日。用 `formatCalendarDate()` 兩端都錨定 UTC（`T00:00:00Z` + `timeZone:"UTC"`），任何時區下都不會跳成前/後一天。
- **教訓**：**「時間顯示錯了」的第一嫌疑犯永遠是「誰在格式化」，不是「值存錯了」。**在 SSR 專案裡，任何 `toLocaleString`/`toLocaleDateString` 沒有明寫 `timeZone` 都是一顆定時炸彈——本機開發時開發者的電腦剛好是當地時區，看起來完全正常，一部署到 UTC 伺服器就集體偏移。同一份程式在兩個地方跑出不同結果，正是 LESSONS #7 那句「成功訊息不是證據」的變體：畫面有數字，不代表數字對。

### 44. 在「有 BEFORE 守衛會拒絕部分列」的舊表上補欄位，`UPDATE` 式 backfill 必炸——`ADD COLUMN … NOT NULL DEFAULT <volatile>` 走的是 table rewrite：每列各自求值、且一個 row trigger 都不觸發〔本專案 2026-08-28，0023 施工當下實測〕
- **情境**：0023 要在 `partner_orders` 加一個每列都必須有值的 `customer_view_token`。直覺寫法是「加可空欄位 → `update … where token is null` → `set not null`」。
- **為什麼那個直覺會炸**：`partner_orders` 上有 `fn_guard_order_status_flow`（0005 §3，行 135–138）——非 admin 對**任何** `status='CANCELLED'` 的列做 UPDATE 都被 `raise exception` 擋下。SQL Editor 裡 `auth.uid()` 是空的，`fn_is_admin()` 回 false，所以只要資料庫裡有**一張已取消的訂單**，backfill 就在半路整份失敗。另外每一列還會多產生一筆毫無意義的 `ORDER_UPDATED` 稽核。
- **實測到的正解**：`alter table … add column … not null default (<volatile 運算式>)`。兩件事都當場量過（PG16 本機），不是查文件推論的：①5 列 → 5 個**不同**的 token（volatile default 會逐列求值，不是算一次複製）；②同一張表掛上 AFTER INSERT/UPDATE/DELETE trigger 後再跑一次 → **trigger 觸發次數 0**（table rewrite 不走 row trigger）。於是稽核不受污染、守衛碰不到、舊列全部拿到值，一個語句解決。
- **仍然要留的後路**：如果欄位在更早的失敗嘗試裡已經以「可空」形式存在，`add column if not exists` 就什麼都不做，rewrite 也不會發生。所以還是要留一段 `if exists (… is null)` 的補救 backfill，而那一段**必須**自己 `alter table … disable trigger user` 包起來（理由同上），並寫清楚為什麼。
- **教訓**：**在舊表上加欄位前，先問「這張表現在有哪些 BEFORE 守衛，會不會拒絕我用來補值的那個 UPDATE？」**——守衛是為了擋人手動改資料而寫的，它分不出「這是 migration 在補欄位」。同族於 #37（後加的 BEFORE 觸發器會改變前面 CHECK 的行為）：兩條都在講「同一張表上先前累積的 trigger，會讓一個看起來人畜無害的寫入變成另一回事」。順帶一條驗證用的：**測試腳本裡 `set role anon` 之後，就別再用子查詢去撈 token/id 了**——那張表對 anon 本來就是 0 列（那正是隔壁那條測試在證明的事），子查詢會靜靜回傳 NULL，於是整組測試變成在測「NULL token」，結果是一片看不懂的 FAIL。先在 superuser 身分用 `\gset` 把值抓進 psql 變數，再切角色。

### 45. 列表改成 client-state（useState 吃一次 props）之後，`router.refresh()` 對它就是空操作——「表單預填舊值＋無條件覆寫」把兩天前的顯示迴歸升級成靜默資料抹除〔本專案 2026-08-28，對抗性 review 抓到、親自對碼證實〕
- **迴歸的誕生**：2026-08-26 把 /admin/produk 從「server 全量渲染」改成「client 搜尋 hook」（use-catalog-search）。hook 用 `useState(initial.products)` 吃**一次**首批資料；此後每個存檔動作結尾的 `router.refresh()` 雖然讓 server component 重跑、送來新 props，但 **App Router 的 refresh 保留 client state**——新 props 被無聲忽略。從那天起：新增的產品不出現、卡片欄位不更新、修改視窗預填舊值、停用按鈕的字樣不翻轉。**兩天沒人發現**，因為原生 `<select defaultValue>` 的 DOM 自己記住使用者選的值（庫存下拉「看起來」有反應），而其他欄位很少連改兩次。
- **升級成資料抹除的那一步**：0024 的 size 欄要能在後台編輯，updateProduct 對 size 是**無條件寫入**（空 → null，這樣才能清掉錯字）。於是：存 size → refresh 無效 → 列表那列還是舊的 → 再開修改視窗（比如只想改個名字）→ size 預填空 → 按儲存 → **剛存的 size 被靜靜洗掉**。單看每一層都合理：無條件寫入是「能清空」的必要語意、useState 吃一次 props 是 React 慣例、refresh 是官方刷新手段——炸的是三者的組合。
- **修法（兩層，缺一不可）**：①hook 加「領養」effect——以 `initial.products` 的**陣列身分**辨識 refresh 送來的新批（server 重渲染才會換身分，client 重渲染不會），永遠更新 `initialRef`（「清空篩選」的還原路徑不得復活舊列），僅在無篩選、未按過「載入更多」時採納進 state，照 runSearch 還原路徑的既有模式把 `seq` +1 讓飛行中的回應作廢——**並補 `setSearching(false)`**（被作廢的回應永遠走不到它自己的那行，spinner 會卡死）；②hook 加 `patchProduct(id, patch)`——**每個 server 確認成功的寫入**（safeWrite ok 之後，呼應 #7：只用證實存進去的值）把該列的 state **與 initialRef 同時**補丁，蓋住領養夠不到的情境（搜尋中、篩選中、已捲深）；patch 時若有搜尋正在飛行，同 query 強制重查一次（forceFetch）——飛行中的舊回應是在 commit 之前讀的，落地會把剛 patch 的列蓋回舊值。「載入更多」不必處理：它的 append 按 id 去重、**已在 state 的（剛 patch 的）列永遠贏**。base price 隔壁欄位早就用「每次開窗重新載入、載入失敗就停用欄位」防同一族問題——它的註解 "nilai segar tiap kali, bukan cache kartu" 就是這條 lesson 的先行者。
- **教訓**：**把 server 渲染的列表改成 client-state 的那一刻，要當場盤點「這個畫面上所有以 `router.refresh()` 收尾的寫入動作」——它們全部剛剛失效了**，要嘛補領養、要嘛逐寫入補 patch，否則留下的是一個「看起來會動、其實凍結在首批資料」的畫面。而**任何「預填目前值＋儲存時無條件覆寫」的表單欄位，它的預填來源新鮮度就是資料安全問題**，不只是顯示問題——預填有多舊，儲存就能把資料倒退多遠。review 時抓這族 bug 的問句：「這個 defaultValue 的值，從 DB 到這裡經過幾層快取？每一層在存檔後會更新嗎？」

### 46. UI 文字自己就是一種「假成功」：兩個相鄰畫面的按鈕同名、錯誤訊息硬寫按鈕名，程式碼全對也會讓店員相信錯的事〔本專案 2026-08-28，owner 逐條實測後委派修正〕
- **同名按鈕**：`/kalkulator` 的主要按鈕叫「Buat Pesanan」，但 `handleConvertToOrder()` 只做 `writeCalcHandoff` + `clearCalcDraft` + `router.push`，**一個字都沒寫進資料庫**；真正建單的是下一頁 `new-order-form.tsx` 裡**同樣叫「Buat Pesanan」**的按鈕（而且還要先按交接橫幅的「Gunakan angka ini」、填完客戶）。店員報完價、按下大按鈕、看到畫面換頁，合理地相信訂單已經存在——它不存在。更糟的是 `calcIntroNote` 白紙黑字寫「按下"Buat Pesanan"之前不會存到系統」，等於親口保證那顆按鈕會存。**修法是文案不是邏輯**：按鈕改成講「去哪裡」（`Lanjut ke Pesanan Baru` / `Continue to new order` / `前往新建订单页面`），兩段說明改成明講「這裡不存、這顆只是把數字帶過去、要按下一頁那顆才存」。
- **硬寫按鈕名的復原訊息**：`net*`（弱網復原）六句全部結尾「tekan Simpan lagi」，但 `submitSafely` 的呼叫點裡按鈕是「Buat Pesanan」（全 app 流量最高的寫入）、「Simpan Penawaran」、「Ya, sudah diterima」，**真的只有一個畫面有 Simpan**。改成 `{tombol}` 佔位符，`pesan(m, tombol?)` 代入，`submitSafely` 加選填 `buttonLabel`，51 個呼叫點各自傳自己那顆按鈕**渲染時用的同一個字串**（不要另外手打，否則哪天按鈕改字兩邊就對不上）。順帶把「系統會用同一個請求編號」拿掉——那是 `client_request_id` 洩進店員文案。
- **抓法**：這族缺陷 typecheck / eslint / build 全綠，**只能靠一個一個念出畫面上的句子、對照那一刻螢幕上真的有什麼**。三個固定問句：①這顆按鈕按下去到底寫了什麼進 DB？②這句話提到的按鈕／物件，現在螢幕上有嗎？③這句話講的是使用者剛做的那件事嗎（按「標記已收到」卻回「客戶連結尚不可用」＝答非所問）？
- **同族的三個**：`markOrderDelivered` 失敗時回傳 `custLinkUnavailableMsg`（講的是另一個東西，而且沒說到底標記了沒）；客戶已存、訂單失敗時把訊息蓋成 `errOrderModuleInactive`（`partial` 明明帶著 customerId，店員卻不知道客戶保住了，於是重打一次）；同一個 `final_amount` 在三個畫面叫「Harga Akhir」「Total Akhir」「Total」。**共同根因都是「訊息由最靠近錯誤的那段程式挑，而不是由使用者剛做的那個動作挑」。**
- **給非技術使用者的錯誤訊息不要出現「migrasi database」**：店員對遷移編號無能為力，那個詞只會讓他覺得系統壞了。留「什麼不能用 + Hubungi SANCI Admin」，以及**訊息原本帶的保證**（訂單真的已取消／客戶真的已存）——那才是有用的部分。admin.ts 的同款字串**刻意保留**遷移字眼：SANCI 辦公室同仁確實會把編號轉給工程端。**「同一個技術狀況，對不同讀者是不同的訊息」不是重複，是分工。**

### 47. 五個 agent 同時派進同一個共用工作目錄，`git commit`／`git add -A`／`git stash` 會互相踩踏——commit 內容跟訊息文字對不上、真正的工作被埋進別人的 commit 裡、HEAD 在無人主動操作下自己移動〔本專案 2026-08-29，P2/P3 批次修復實戰〕
- **實際發生的三種踩踏**：①`git add -A` 沒有路徑限定，把當下工作目錄裡**所有 agent**的未 commit 修改一起掃進自己的 commit——commit 訊息只描述自己的任務，內容卻混進了別人的檔案；②在混亂狀態下做 `git reset`／`git stash pop`，把別人剛做完、還沒來得及 commit 的修改整段吞掉，事後只能從 stash 物件或 dangling commit 裡搶救；③兩個 agent 前後腳 `git commit`，後面那個在自己的 commit 裡不小心 amend／覆寫了前一個 commit 的內容，訊息卻沒跟著換——結果是 `git log` 顯示的一句話跟 `git show --stat` 秀出來的檔案清單完全對不上，光看 log 會誤判「這件事沒做」。
- **現場鑑識的正確順序（不是猜，是查）**：先 `git reflog`（比 `git log` 多看見已經被 reset 甩開的舊 HEAD）＋`git fsck --dangling`（撈被 stash/amend 甩掉但物件還在的懸空 commit）；懷疑訊息跟內容對不上，直接 `git show --stat <sha>` 對照 `git diff <sha的parent> <sha>`；懷疑短碼撞了别的 commit，`git rev-parse --disambiguate=<短碼>` 確認唯一。**commit 物件本身永遠不會變**——一旦某個 agent 真的成功建立過一個 commit（哪怕分支後來被甩開），它的內容就凍結在那個 SHA 底下，可以永遠撈回來；真正會被踩踏、會遺失的只有「還沒 commit 的工作目錄／索引」那一段。
- **搶救與重組都在乾淨的地方做，不要在共用目錄裡繼續動刀**：對每個 agent 真正留下的 commit（哪怕訊息文字錯了）先驗證內容（`git diff` 比對，逐段讀 diff，不要只看行數），確認乾淨後開一個全新的 `git worktree add --detach`（不是修復共用目錄那個），在裡面用 `git cherry-pick`／`git checkout <sha> -- <path>` 疊出正確的最終序列，跑完 tsc/eslint/build 三件套，**直接從那個隔離 worktree `git push`**（worktree 共用同一個 `.git`，push 不需要回到主目錄）。全部確認完才回頭對共用目錄 `git status` 逐檔比對「跟剛推上去的內容是不是零差異」，零差異才能安心 `git reset --hard origin/main`——這一步等於清掉所有 agent 留下的殘局，動手前必須先證明每一份殘局都已經安全落地。
- **教訓**：**同時派多個 agent 進同一個共用目錄，是拿「檔案範圍不重疊」當防線,不是拿「worktree 真的隔離」當防線**（後者這個環境已經證實不成立）——即使每個 agent 分到的檔案彼此不重疊,`git add -A`／`git commit -a`／`git stash` 這幾個「操作整個工作目錄」的指令依然會跨過那條界線互相污染。合併前永遠先問「這個 commit 的訊息，配不配得上它實際改的檔案？」，答案不確定就別信 `git log`，去 `git show --stat` 對照著看。

## Owner 已定調的決策（不要再重複提議）

- **技術選型 = Next.js + Supabase**（2026-08-14 定案）。
- **UI 主語言 = Bahasa Indonesia**（2026-08-14 定案）。全 UI 印尼文；code 內 domain naming 維持英文（SPEC §87）；enum/status 內部值維持英文、顯示層轉印尼文。
- **先 prototype 驗收、再真實作**（2026-08-14 流程確認）。UI/流程層面的改動先改 prototype 給 Jenzo 點，成本最低。
- **產品主檔以系統為準，試算表是鏡子**（2026-08-28 定案；同日 owner 再加碼：「以後所有的資料都在這邊改，google sheet 反而變成備份的」——所以尺寸、說明、價格等主檔欄位**都要能在後台 UI 直接編輯**，不能只靠貼 SQL；缺編輯入口的欄位視為缺功能）。owner：「以後可以反向建立在系統裡面，到 google sheet，這樣大家用同一個系統才會更正確」。新產品先建在系統、再同步出去；試算表不再是產品資料的來源。配套鐵則：**匯入試算表資料前必須先分辨欄位新舊**——2026-08-28 實測，owner 上傳的 Master Data CSV 其 `PRICE / UNIT` 欄與工作表的 `HARGA LAMA`（舊價）欄逐筆完全相同，照匯會讓全目錄降價 25–34%；只匯入尺寸與說明，價格一律以 owner 另行確認的清單為準。
- **合作店家可以在「產品」瀏覽格子上直接看到自己的 Harga Normal**（2026-08-28 定案，推翻先前「瀏覽畫面一律不帶價格」的做法）。範圍僅限登入的 partner 端 `/cabang/produk`（價格是該店的有效價：自己的 override → SANCI 基準價）；**公開頁 `/p/[productId]` 永遠不變、完全不碰價格**（0010 鐵則，該檔案連 `lib/price-query.ts` 都不 import）。實作上分成兩個契約，不可混用：`withPrices`/`price` 是計算機與選貨窗的**預填**（失敗可以無聲降級），`withDisplayPrices`/`display_price` 是**要給人看的數字**，必須三態（數字／null 確定沒價／缺欄位＝查詢失敗），因為對客人報價的店長不能把「查詢失敗」看成「沒有價格」（LESSONS #10）。
- **沒有現價的產品不建進系統**（2026-08-28 定案）。owner：「價格如果查不到 就先不要建立」。理由：無價產品在計算機/選貨窗會顯示 0 元，比不存在更危險。缺價的品項改用「列表給 owner 填價 → 拿到價格才建」的流程。
- **金額以系統為準，不是 Excel SO 分頁**（2026-08-27 定案）。系統的計算機／`order_sanci_offers.final_amount`／SO 列印頁三處算法逐字相同（見 kalkulator-client.tsx 與 migration 0015 `fn_compute_order_offer_final`），保證一致；Excel 那份「Form SO INV dan DO-SANCI」的合計是自己另外用公式重算的，折扣鏈只有 3 格、沒有加成/現金折讓欄位，超出這個範圍時會跟系統對不起來——這是已知且接受的落差（Excel 可以手動改那一格），**兩邊不一致時一律以系統畫面的 Harga Akhir 為準**，不要再回頭比對或修正 Excel 的算法。

### 14. 推 main 前對 git 實況〔battle-tested〕
`git fetch && git log origin/main..HEAD` 先看遠端有沒有跑在前面；遠端 session 容器可能被回收重建，本地被還原到舊 commit——type check 突然報「你明明加過的東西不存在」時，**先對 git 實況再修錯誤**，不要在舊樹上疊分歧版本。

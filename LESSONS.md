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
- **教訓**：這塊功能**目前技術上做不到**，UI 已誠實標示原因而非假裝有表單。要解鎖有兩條路：① Jenzo 到 Vercel 後台自己加 `SUPABASE_SERVICE_ROLE_KEY` 環境變數（不貼給我），我寫的 Server Action 從 `process.env` 讀，金鑰全程留在伺服器端不進瀏覽器；② 改用 Supabase Edge Function，金鑰整個留在 Supabase 那側。兩條路都需要 Jenzo 再做一次操作，不是程式碼問題。

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

## Owner 已定調的決策（不要再重複提議）

- **技術選型 = Next.js + Supabase**（2026-08-14 定案）。
- **UI 主語言 = Bahasa Indonesia**（2026-08-14 定案）。全 UI 印尼文；code 內 domain naming 維持英文（SPEC §87）；enum/status 內部值維持英文、顯示層轉印尼文。
- **先 prototype 驗收、再真實作**（2026-08-14 流程確認）。UI/流程層面的改動先改 prototype 給 Jenzo 點，成本最低。

### 14. 推 main 前對 git 實況〔battle-tested〕
`git fetch && git log origin/main..HEAD` 先看遠端有沒有跑在前面；遠端 session 容器可能被回收重建，本地被還原到舊 commit——type check 突然報「你明明加過的東西不存在」時，**先對 git 實況再修錯誤**，不要在舊樹上疊分歧版本。

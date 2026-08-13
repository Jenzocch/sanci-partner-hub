# SANCI Partner Hub — Phase 1 規格摘要（Partner Module）

> 來源：Jenzo 開發指令書 v1.0，2026-08-13 於對話中交付。本檔為忠實摘要，條號對應原文 §，供跨對話開發依據。與 Jenzo 最新指示衝突時以 Jenzo 為準。
> **給 AI：動工前先讀 FEATURES.md + LESSONS.md + 本檔。**

## A. 範圍與治理（§0–4, 90–92, 99, 102）

- 系統：**SANCI Partner Hub**，PWA。用於 SANCI 家具店與合作家具店（Golden Home 等）之間的客戶／套裝家具／選品／加購／倉庫／配送協作。
- **Phase 1 只做 Partner Module。** 嚴禁擴張到：Customer、Order、Package、Product Selection、Warehouse、Inventory、Delivery、Accounting、POS、Commission、Payment、WhatsApp API（§0）。開發中發現「順便做 X 比較方便」→ 不做，記錄 dependency 即可（§99）。
- 遵守 audit-jenzo（§1）：不破壞既有功能、最小 Diff、改前先讀專案、Build Success ≠ 完成、UI 成功 ≠ 資料成功、每項完成要獨立驗證、修復順序 Correctness→Security→Stability→Performance→UI/UX→Cleanup、問題分級 P0–P3、外部依賴失敗不得卡死核心流程、DB/Auth/RLS/Backup/Deployment 不得假設成功、沒證據標「未驗證」、沒完成不得說完成。
- 治理文件只有 `FEATURES.md` + `LESSONS.md`（§2）。不建 TODO/PLAN/STATUS/NOTES/ROADMAP/AUDIT.md。技術文件放 README 或 docs。
- FEATURES.md 每項功能要有 status / owner-module / dependencies / acceptance criteria / verification evidence，不能只寫 DONE（§3）。
- 實作順序（§90，不跳步）：repo audit → FEATURES.md → LESSONS.md → 架構盤點 → DB model → Auth model → RLS → Partner CRUD → Branch CRUD → Staff → Assignment → Login User → Permissions → Audit → Local Draft → Responsive UI → PWA basics → Tests → Security test → Offline test → Self audit → Final verification。
- 開工前先盤點 repo 現況（§91），不要看到空 repo 就自行假設技術選型。
- **無 Supabase project 時：停止並回報，不得偷用其他既有 project（SANCI／Gudang／Recruitment）**（§92）。

## B. 資料階層與商業原則（§5–6, 101）

- **Partner = 品牌／合作企業**（例：Golden Home）；**Branch = 旗下實體分店**（例：Golden Home Cirebon）。兩層級不得混合。多 Partner 架構（SANCI → Golden Home → Cirebon/Bandung/Jakarta；Partner B → Semarang/Solo；…）。
- 未來流程（Phase 1 不實作，但架構要知道）：Golden Home 客人買家具 Package → 客戶資料交給 SANCI → 客戶到 SANCI 選 Package 內 SANCI 提供的家具 → 可能 Upgrade／Add-on → SANCI 倉庫備貨 → SANCI 配送。
- **Partner 的客戶不得因為到 SANCI 選家具就變成 SANCI Direct Customer**；未來 Package/Upgrade/Add-on 都必須保留 Partner/Branch Attribution（§6, 101）。
- SANCI 必須知道：誰的客戶、哪個 Partner、哪個 Branch、哪個 Sales/Reception、選了什麼、是否 Upgrade/Add-on、送貨進度。Partner 能看自己客戶的進度，但 **Partner A 永不可見 Partner B**；同 Partner 跨 Branch 互看／互改由 SANCI 控制（§101）。Phase 1 就是建這個 attribution 地基。

## C. Partner（§8–13）

- 欄位：`id, name, code, logo_url, contact_name, contact_phone, status, created_at, updated_at`。**id = immutable internal ID，不用 code 當 PK**（§8）。
- **Partner Code**（§9）：2–8 字元，A-Z / 0-9 / hyphen，globally unique，DB unique constraint。例：GH、GOLDEN、GH-ID。禁止把 Branch 名放進去（如 "Golden Home Cirebon"）。
- Code 修改（§10）：DRAFT 可改；ACTIVE 鎖定。未來要改需 SANCI Super Admin + Special Change Flow + Reason + Audit。Internal ID 永不可改。
- Status（§11）：`DRAFT`（剛建立，未完成 Branch/User/Permission）／`ACTIVE`（正常合作）／`SUSPENDED`（暫停，資料保留）／`INACTIVE`（結束，歷史保留）。
- **Activate 條件**（§12）：Name ✓ + Code ✓ + ≥1 Active Branch ✓ + ≥1 Active Login User ✓ + Permission Configured ✓，缺一不可。
- Delete（§13）：Hard delete 僅限 DRAFT 且無有效 Branch／User／Staff／Business Data／重要 dependency；否則只能 Deactivate。Permanent delete 需二次確認（輸入 Partner Code，如 "Type GH to permanently delete Golden Home"）。

## D. Branch（§14–18）

- 欄位：`id, partner_id, name, code, address, city, province, contact_name, contact_phone, status, created_at, updated_at`（§14）。
- **Branch Code unique = partner_id + branch_code**（§15）：Golden Home/CBR 不能重複，但 Partner B/CBR 可以存在。
- **Branch Identity**（§16）：所有畫面不能只顯示 "Golden Home"，要顯示 Partner + Branch + 地址（尤其 Partner 使用者登入後）。
- 地址（§17）：重要資料，清楚顯示；Mobile 輸入用 multiline textarea，不用小單行 input。
- Branch Status（§18）：同四態；Suspended/Inactive 時歷史資料不得消失。

## E. Staff 與 Assignment（§19–23）

- Partner 分店自行管理自己的人員。**Staff ≠ Login Account**；Staff 是實際業務／接待人員（§19）。
- Staff Role（§20）：Sales／Reception-CS／Manager／Other。是商業角色，**不是系統 Permission Role**，不得混用。
- Staff 欄位（§21）：`id, partner_id, full_name, phone, status, created_at, updated_at`。**不在 Staff 上存 branch_id**（未來會調店）。
- **partner_staff_assignments**（§22）：`id, staff_id, branch_id, role, start_at, end_at, status`。調店不得改寫歷史（Andi 2026 Cirebon → 2027 Bandung，2026 紀錄仍是 Cirebon）。
- 離職 = Deactivate，不 Hard Delete；歷史仍可顯示 "Andi Setiawan (Inactive)"（§23）。

## F. Login User 與 Identity（§24–27）

- **Login User 與 Staff 分開**（§24）：有 Staff 無帳號（Andi）、有帳號的 Staff（Siti）都要能表達；未來可記 "Sales: Andi / Created By: Siti"。
- partner_users 欄位（§25）：`auth_user_id, partner_id, branch_id, staff_id(nullable), role, status`。
- **Branch Login Identity**（§26）：登入即身份（Partner=Golden Home, Branch=Cirebon）。普通 Branch User **不可自行切換 Branch**（沒有 Branch 下拉選單）。
- Phase 1：Login Account 由 SANCI Admin 建立管理；Partner 分店只管 Staff，不建 Auth Account（§27）。

## G. Permission（§28–34）

- SANCI Admin 控制 Partner Visibility。預設 `OWN_BRANCH`；可設 `PARTNER_ALL_BRANCHES`；預留 `SELECTED_BRANCHES`（§28）。
- **View Scope 與 Edit Scope 分離**（§29）：如 Visibility=PARTNER_ALL_BRANCHES + Edit=OWN_BRANCH → Cirebon 可看三店、只能改自己。
- 跨店設定（§30）：Own Branch Only 或 All Same-Partner Branches；後者再選 View Only 或 View+Edit。
- 預留 `partner_branch_access_rules` 表供未來 Selected Branches（Jakarta A ↔ Jakarta B 互看、Cirebon 不行）；Phase 1 UI 可不做，但 schema 不得阻擋（§31）。
- **P0 Security — Partner Boundary**（§32）：Golden Home User 永不可見 Partner B，即使知道 UUID/URL/API endpoint。
- **Branch Boundary**（§33）：OWN_BRANCH 權限下手改 URL 到別店，Server/DB 必須拒絕；不能只靠前端 redirect。
- **RLS / Authorization**（§34）：Supabase 則必須真 RLS。UI 藏按鈕不是 Security。授權鏈：auth_user → partner_id → branch_id → role → access_policy。SANCI Admin 全可見；Partner User 只見被授權範圍。

## H. 畫面規格（§35–49）

- **P-01 Partner List**（§35）：Desktop 用滿橫向空間（不做窄中央 card）。欄：BRAND／BRANCHES／USERS／ACCESS／STATUS ＋ Search ＋ Status/Access 篩選 ＋ Add Partner。
- Search（§36）：支援 Partner Name/Code + Branch Name/Code；搜 "Cirebon" 要找到 Golden Home 並顯示 "Matching Branch: Cirebon"。
- List State（§37）：Loading=Skeleton；Empty="No partners yet."；Error="Partners could not be loaded."+Retry。**API 失敗絕不可顯示 "0 Partners"**。
- **P-02 Add Partner**（§38–39）：一次只建 Partner（不同時建 Branch/User/Permission，避免 partial success）。流程：Create → Server Verify → Partner Detail → Add First Branch。欄位：Name*、Code*、Logo、Contact Person、WhatsApp。建立後 status=DRAFT。
- 重名（§40）：相似名不直接禁止，顯示 "Possible duplicate found." + View Existing Partner，由 Admin 判斷；真 unique 在 Code。
- Logo（§41）：PNG/JPG/WebP（先不開 SVG）；上傳前 resize+compress；**Logo 失敗不可拖垮 Partner 建立**（"Partner created / Logo upload pending" + Retry Upload）。
- **P-03 Partner Detail**（§42）：header（名稱/Code/狀態/統計）+ Tabs：Overview／Branches／Users／Permissions／History。Desktop 左右分欄用滿空間，不塞 800px 中央欄。
- **P-04 Add Branch**（§43）：Name*、Code*、Full Address*、City、Province、WhatsApp、Contact Person。建立後回 Partner/Branch Detail。
- **P-05 Branch Detail**（§44）：Partner+Branch 名、完整地址、Status；區塊：Overview／Staff／Login Users／Activity。
- **P-06 Staff Management**（§45）：分店可 Add/Edit/Deactivate/Search 自己的 Staff。**Add Staff 表單不出現 Branch 選擇**——由登入身份自動帶入（防 Cirebon 誤加到 Bandung）。
- **P-07 Login Users**（§46）：SANCI Admin 看 Name/Partner/Branch/Role/Status，可 Create/Disable/Reactivate。Phase 1 不讓 Partner User 管 Auth。
- **P-08 Permissions**（§47）：僅 SANCI Admin 可改。UI：Branch Visibility（Own Branch Only / All Same-Partner）+ Other Branch Access（View Only / View+Edit）。
- **P-09 Partner Mobile Home**（§48）：[Partner Logo] × [SANCI Logo]、Partner+Branch+地址、入口：Staff／Branch Profile／My Account。**不顯示未開發模組**（Orders/Customers/Warehouse/Delivery）。
- Two Logo（§49）：Partner Logo 動態取自 partner.logo_url，不寫死 Golden Home。

## I. UI 規則（§50–56, 86–89）

- Desktop ≥1200px：Sidebar 220–240px + Main 用滿剩餘；≥1600px 工作區可再擴；**不做 max-width:900px 中央欄留大空白**（§50）。
- Typography（§51）：Page Title 28–32px；Partner Name 18–20px；Primary 16px；Secondary 14–15px；Button 15–16px；Input ≥16px。不大量用 11–12px 小灰字。
- Mobile <768px（§52–54）：單欄、16px 邊距、不橫向捲動、大輸入框（高 48–52px、字 16–17px）、大按鈕（約 52px）、卡片取代桌面表格；鍵盤對應（Code=大寫友善、WhatsApp=inputmode:tel）。
- Tablet 768–1199px（§55）：1–2 欄、寬卡片、Drawer；不是 Desktop 縮小版。Responsive = 重排資訊，不是縮小（§56）。
- i18n（§86）：第一版單一主語言，但 component/label 結構要可未來 i18n；現在不做完整翻譯系統。
- Naming（§87）：統一英文 domain naming：Partner/Branch/Staff/Assignment/User/Permission/Audit；不混用 store/shop/dealer。
- **禁止 Golden Home 寫死**（§88）：不准 `if partner === "Golden Home"`、不准 GH 專用表；新增 Partner B 不得改 code。
- SANCI Logo 可為 platform configuration（未來 platform_settings 管 SANCI logo/名稱），Phase 1 保持簡單；Partner Logo 必須動態（§89）。

## J. Offline / 弱網（§57–63, 85）

- 必須處理：不穩定行動網路、暫時離線、timeout、response loss、重複送出、草稿復原（§57）。
- **Local Draft**（§58）：Add Partner／Add Staff／Edit Staff 未提交自動存本機草稿；重進頁顯示 "Unsaved draft found." + Continue Draft／Discard。
- **Offline 不可直接 Commit Partner**（§59）：Partner 是權限根 master data。離線＝Save Local Draft，顯示 "Saved on this device."，**不得顯示 "Partner Created."**；恢復網路後 Submit，Server 成功才算 Created。
- Pending Sync 與 Synced 的 UI 必須可區分（§60）。
- **Timeout**（§61）：Server commit 但 response 丟失 → 不可直接重 INSERT；用 idempotency_key／request_id／server lookup 確認。
- Save button（§62）：送出中顯示 Saving... 並防連點；但 button disable 不是唯一防線——仍需 server validation + idempotency + DB unique。
- 失敗不清空輸入（§63）："Could not save. Your entered data remains available." + Retry（資料真的還在才能顯示這句）。
- PWA Offline 範圍（§85）：可做 app shell cache、local form draft、適當唯讀快取；**不要求**離線 master data CRUD；Permission／Delete／Partner Activation 必須 Online。

## K. Audit（§64–68）

- Phase 1 就建，不等 Order 系統（§64）。
- 欄位（§65）：`actor_user_id, actor_role, action, entity_type, entity_id, partner_id, branch_id, before, after, server_timestamp`；高風險加 `reason`。
- Actions（§66）：PARTNER_CREATED/UPDATED/STATUS_CHANGED/DEACTIVATED；BRANCH_CREATED/UPDATED/STATUS_CHANGED；STAFF_CREATED/UPDATED/DEACTIVATED/ASSIGNMENT_CHANGED；USER_CREATED/DISABLED/REACTIVATED；PERMISSION_CHANGED。
- 用 **Server Timestamp**，不信 client 時間（§67）。
- Audit 不可被 Partner User 改；SANCI Admin 正常 UI 也不可 Edit/Delete（§68）。

## L. 錯誤與效能（§69–70, 78）

- 不把 DB 原始錯誤丟給使用者（不顯示 PGRST116/duplicate key...）；顯示如 "Partner code GH is already in use."；technical error 留 internal log（§69）。
- Partner List 只取列表欄位（id/name/code/logo_url/status/branch_count/login_user_count/visibility_scope/edit_scope），Detail 再載（§70）。
- Accessibility（§78）：Form 必有 Label（不拿 placeholder 當 label）；錯誤訊息顯示在對應欄位旁，不只靠紅框。

## M. 測試要求（§71–77, 95–97）

- Security（§71）：Cirebon user 打 Partner B URL → Denied；OWN_BRANCH 下打 Bandung URL → Denied；Same-Partner View → 可讀不可寫；View+Edit → 依 policy。
- Delete（§72）：有歷史 dependency 的 hard delete → Denied；DRAFT 空 Partner → 明確確認後 Allowed。
- Duplicate（§73）：兩個 browser 同時建 GH → 只有一個成功（DB constraint 保證）。
- Offline（§74）：Add Partner 填一半關 PWA 重開 → 草稿可復原。
- Timeout（§75）：Server 成功但 response 丟失 → 不得建第二筆。
- Mobile（§76）：360/390/430px 無橫向 overflow、字不小、按鈕好按。
- Desktop（§77）：1366/1440/1920px；1920 不得只有 800–900px 工作區。
- **完成定義**（§95）：Build/Type Check/Lint/Tests/Permission tests/RLS tests/Duplicate test/Weak network test/Responsive verification/Audit verification 全部有實際證據才算。
- Self audit（§96）：P0（跨 Partner 洩漏、跨 Branch 越權、Auth bypass、危險刪除、Secret 外洩）→ P1（重複建立、offline 假成功、掉草稿、權限錯、缺 Audit、assignment 歷史損壞）→ P2（mobile overflow、小字、desktop 空白浪費、loading/error UX、搜尋可用性）→ P3（外觀清理）。
- **獨立驗證**（§97）：不用實作同一條路驗證。UI 顯示 created → 另外 query DB 確認只有一筆；UI 顯示 Own Branch Only → 用 Cirebon user 實際請求 Bandung 資料確認被拒。

## N. 未來整合邊界（§79–83）

- 未來 Partner Hub 連 SANCI Sales/Inventory，Phase 1 不實作。分工：Partner Hub 管 Partner/Branch/Customer Source/Attribution/Package/Selection/Upgrade/Add-on/Visibility；SANCI 系統管 Product Master/Stock/Reservation/Picking/Fulfillment/Delivery（§79–80）。Golden Home 不直讀 SANCI Inventory DB。
- 架構不得阻擋未來欄位：external_product_id、external_sales_order_id、external_fulfillment_id、sync_status、synced_at；現在不實作 sync（§81）。
- Phase 1 建議表（§82）：`partners, partner_branches, partner_staff, partner_staff_assignments, partner_users, partner_access_policies, partner_branch_access_rules, audit_logs`（infra 表可加但要說明原因）。
- **不建**（§83）：customers/orders/order_items/packages/products/inventory/delivery。

## O. 環境與部署（§84, 92–94, 98, 100）

- PWA，Desktop/Tablet/Mobile 都要能用；分店主要手機、SANCI Admin 主要 Desktop/Tablet（§84）。
- 不 commit secrets；只提供 `.env.example`（§93）。service_role 不進 browser（§94）。
- **目前不部署 Production**、不綁 Vercel、不建 Domain（§98）。
- 最終交付報告格式（§100）：Implemented／Not Implemented／Files Changed／Database Changes／Auth-RLS／Tests／Verification Evidence／P0-P3 Audit／Known Risks／External Dependencies／Deployment（沒部署必須寫 NOT DEPLOYED）。沒真的成功必須寫 NOT COMPLETED / NOT VERIFIED。

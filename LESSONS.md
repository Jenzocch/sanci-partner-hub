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

## Owner 已定調的決策（不要再重複提議）

- **技術選型 = Next.js + Supabase**（2026-08-14 定案）。
- **UI 主語言 = Bahasa Indonesia**（2026-08-14 定案）。全 UI 印尼文；code 內 domain naming 維持英文（SPEC §87）；enum/status 內部值維持英文、顯示層轉印尼文。
- **先 prototype 驗收、再真實作**（2026-08-14 流程確認）。UI/流程層面的改動先改 prototype 給 Jenzo 點，成本最低。

### 14. 推 main 前對 git 實況〔battle-tested〕
`git fetch && git log origin/main..HEAD` 先看遠端有沒有跑在前面；遠端 session 容器可能被回收重建，本地被還原到舊 commit——type check 突然報「你明明加過的東西不存在」時，**先對 git 實況再修錯誤**，不要在舊樹上疊分歧版本。

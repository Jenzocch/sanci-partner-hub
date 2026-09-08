# Rollback — 上線後出大問題時怎麼退回

給誰看：Jenzo 自己動手，或接手的 Claude session 依這份文件執行。跟 `docs/
KARTU-DARURAT.md`（給第一線店員看的一頁紙）不是同一份——那份沒有任何指令。

跟 `docs/BACKUP.md` 的分工：BACKUP.md 講「怎麼把整個資料庫/Storage 從零重建」
（換新 Supabase 專案等級的災難）。這份文件講「上線後發現一次部署/一筆操作壞事，
怎麼最快退回昨天還正常的狀態」——九成情況用不到 BACKUP.md 那麼重。

## 第一步：先分類，屬於哪一種

| 症狀 | 屬於哪種 | 跳到哪一節 |
|---|---|---|
| 剛推上 `main`/剛部署完，網站整個掛掉、白畫面、或某功能全面壞掉 | **A. 部署壞了**（代碼問題） | §A |
| 網站能開，但某個資料表/欄位查詢報錯（例如剛跑完一份 migration 之後） | **B. 資料庫 migration 跑壞了** | §B |
| 網站和資料庫都正常，只是**某一筆**資料被誤刪/誤改（人為操作或程式邏輯錯誤寫壞一筆） | **C. 單筆資料錯誤** | §C |

先判斷清楚再動手——三種情況的正確處置完全不同，用錯手段可能把不相關的資料一起
往回退（例如整站 rollback 會連其他人這期間存的其他資料一起退掉）。

## A. 部署壞了（最常見，優先看這節）

### 止血（能用就用，最快，不需要重新 build）

Vercel Dashboard → 專案 `sanci-partner-hub`（team **Jenzo** / `wnsb-system`）→
**Deployments** → 找到壞掉之前最後一個確定正常的 Production deployment →
`...` 選單 → **Promote to Production** / **Instant Rollback**。

> **注意**：這個帳號目前是 **Hobby 方案**（2026-09-08 用 `list_teams` 核對），
> 而 Vercel 官方文件把「rollback 到指定 deployment」列為 **Pro/Enterprise 專屬
> 功能**。如果 Dashboard 上看不到這個按鈕，或按了沒反應，不要卡在這裡——直接
> 用下面「保證有效」的方法。

### 保證有效（任何方案都能用，走 git）

```bash
git fetch origin main
git log --oneline -10                 # 找出「最後一個正常」跟「開始壞掉」的 commit
git revert --no-edit <壞掉commit1>..<壞掉commit的最後一個>   # 一次退多個 commit
# 或只退一個：
git revert --no-edit <壞掉的那個commit的sha>
git push origin main
```

push 之後 GitHub 整合會自動觸發新的 Production 部署，幾分鐘後網站會回到 revert
之後的狀態——這個路徑不依賴 Vercel 方案等級，一定能用。

`git revert` 而不是 `git reset --hard` 的原因：revert 是新增一個「反向」commit，
`main` 的歷史不會被改寫；如果之後發現壞的其實只有一部分，還能再針對那個 revert
本身寫一個小修正,而不必重新面對整條被改寫過的歷史。

### 驗證止血是否成功

1. Vercel Dashboard 看到新 deployment 狀態變成 **Ready**。
2. 開 `https://<正式網域>/version`，應該回傳一個新的 commit id（跟 revert 之後
   的 HEAD 一致）——這個路由就是為了這種時刻存在的（`web/app/version/route.ts`）。
3. 照 `docs/HANDOFF.md`「驗證規矩」補跑一次 `tsc`/`eslint`/`build` 三步，確認
   revert 之後的狀態本身是乾淨的（不是退到另一個本來就有問題的版本）。
4. 真的去點一次剛才壞掉的那個功能，親眼看到恢復正常，才算完成——不要只看
   deployment 狀態是 Ready 就結案。

### 事後

在 `FEATURES.md`/`LESSONS.md` 記一筆：壞在哪個 commit、revert 了什麼、為什麼
沒在合併前抓到（測試漏了什麼分支、還是驗證步驟本身不夠）。

## B. 資料庫 migration 跑壞了

**不要手動改資料庫裡的 function/policy 去「補」**——`supabase/migrations/
README.md` 開頭的「ATURAN BESI」講的就是這件事：這個專案好幾個 migration 會
`CREATE OR REPLACE` 同一批 function（`fn_audit_row` 等），誰最後執行就贏。手動
改一次，下次任何人依序重跑 migration 又會被蓋回去，變成兩份互相矛盾的歷史。

正確處置：

1. 先確認到底是「新 migration 本身寫錯」還是「執行順序不對」（沒照
   `0001 → 0002 → … → 0028` 順序跑）。README.md 的 ATURAN BESI 表格列出了跳過
   某個編號會具體壞掉什麼，比對症狀就能定位。
2. 順序跑錯 → 照正確順序，從壞掉的那個編號開始，把後面**所有**編號都重新
   跑一次到底（不是只跑漏掉的那一個）。
3. migration 本身寫錯（不是順序問題）→ 修正該 migration 檔案本身（如果還沒
   在其他環境跑過），或寫一個新編號的修正 migration（如果已經跑過，不能改
   歷史檔案）——不要就地在 SQL Editor 手動下一次性指令然後不留紀錄。
4. 真的資料結構已經壞到無法簡單修正（極端情況）→ 走 `docs/BACKUP.md` 的
   「Cara memulihkan」整套從最近一次每日備份復原。心理準備：Free 方案沒有
   point-in-time recovery，最多只能退回昨天 02:10 WIB 那次備份的時間點——這是
   docs/BACKUP.md 已經寫明的已知風險上限，不是這份文件能解決的。

## C. 單筆資料被誤刪/誤改

**不要做整站 rollback（A）也不要整庫還原（BACKUP.md）**——那樣會把同一段時間內
其他人存的、完全無關又正常的資料一起往回退。

正確處置：從最近一次每日備份的 `full.dump` 只挑那幾筆資料出來對照/複製回正式
庫，不是整份還原：

```bash
# 1. 建一個乾淨的暫時資料庫（本機或另一個空的 Postgres）
# 2. 只還原需要的表，不還原整份：
pg_restore --dbname="<暫時庫連線字串>" --no-owner --no-privileges \
  -t <table名稱> full.dump
# 3. 在暫時庫裡用 SQL 找出那幾筆正確的資料
# 4. 手動確認過內容之後，寫一個對應的 UPDATE/INSERT 貼到 Supabase SQL Editor
#    對正式庫執行——不是整表覆蓋，只改動那幾筆確認過的行。
```

跑在正式庫上的最後一步一定要**人親眼核對過**要改的是哪幾行、改成什麼值，
不要寫一個「where 條件太寬」的指令就直接執行。

## 每種情況都要有的證據

Rollback 做完不算結束——`FEATURES.md`/`LESSONS.md` 要補一筆：什麼時候發生、
分類是 A/B/C 哪一種、用了哪個指令退回、退回後怎麼驗證恢復正常。沒有這筆紀錄，
下次同樣的坑會重踩一次。

## 需要的權限（先確認手上有沒有）

| 動作 | 需要什麼 |
|---|---|
| `git push` 到 `main` | 對 `Jenzocch/sanci-partner-hub` 的寫入權限 |
| Vercel Dashboard 操作（Promote/Instant Rollback、看 build log） | 登入 Jenzo 的 team `wnsb-system` 帳號 |
| Supabase SQL Editor / 資料庫連線字串 | Session pooler 連線字串（`docs/BACKUP.md` 有格式說明），只有 owner 手上有 |

三項裡任何一項沒有，先去要，不要卡在原地猜。

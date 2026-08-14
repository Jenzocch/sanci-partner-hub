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
| 5 | Partner Logo | `NOT_STARTED` | #2, Storage | PNG/JPG/WebP；上傳前壓縮；Logo 失敗不拖垮 Partner 建立（§41） | 未驗證 |
| 6 | Branch Management (P-04/05) | `UNVERIFIED` | #2 | CRUD；Code unique = partner_id+code；地址必填（§14–15, 43–44） | Server Actions 寫完，本機 PG 測過建立+重複 code 拒絕；已部署，Jenzo 尚未在 production 點過 |
| 7 | Branch Status | `UNVERIFIED` | #6 | 四態；Suspend/Inactive 歷史不消失（§18） | 同上，Suspend/Reactivate 按鈕已做，未經 Jenzo 實測 |
| 8 | Branch Address | `UNVERIFIED` | #6 | 清楚顯示；mobile 用 multiline textarea（§17） | 表單已用 textarea；mobile 版面尚未跑過響應式測試 |
| 9 | Partner Staff (P-06) | `UNVERIFIED` | #6 | 分店只管自己 Staff；表單不出現 Branch 選擇（身份帶入）；Staff ≠ Login（§19–21, 45） | Admin 視角下 Branch 從頁面路徑帶入（非下拉選單），本機測過建立+指派；Jenzo 未實測。**Partner 使用者視角（/cabang 的 own-branch 限制）尚未實作**，目前只有 Admin 能管理 Staff |
| 10 | Staff Assignment History | `UNVERIFIED` | #9 | assignments 表含 start/end；調店不改寫歷史；離職=Deactivate（§22–23） | 本機測過：調店後歷史保留為 2 筆（1 ended+1 active），不是覆蓋。Jenzo 未實測 |
| 11 | Partner Login Users (P-07) | **`BLOCKED`** | Auth, #6 | 與 Staff 分離；SANCI Admin 建立/停用/復用（§24–27, 46） | **建立新帳號需要 Supabase service_role key，此環境未提供（刻意不給，見 LESSONS）。** Toggle 啟用/停用已做且不需要 service_role。畫面上已明確告知這個限制，不是假裝完成 |
| 12 | Partner / Branch Identity | `NOT_STARTED` | Auth | 登入即身份；不可自選 Branch；畫面永遠顯示 Partner+Branch+地址（§16, 26） | `/cabang` 目前只有身份卡 smoke-test，尚未接上真正的 own-branch 限定畫面（Staff 管理、Branch Profile 等） |
| 13 | Permission Scope (P-08) | `UNVERIFIED` | DB, Auth | OWN_BRANCH 預設／PARTNER_ALL_BRANCHES／預留 SELECTED_BRANCHES；僅 SANCI Admin 可改（§28, 31, 47） | Server Action 用 upsert（本機測過不會重複建列），表單已接上；Jenzo 未實測 |
| 14 | Cross-Branch Visibility | `NOT_STARTED` | #13 | View scope 依 policy 生效，Server/DB 層強制（§29–30, 33） | DB 層 RLS 已驗證（見前段 RLS 測試）；但 Partner 使用者視角的畫面（/cabang）尚未做，此規則目前只對 DB 直接查詢生效，UI 端待實作 |
| 15 | Cross-Branch Edit Permission | `NOT_STARTED` | #13 | View 與 Edit 分離（可看三店、只改自己）（§29–30） | 同上，DB 層驗證過，UI 端未做 |
| 16 | Audit Log | **`VERIFIED`**（寫入機制） | DB | 欄位含 before/after + server timestamp；append-only；動作清單 §66（§64–68） | DB trigger 自動寫入，本機測過所有 CRUD 動作都自動產生正確的 audit 記錄，不需手動呼叫。History 分頁（Partner/Branch）已接上讀取；Jenzo 未實際看過畫面 |
| 17 | Local Draft | `PROTOTYPE` | 前端 | 自動草稿；重進頁 Continue/Discard；草稿 > server > default；真寫入成功才清（§58） | 未驗證 |
| 18 | Weak Network Protection | `NOT_STARTED` | #17 | 離線不假成功（"Saved on this device" ≠ "Created"）；timeout 用 idempotency + server lookup（§59–61, 63） | 未驗證 |
| 19 | Duplicate Submission Protection | `NOT_STARTED` | DB | DB unique + idempotency key + 防連點（disable 不是唯一防線）（§62, 73） | 未驗證 |
| 20 | Responsive Desktop | `PROTOTYPE` | — | ≥1200 sidebar+滿版工作區；1920 不留巨大空白；字級規範（§50–51, 77） | 未驗證 |
| 21 | Responsive Tablet | `PROTOTYPE` | — | 768–1199 重排，非縮小版（§55） | 未驗證 |
| 22 | Responsive Mobile | `PROTOTYPE` | — | <768 單欄；輸入高 48–52px 字 ≥16px；360/390/430 無橫向捲動；inputmode 正確（§52–54, 76） | 未驗證 |

## 基礎設施前置（阻塞真實作的項目）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 技術選型 | **已定案** | Next.js + Supabase（Jenzo 2026-08-14 確認） |
| Supabase Project | 已建立 | `atmlfbjbcwzsrsqibhan.supabase.co`，anon key 已提供（2026-08-14）。⚠️ 本開發環境網路白名單擋 supabase.co——AI 無法直連驗證，需 Jenzo 在 Claude Code 環境設定加 `*.supabase.co` |
| DB Schema + RLS + Audit | **`VERIFIED`(production)** | `0001` 已在 production 執行成功，2026-08-14。Jenzo 回貼結果核對一致：TABLES 9 / RLS_ENABLED 9 / POLICIES 19 / TRIGGERS 12（與本機測試數字完全相符）。行為測試（14 項斷言）先前已在本機驗證過同一份 SQL |
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
- [ ] Jenzo 建立新 Supabase Project 並提供 URL + anon key（**阻塞真實作，唯一剩餘阻塞**）
- [x] Jenzo 定 UI 主語言 → Bahasa Indonesia（2026-08-14）
- [x] Prototype 驗收：Jenzo 確認 OK（2026-08-14；印尼文版待他再過目）
- [ ] 之後依 SPEC §90 順序實作（DB model → Auth → RLS → CRUD → … → Self audit）

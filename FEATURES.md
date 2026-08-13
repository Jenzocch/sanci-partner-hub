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
| 1 | Partner List (P-01) | `PROTOTYPE` | DB, Auth | 寬版表格＋搜尋＋篩選；Loading/Empty/Error 三態分明；API 失敗不顯示 "0 Partners"（§35–37） | 未驗證 |
| 2 | Create Partner (P-02) | `PROTOTYPE` | DB | 單獨建 Partner（不連帶 Branch/User）；建立後 DRAFT；重名軟警告；Code 走 DB unique（§38–40） | 未驗證 |
| 3 | Edit Partner | `PROTOTYPE` | #2 | ACTIVE 時 Code 鎖定；internal ID 永不可改（§10） | 未驗證 |
| 4 | Partner Status | `PROTOTYPE` | #2 | DRAFT/ACTIVE/SUSPENDED/INACTIVE；Activate 五條件缺一不可（§11–12） | 未驗證 |
| 5 | Partner Logo | `NOT_STARTED` | #2, Storage | PNG/JPG/WebP；上傳前壓縮；Logo 失敗不拖垮 Partner 建立（§41） | 未驗證 |
| 6 | Branch Management (P-04/05) | `PROTOTYPE` | #2 | CRUD；Code unique = partner_id+code；地址必填（§14–15, 43–44） | 未驗證 |
| 7 | Branch Status | `PROTOTYPE` | #6 | 四態；Suspend/Inactive 歷史不消失（§18） | 未驗證 |
| 8 | Branch Address | `PROTOTYPE` | #6 | 清楚顯示；mobile 用 multiline textarea（§17） | 未驗證 |
| 9 | Partner Staff (P-06) | `PROTOTYPE` | #6 | 分店只管自己 Staff；表單不出現 Branch 選擇（身份帶入）；Staff ≠ Login（§19–21, 45） | 未驗證 |
| 10 | Staff Assignment History | `PROTOTYPE` | #9 | assignments 表含 start/end；調店不改寫歷史；離職=Deactivate（§22–23） | 未驗證 |
| 11 | Partner Login Users (P-07) | `PROTOTYPE` | Auth, #6 | 與 Staff 分離；SANCI Admin 建立/停用/復用（§24–27, 46） | 未驗證 |
| 12 | Partner / Branch Identity | `PROTOTYPE` | Auth | 登入即身份；不可自選 Branch；畫面永遠顯示 Partner+Branch+地址（§16, 26） | 未驗證 |
| 13 | Permission Scope (P-08) | `PROTOTYPE` | DB, Auth | OWN_BRANCH 預設／PARTNER_ALL_BRANCHES／預留 SELECTED_BRANCHES；僅 SANCI Admin 可改（§28, 31, 47） | 未驗證 |
| 14 | Cross-Branch Visibility | `PROTOTYPE` | #13 | View scope 依 policy 生效，Server/DB 層強制（§29–30, 33） | 未驗證 |
| 15 | Cross-Branch Edit Permission | `PROTOTYPE` | #13 | View 與 Edit 分離（可看三店、只改自己）（§29–30） | 未驗證 |
| 16 | Audit Log | `PROTOTYPE` | DB | 欄位含 before/after + server timestamp；append-only；動作清單 §66（§64–68） | 未驗證 |
| 17 | Local Draft | `PROTOTYPE` | 前端 | 自動草稿；重進頁 Continue/Discard；草稿 > server > default；真寫入成功才清（§58） | 未驗證 |
| 18 | Weak Network Protection | `NOT_STARTED` | #17 | 離線不假成功（"Saved on this device" ≠ "Created"）；timeout 用 idempotency + server lookup（§59–61, 63） | 未驗證 |
| 19 | Duplicate Submission Protection | `NOT_STARTED` | DB | DB unique + idempotency key + 防連點（disable 不是唯一防線）（§62, 73） | 未驗證 |
| 20 | Responsive Desktop | `PROTOTYPE` | — | ≥1200 sidebar+滿版工作區；1920 不留巨大空白；字級規範（§50–51, 77） | 未驗證 |
| 21 | Responsive Tablet | `PROTOTYPE` | — | 768–1199 重排，非縮小版（§55） | 未驗證 |
| 22 | Responsive Mobile | `PROTOTYPE` | — | <768 單欄；輸入高 48–52px 字 ≥16px；360/390/430 無橫向捲動；inputmode 正確（§52–54, 76） | 未驗證 |

## 基礎設施前置（阻塞真實作的項目）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 技術選型 | 提案中 | 建議 Next.js + Supabase（多角色+RLS+PWA，同 FAMMS/FQMS/Denikin 模式）；待 Jenzo 確認 |
| Supabase Project | **BLOCKED** | 尚未配置。SPEC §92：不得偷用其他既有 project，需要新 project/credentials |
| Auth | `NOT_STARTED` | 依賴 Supabase |
| Deployment | **NOT DEPLOYED** | SPEC §98：目前不部署 |
| UI 主語言 | 待定 | SPEC §86 單一主語言先行；prototype 暫用英文（SPEC 畫面範例語言），待 Jenzo 定案 |

## 已知刻意保留的「怪東西」

（看起來沒用但不能刪的東西記在這裡，免得被清掉）

| 位置 | 為什麼保留 |
|---|---|
| `prototype/` | 可點擊 UI prototype（假資料）。真系統上線後仍保留作為 UI 規格參照，除非 Jenzo 說刪 |

## 待辦

- [ ] Jenzo 確認技術選型（Next.js + Supabase？）
- [ ] Jenzo 建立新 Supabase Project 並提供 URL + anon key（**阻塞真實作**）
- [ ] Jenzo 定 UI 主語言（英文／Bahasa Indonesia）
- [ ] Prototype 驗收：Jenzo 點過一遍說 OK 不 OK
- [ ] 之後依 SPEC §90 順序實作（DB model → Auth → RLS → CRUD → … → Self audit）

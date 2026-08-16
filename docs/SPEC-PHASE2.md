# SANCI Partner Hub — Phase 2 Spec
## Customer & Partner Order Module（客戶快速建檔＋合作夥伴訂單）

Version: 1.0
Project: SANCI Partner Hub
Phase: Phase 2
Dependency: Phase 1 Partner Module
Status: 2026-08-16 由 Jenzo 提供，記錄為 Phase 2 完整範圍規劃。**不代表已全部實作**——實際開發進度見 `FEATURES.md`。首個開發切片（MVP）範圍另見 `FEATURES.md` Phase 2 章節，只涵蓋本文件的子集，其餘章節留做後續切片的依據。

> 本文件是 Phase 2 的完整願景與細節規格（106 節），比照 `docs/SPEC-PHASE1.md` 的地位。修改 Phase 2 任何程式碼前，先讀本檔對應章節 + `FEATURES.md` + `LESSONS.md`。

---

# 0. Phase 2 核心目標

Phase 2 解決一件最重要的事情：

> Golden Home 等合作店家，可以非常快速地建立客戶資料與套裝訂單，SANCI 可以立即知道這是哪個 Partner、哪個 Branch、哪個 Sales/PIC 帶來的客戶。

這不是完整 POS。

這不是 SANCI Inventory System。

這不是會計系統。

這個 Phase 的核心是：

Partner
→ Branch
→ Customer
→ Partner Order
→ Package Information
→ Partner Sales / PIC
→ SANCI 可查看
→ 歸屬保護
→ 歷史紀錄

---

# 1. 商業背景

Golden Home 是 SANCI 的合作家具店。

例如：

Golden Home Cirebon 的客戶：

Budi Santoso

在 Golden Home 購買：

Package A

這個 Package 裡有部分家具需要到 SANCI 挑選。

Golden Home 建立資料後：

Golden Home Cirebon
↓
建立 Customer
↓
建立 Partner Order
↓
SANCI 立即看到
↓
未來 Customer 到 SANCI
↓
SANCI 知道這是 Golden Home Cirebon 的客戶

最重要原則：

> 客戶到 SANCI 不代表客戶變成 SANCI Direct Customer。

Partner Attribution 必須保留。

---

# 2. Phase 2 Scope

本 Phase 包含：

1. Customer Quick Create
2. Customer Search
3. Phone / WhatsApp Search
4. Duplicate Customer Detection
5. Customer Detail
6. Customer Edit
7. Partner Order Create
8. Partner Order Edit
9. Partner Order Status
10. Package Information
11. Partner Sales Assignment
12. Partner PIC / Reception Assignment
13. Partner / Branch Attribution
14. SANCI Order Visibility
15. Same-Partner Cross-Branch Visibility
16. Same-Partner Cross-Branch Edit Permission
17. Customer / Order Audit History
18. Cancel Order
19. Search / Filter
20. Mobile / Tablet / Desktop Responsive
21. Local Draft
22. Weak Network Protection
23. Duplicate Submission Protection

---

# 3. Phase 2 不做

本 Phase 暫時不要做：

- SANCI Product Selection
- Product Master
- Upgrade Product
- Add-on Product
- Inventory
- Stock Deduction
- Warehouse Picking
- Delivery
- Payment
- Golden Home 收款系統
- Accounting
- Commission Calculation
- POS
- Invoice
- WhatsApp API
- GPS
- BI Dashboard

這些後續 Phase 再做。

---

# 4. 非常重要：客戶建檔必須快

Golden Home 店員是在門市現場使用。

不能要求他填 20 個欄位才能建立客戶。

Phase 2 的 UX 核心：

> Quick Customer Registration

目標：

一般正常情況下，手機可以在很短時間內完成。

第一步只要求真正必要資料。

---

# 5. 建議最短建立流程

Mobile：

Phone / WhatsApp
↓
自動搜尋是否已有 Customer
↓
Customer Name
↓
Package
↓
Sales Person
↓
PIC（Optional）
↓
Save

例如：

Customer Phone *

[ 0812 3456 7890 ]

Customer Name *

[ Budi Santoso ]

Package *

[ Package A ▼ ]

Sales Person *

[ Andi Setiawan ▼ ]

PIC

[ Siti Amelia ▼ ]

[ Create Order ]

不要要求第一步就填：

- 完整配送地址
- Email
- Birthday
- Identity Number
- Delivery Notes
- Warehouse Notes
- Product Details

這些不是建立 Partner Order 的必要條件。

---

# 6. Customer 與 Order 必須分開

不要把 Customer 和 Order 做成同一張資料表。

正確：

Customer
↓
可以有多張 Order

例如：

Budi Santoso

2026
→ Golden Home Package A

2027
→ Golden Home Package B

未來甚至可能：

2028
→ SANCI Direct Order

所以：

Customer Identity

與：

Order Attribution

不能混在一起。

---

# 7. Customer Data Model

建議：

customers

Fields：

id

full_name

phone

whatsapp

address
nullable

city
nullable

province
nullable

notes
nullable

created_at

updated_at

created_by

---

# 8. Customer Phone Normalization

印尼電話格式可能輸入：

08123456789

8123456789

+628123456789

62 812 3456 789

系統不能把這些全部當不同人。

需要：

phone_normalized

例如統一：

628123456789

原始輸入可以另外保留。

---

# 9. 電話不是絕對 Customer ID

電話非常適合：

Search

Duplicate Warning

但不要把 phone 當 Primary Key。

原因：

- 家人可能共用電話
- 電話可能換號
- 同一電話可能代表夫妻
- 店員可能輸錯

所以：

customer.id

才是真正 Identity。

---

# 10. Customer Duplicate Detection

店員輸入：

08123456789

系統 Normalize 後搜尋：

628123456789

如果找到：

Budi Santoso

不要直接建立第二個。

顯示：

Possible existing customer

Budi Santoso
0812 3456 789

Existing Orders:
1

[ Use Existing Customer ]

[ Create New Anyway ]

如果建立新的：

建議要求：

Reason

例如：

Different family member

Wrong old record

Other

---

# 11. 不要自動 Merge Customer

Duplicate Detection 只是提醒。

不要因為：

Phone 一樣

就自動 Merge。

Merge Customer 是高風險操作。

Phase 2 暫時不做自動 Merge。

---

# 12. Customer Ownership 與 Order Ownership 要分開

這是非常重要的商業邏輯。

Customer 本身不應簡單被永久標成：

Golden Home Customer

因為同一個人可能不同時間產生不同商業關係。

真正的 Partner Attribution 應主要放在：

Order

例如：

Customer:
Budi Santoso

Order 2025:
SANCI Direct

Order 2026:
Golden Home Cirebon

Order 2027:
Golden Home Bandung

因此：

> Customer Identity 是人。

> Order Attribution 才是這一次交易屬於誰。

---

# 13. Partner Order

建議 Table：

partner_orders

Fields：

id

order_number

customer_id

partner_id

branch_id

partner_sales_staff_id
nullable

partner_pic_staff_id
nullable

package_name

package_reference
nullable

status

notes
nullable

created_by

created_at

updated_at

cancelled_at
nullable

cancelled_by
nullable

cancellation_reason
nullable

---

# 14. Partner Attribution

Partner Order 建立時：

partner_id

branch_id

必須從登入身份自動取得。

例如：

Siti 登入：

Partner:
Golden Home

Branch:
Cirebon

建立 Order。

系統自動：

partner_id = Golden Home

branch_id = Cirebon

不要讓普通 Branch User 在 Form 裡自行選：

Partner ▼
Branch ▼

否則很容易建錯歸屬。

---

# 15. Partner / Branch Attribution 不可普通修改

Order 建立後：

Golden Home Cirebon User

不能把：

Golden Home Cirebon

改成：

Golden Home Bandung

更不能改成：

Partner B

Attribution 是保護合作關係的核心資料。

---

# 16. Attribution Correction

如果真的建錯 Branch：

不要讓普通使用者直接 Edit。

需要：

SANCI Admin / Authorized Manager

使用：

Correct Attribution

並要求：

Reason

Audit 記：

Before

After

Changed By

Reason

Timestamp

---

# 17. Order Number

系統產生唯一 Order Number。

例如：

GH-CBR-260816-0012

只是 Display / Human Reference。

真正 Database Identity：

order.id

Order Number 不作 Primary Key。

---

# 18. Order Number 不能靠 Client 自己產生

避免兩台手機同時：

GH-CBR-260816-0012

Server 必須負責產生或保證唯一性。

Database 必須有 Unique Constraint。

---

# 19. Package

目前 Phase 2 不設定價格。

重要：

> 系統現在只需要知道客戶買的是哪個 Package。

例如：

Package A

Package B

Package Wedding

Package Premium

目前：

不要建立付款價格邏輯。

不要建立 SANCI 收款。

---

# 20. 收款原則

已確認商業規則：

> Golden Home 客戶的收款完全由 Golden Home 處理。

SANCI Partner Hub Phase 2 不處理：

Payment

Payment Status

Invoice

Golden 收款金額

除非未來另外確認。

---

# 21. Package 資料策略

Phase 2 可以先建立簡單：

partner_packages

Fields：

id
partner_id
name
code
description
status
created_at
updated_at

例如：

Golden Home:

Package A
Package B
Package Premium

Partner B 可以有：

Package A

兩者不是同一個 Package。

---

# 22. Package 屬於 Partner

Unique 建議：

partner_id + package_code

不要全系統只用：

Package A

辨識。

---

# 23. Phase 2 Package 不處理產品明細

現在 Package 只需要：

名稱

Code

基本描述

狀態

不要現在做：

Package Product Components

因為產品選品會在下一 Phase。

---

# 24. Partner Staff Selection

建立 Order 時：

Sales Person

必須從：

目前 Branch Active Staff

選擇。

不要手打姓名。

例如：

Sales Person

[ Andi Setiawan ▼ ]

PIC

[ Siti Amelia ▼ ]

---

# 25. Staff List

Sales Person：

優先顯示 Role = Sales

PIC：

優先顯示：

Reception / CS
Manager

但系統不要過度寫死。

如果 Staff 有合理 Role，可以被選擇。

---

# 26. Staff 離職後

歷史 Order：

Sales:
Andi Setiawan
Inactive

仍然顯示。

新 Order：

Dropdown 不再顯示 Inactive Staff。

---

# 27. Staff Assignment Historical Integrity

如果 Andi 後來：

Cirebon
→ Bandung

2026 的 Order 仍必須顯示：

Golden Home Cirebon
Sales: Andi

不能因 Staff 調店改寫歷史。

---

# 28. Customer Create UI — Mobile

手機優先。

例如：

New Customer Order

Customer

WhatsApp / Phone *

[ 0812 3456 7890 ]

系統輸入後搜尋。

如果沒有：

No existing customer found.

Full Name *

[ Budi Santoso ]

────────────────

Order

Package *

[ Package A ▼ ]

Sales Person *

[ Andi Setiawan ▼ ]

PIC

[ Siti Amelia ▼ ]

Notes

[ Optional... ]

[ Create Customer & Order ]

---

# 29. Existing Customer Flow

如果電話找到 Customer：

Customer found

Budi Santoso
0812 3456 7890

[ Use This Customer ]

按下後：

不重新建立 Customer。

直接：

Create New Partner Order

---

# 30. 客戶只有資料沒有訂單

必須支援。

因為已確認有時 Golden Home：

> 可能只是先填客人資料而已。

所以需要兩種入口：

+ New Customer

以及：

+ New Customer & Order

不能強迫每個 Customer 一定有 Order。

---

# 31. Quick Customer Only

例如：

New Customer

Phone *

Name *

Sales Person
optional

Note
optional

[ Save Customer ]

之後 Customer Detail：

[ + Create Order ]

---

# 32. Customer Source Metadata

如果 Customer 是由 Golden Home Cirebon 第一次建立：

可以記：

created_via_partner_id

created_via_branch_id

作為來源紀錄。

但：

這不等於永久 Customer Ownership。

真正業績 / 訂單歸屬仍以 Order 為準。

---

# 33. Customer Edit

Branch 可以修改自己有權限管理的 Customer：

Name

Phone

WhatsApp

Address

Notes

但每次重要修改留下 Audit。

---

# 34. Customer Edit 權限

如果 Customer 同時有多個 Partner / Branch 的歷史關係：

不要簡單允許任何一家 Partner 修改所有 Global Customer Data。

Phase 2 建議：

Partner User 可以修改：

由自己 Branch 建立且目前沒有 Ownership Conflict 的 Customer 基本資料。

如果 Customer 已被多 Branch / Partner 共用：

敏感 Identity 修改需要更嚴格處理。

至少：

Phone Change

應留下完整 Audit。

---

# 35. Customer Phone Change

例如：

0812...
→
0857...

Audit：

CUSTOMER_PHONE_CHANGED

Before:
62812...

After:
62857...

Actor:
Siti

Branch:
Golden Home Cirebon

Server Time

---

# 36. Order Edit

Branch 可以編輯自己的 Order：

Package

Sales Person

PIC

Notes

Customer Contact Data

在尚未進入後續 SANCI Fulfillment Phase 前相對自由。

---

# 37. Order Attribution 不在普通 Edit 裡

普通 Edit Order 不顯示：

Partner

Branch

可編輯 Select。

只顯示：

Partner
Golden Home

Branch
Cirebon

Locked

---

# 38. Order Status

Phase 2 先保持簡單。

建議：

DRAFT

REGISTERED

CANCELLED

未來 Phase 3 再增加：

WAITING_CUSTOMER

ARRIVED

SELECTING

SELECTION_CONFIRMED

等。

不要現在提前把完整配送流程塞進 Phase 2。

---

# 39. Draft Order

使用者正在建立但尚未正式提交：

Local Draft

或 Server Draft（如果架構需要）。

Draft 不算正式業務紀錄。

---

# 40. Registered

代表：

Golden Home 已正式將這個 Customer / Order 登記進 Partner Hub。

SANCI 可以看到。

---

# 41. Cancel Order

Partner Branch 可以取消自己的 Order。

不要直接 Delete。

需要：

Cancel Order

Reason *

例如：

Customer cancelled purchase

Wrong order

Duplicate order

Other

---

# 42. Cancelled Order

Cancelled Order：

仍然存在。

仍然可搜尋。

仍然有 Audit。

顯示：

CANCELLED

---

# 43. Hard Delete Order

Phase 2 原則：

正式 Registered Order 不允許 Hard Delete。

如果只是 Local Draft：

可以刪。

如果是尚未提交的 Server Draft：

可依實作安全刪除。

正式 Registered：

Cancel only。

---

# 44. SANCI View

SANCI 可以看到所有 Partner Orders。

例如 Desktop：

Partner Orders

Search...

Partner      Branch      Customer       Package       Sales       Status

Golden Home Cirebon     Budi Santoso   Package A     Andi        REGISTERED

Golden Home Bandung     Siti Rahma     Package B     Rudi        REGISTERED

Partner B    Semarang   Agus           Package X     Dewi        REGISTERED

---

# 45. SANCI Search

SANCI 可以搜尋：

Customer Name

Phone

WhatsApp

Order Number

Partner

Branch

Sales Person

Package

---

# 46. Partner Search

Partner Branch 可以搜尋：

Customer Name

Phone

Order Number

Package

Sales

但搜尋結果必須遵守 Permission Scope。

Search API 不能因為搜尋而繞過 RLS。

---

# 47. Same Partner Visibility

沿用 Phase 1 Permission。

例如：

Golden Home：

Visibility:
PARTNER_ALL_BRANCHES

Edit:
OWN_BRANCH

Golden Cirebon：

可以看到 Bandung Order。

但不能 Edit Bandung Order。

---

# 48. Cross Branch UI

如果 Cirebon 查看 Bandung：

畫面必須清楚標：

Golden Home
Bandung Branch

READ ONLY

不能讓使用者以為是自己的 Order。

---

# 49. Own Branch Order

自己的 Order：

Golden Home
Cirebon Branch

可以：

Edit

Cancel

依權限執行。

---

# 50. SANCI 不搶客戶的 UI 保護

SANCI 打開 Partner Order 時：

Partner Attribution 必須非常明顯。

例如：

PARTNER CUSTOMER

Golden Home
Cirebon Branch

Partner Sales:
Andi Setiawan

Partner PIC:
Siti Amelia

Customer:
Budi Santoso

Package:
Package A

不要把 Partner Attribution 藏在頁面最下面。

---

# 51. Attribution Badge

可以使用：

Partner Customer

或：

Partner Order

視覺 Badge。

但不要用會讓使用者誤解為「SANCI 已付款 / 已成交」的狀態。

---

# 52. Customer Detail

例如：

Budi Santoso

0812 3456 7890

Address:
...

Customer History

16 Aug 2026
Golden Home — Cirebon
Package A
REGISTERED

未來可以再加入其他歷史。

---

# 53. Customer History

這裡非常重要：

不要只顯示「目前最新 Order」。

要能看到歷史。

例如：

2025
SANCI Direct
（未來）

2026
Golden Home Cirebon
Package A

2027
Golden Home Bandung
Package B

這就是為什麼：

Customer ≠ Partner Ownership。

---

# 54. Order Detail — Mobile

手機：

Order
GH-CBR-260816-0012

PARTNER ORDER

Golden Home
Cirebon Branch

Customer
Budi Santoso

WhatsApp
0812...

Package
Package A

Sales
Andi Setiawan

PIC
Siti Amelia

Status
REGISTERED

[ Edit Order ]

[ Cancel Order ]

Activity
→

---

# 55. Order Detail — Desktop

充分利用橫向空間。

左：

Customer

中：

Order

右：

Partner Attribution / Staff

下面：

Activity Timeline

不要全部塞成一條窄欄。

---

# 56. Partner Dashboard Phase 2

Partner 手機首頁現在可以開始加入：

Customers

Orders

例如：

Golden Home × SANCI

Cirebon Branch

[ + New Customer ]

[ + New Order ]

Customers
128

Active Orders
24

Recent Orders
...

不要加入：

Revenue

因為 Phase 2 沒有價格。

---

# 57. SANCI Dashboard Phase 2

可以增加簡單 operational counts：

New Partner Orders

Partners

Branches

Registered Orders

Cancelled

不要現在做複雜 BI。

---

# 58. No Price

Phase 2 明確：

不要設定產品價格。

不要設定 Package Price。

不要設定付款金額。

未來 Add-on / Upgrade：

只需要知道它屬於 Golden Home 業績。

價格與結算另行規劃。

---

# 59. Future Add-on Attribution

雖然 Phase 2 不實作 Add-on，但 Order 必須有穩定：

partner_id

branch_id

未來 Add-on 可以繼承：

attribution_partner_id

attribution_branch_id

例如：

Golden Home Cirebon 客戶到 SANCI 多買 Sofa。

未來仍可算：

Golden Home Cirebon Attribution。

---

# 60. Future Customer Arrival

Phase 3 會加入：

Customer Arrived

所以 Phase 2 Order ID 必須能讓 SANCI Showroom 快速搜尋。

未來可以：

Search Order Number

Search Phone

QR Code

但 Phase 2 不一定要做 QR。

---

# 61. Audit Log — Customer

至少：

CUSTOMER_CREATED

CUSTOMER_UPDATED

CUSTOMER_PHONE_CHANGED

CUSTOMER_ADDRESS_CHANGED

CUSTOMER_DUPLICATE_OVERRIDE

---

# 62. Audit Log — Order

至少：

ORDER_CREATED

ORDER_UPDATED

ORDER_PACKAGE_CHANGED

ORDER_SALES_CHANGED

ORDER_PIC_CHANGED

ORDER_CANCELLED

ORDER_ATTRIBUTION_CORRECTED

---

# 63. Audit Before / After

例如：

ORDER_PACKAGE_CHANGED

Before:
Package A

After:
Package B

Actor:
Siti Amelia

Partner:
Golden Home

Branch:
Cirebon

Server Timestamp

---

# 64. Attribution Correction Audit

必須特別完整：

Before Partner

Before Branch

After Partner

After Branch

Reason

Actor

Server Time

這是未來處理合作爭議的重要證據。

---

# 65. Offline Quick Entry

Golden Home 可能使用手機網路。

因此 New Customer / New Order Form 必須有：

Auto Local Draft

使用者輸入：

Phone
Name
Package

突然斷網。

資料不能消失。

---

# 66. Offline Submit

正式 Registered Order 是重要業務資料。

Phase 2 建議：

Offline 可以：

Save Local Draft

但不要直接顯示：

Registered

網路恢復後：

Submit

Server 確認後才：

REGISTERED

---

# 67. Optional Pending Queue

如果開發者認為 UX 需要：

可以設計：

PENDING_SYNC

但必須非常清楚：

Pending Sync
≠
Registered

SANCI 還沒收到時：

不能讓 Golden Home 誤以為 SANCI 已收到。

---

# 68. Server Confirmation

Create Customer / Order 成功後：

必須重新取得 Server Record。

至少確認：

customer_id

order_id

order_number

partner_id

branch_id

status

不能只靠：

POST returned 200

就宣稱完成。

---

# 69. Duplicate Submission

例如店員按：

Create Order

網路慢。

連按。

必須：

Button disable

+
idempotency key

+
DB constraint / transaction design

避免兩張一樣的 Order。

---

# 70. Customer + Order Atomicity

Quick Create：

Create Customer & Order

需要仔細處理。

如果：

Customer 成功

Order 失敗

不能讓 UI 說：

全部成功。

建議使用 transaction / server function。

或者：

明確處理 partial state。

最理想：

Customer + Order Quick Create

由 Server Transaction 管理。

---

# 71. Existing Customer + New Order

如果 Customer 已存在：

不要重新 INSERT Customer。

只建立：

Order。

---

# 72. Customer Only Create

Customer Only 不需要 transaction with Order。

Server 成功後：

Customer Detail

提供：

+ Create Order

---

# 73. Local Draft Key

Local Draft 必須綁：

user

partner

branch

form type

避免：

Cirebon User 登出

Bandung User 登入同一手機

看到 Cirebon 未提交 Draft。

這是 P1 Privacy / Data Isolation。

---

# 74. Logout

如果裝置有 Local Draft：

Logout 時不要直接刪。

但下個帳號不得看到。

Draft 必須隔離。

---

# 75. Search Performance

Phone Search 很常用。

Database 應針對：

phone_normalized

建立適當 Index。

Order Number：

Unique Index。

Partner / Branch：

Index。

不要等資料幾萬筆才處理。

---

# 76. Pagination

Customer / Order List 不要一次抓全部。

使用：

pagination

或：

cursor / infinite load

視現有 framework 決定。

Search 結果也要限制。

---

# 77. Mobile Customer List

例如：

Customers

[ Search name / phone... ]

+ New Customer

Budi Santoso
0812 3456 7890
Golden Home · Cirebon
2 Orders
                     →

Siti Rahma
0857...
Golden Home · Cirebon
1 Order
                     →

不要用 Desktop Table 縮小。

---

# 78. Mobile Order List

Orders

[ Search customer / order... ]

[ Status ▾ ]

GH-CBR-260816-0012
Budi Santoso

Package A

Sales
Andi

REGISTERED

                     →

---

# 79. Desktop Customer List

Desktop 可以用寬 Table：

CUSTOMER

PHONE

LAST ORDER

PARTNER / BRANCH

SALES

UPDATED

充分利用橫向空間。

Primary font ≥ 16px。

---

# 80. Desktop Order List

ORDER

CUSTOMER

PARTNER

BRANCH

PACKAGE

SALES

STATUS

UPDATED

不要用 12px 密集 ERP 字體。

---

# 81. Search UX

Search 是一級功能。

Desktop：

寬 Search Input。

Mobile：

頁面上方直接顯示 Search。

不要把搜尋藏進：

🔍 icon

還要多點一次。

---

# 82. Phone Quick Search UX

New Customer Form：

Phone 欄位輸入到足夠長度後：

debounced search

不要每打一個數字就 request Server。

例如：

等待短暫停頓後搜尋。

---

# 83. Search Loading

Phone Search 時：

顯示：

Checking existing customers...

不要讓使用者不知道系統有沒有在查。

---

# 84. Search Failure

如果 Duplicate Search API 失敗：

不能顯示：

No customer found.

必須：

Could not check existing customers.

Retry

這是非常重要的防重複措施。

---

# 85. Customer Name

不要強制：

First Name
Last Name

印尼使用者姓名不一定適合西式 First/Last Name。

使用：

Full Name

---

# 86. Address

Customer Address Phase 2：

Optional。

因為現在重點是快速登記。

未來進 Delivery 前：

可以要求補完整地址。

---

# 87. Notes

Notes 不要塞所有東西。

Phase 2 可以：

Customer Note

Order Note

分開。

不要一個 Notes 欄位同時存：

客戶偏好

訂單資訊

配送問題

內部備註

未來會亂。

---

# 88. Shared / Internal Notes

Phase 2 可以先預留：

note_visibility

但如果時間有限：

先做簡單 Order Note。

下一 Phase 再正式拆：

Partner Shared Note

SANCI Internal Note

不要為了預留而過度設計 UI。

---

# 89. Permission Test — Customer

Golden Cirebon：

OWN_BRANCH

搜尋 Bandung Customer。

Expected：

不得取得未授權資料。

---

# 90. Permission Test — Order

Golden Cirebon：

Same Partner View Only

讀 Bandung Order：

Allowed

修改 Bandung Order：

Denied

Cancel Bandung Order：

Denied

---

# 91. Permission Test — Partner Boundary

Golden Home User：

搜尋 Partner B Customer Phone。

Expected：

不得洩漏 Partner B relationship / Order Data。

Global Customer Identity 如何處理必須避免跨 Partner 洩漏。

---

# 92. Duplicate Detection Privacy

這點非常重要。

假設：

Partner B 已經有：

Budi
0812...

Golden Home 搜尋：

0812...

系統不能直接告訴 Golden Home：

「這是 Partner B 的客戶。」

這會洩漏其他 Partner 資料。

可以顯示較中性的：

Possible existing customer record found.

並依安全規則處理。

SANCI Admin 可以看到完整歷史。

Partner User 只能看到有權限的 relationship。

---

# 93. Customer Global Identity Security

如果採 Global Customer Table：

Partner User 不應直接 unrestricted SELECT customers。

必須透過：

authorized relationship

或安全 Server Function / View

限制可取得欄位與資料。

這是 Phase 2 P0 Security。

---

# 94. SANCI Admin

SANCI 可以：

View all customers

View all partner orders

Search across partners

Correct attribution（授權角色）

View audit

但高風險修改仍必須 Audit。

---

# 95. Partner Cannot Change Audit

任何 Partner User：

不能：

Edit Audit

Delete Audit

---

# 96. Cancel Confirmation

Cancel Order：

不要一按就取消。

Bottom Sheet / Dialog：

Cancel Order?

Order:
GH-CBR-260816-0012

Customer:
Budi Santoso

Reason *

[ Keep Order ]

[ Cancel Order ]

---

# 97. Cancelled Orders Search

Cancelled 不能從一般 Search 消失。

Filter：

All

Registered

Cancelled

---

# 98. History

Customer Detail：

History

Order Detail：

Activity

兩者用途不同。

Customer History：

這個人過去有哪些 Order relationship。

Order Activity：

這張 Order 發生過什麼修改。

---

# 99. Backup

Phase 2 開始已經有正式 Customer / Order Business Data。

因此正式上線前必須確認：

Database Backup Strategy

但：

如果目前 Supabase Plan / Project 尚未確認，

不要宣稱已經有自動 Backup。

必須標：

NOT VERIFIED

直到實際驗證。

---

# 100. Export

Phase 2 可以先預留。

如果實作成本合理：

SANCI Admin 可以 Export：

Customer / Partner Orders

CSV

但 Export 不是 P0。

如果時間不足：

放後續。

Partner Export 必須遵守 Permission Scope。

---

# 101. Phase 2 Database Tables

新增建議：

customers

partner_packages

partner_orders

視架構可能需要：

customer_partner_relationships

order_events

或使用統一 audit_logs。

不要建立 Product / Inventory Tables。

---

# 102. Existing Phase 1 Tables

必須沿用：

partners

partner_branches

partner_staff

partner_staff_assignments

partner_users

partner_access_policies

partner_branch_access_rules

audit_logs

不要建立第二套 Partner / Branch Table。

---

# 103. Migration Safety

新增 Migration 前：

先檢查現有 Schema。

不要假設 Phase 1 Table 名稱完全符合本文件。

如果實際 Repo 已有合理架構：

優先延伸。

不要為了符合文件字面名稱破壞既有功能。

---

# 104. FEATURES.md

Phase 2 開始前更新 FEATURES.md。

加入：

Customer Quick Create

Customer Only Create

Customer Search

Phone Normalization

Duplicate Detection

Customer Detail

Customer Edit

Partner Package

Partner Order Create

Partner Order Edit

Order Attribution

Staff Assignment

Order Cancel

Order Search

Customer History

Order Activity

Offline Draft

Weak Network

Permission Tests

Responsive Tests

---

# 105. LESSONS.md

如果 Phase 2 開發過程發現新的：

Race Condition

Permission Bug

Offline Bug

Duplicate Bug

RLS Bug

Form Draft Bug

才加入 LESSONS.md。

不要把普通開發日誌全部塞進 LESSONS。

---

# 106. Phase 2 Implementation Order

依序：

1. Audit Phase 1 current state

2. Verify FEATURES.md

3. Verify LESSONS.md

4. Verify Partner / Branch schema

5. Verify Auth / RLS

6. Design Customer identity security

7. Customer schema

8. Phone normalization

9. Customer permission

10. Customer quick create

11. Duplicate detection

12. Customer search

13. Partner Package

14. Partner Order schema

15. Order attribution

16. Order create

17. Order edit

18. Staff / PIC assignment

19. Cancel Order

20. SANCI Order View

21. Partner Order View

22. Cross Branch permission

23. Audit

24. Local Draft

25. Weak Network

26. Responsive

27. Tests

28. Security Tests

29. Self Audit

30. Independent Verification

---

# 107. P0 Audit Checklist

必須測：

## Cross Partner Leak

Golden Home

不能看到：

Partner B Order Data。

---

## Cross Branch Unauthorized Write

Golden Cirebon View Only

不能修改：

Golden Bandung Order。

---

## Attribution Tampering

Partner User 不能修改：

partner_id

branch_id

---

## Customer Global Identity Leak

Partner A 不得因為電話搜尋取得 Partner B 的敏感 relationship。

---

## Auth Bypass

直接 API request 也必須拒絕。

---

## Secret Exposure

Browser bundle 不得有：

service_role

private secret

---

# 108. P1 Audit Checklist

測：

Duplicate Customer

Duplicate Order

Double Submit

Timeout after Server Commit

Local Draft Lost

Local Draft Cross User Leak

Incorrect Staff Assignment

Inactive Staff selectable

Cancelled Order disappearing

Audit Missing

Phone normalization failure

Server Error shown as Empty State

---

# 109. P2 Audit Checklist

測：

Mobile 360px

Mobile 390px

Mobile 430px

Tablet

Desktop 1366

Desktop 1440

Desktop 1920

Search visibility

Input size

Typography

Touch target

Desktop space utilization

---

# 110. 完成定義

Phase 2 不能因為 UI 可以新增 Customer 就算完成。

至少：

Customer Create ✓

Customer Only ✓

Existing Customer Reuse ✓

Duplicate Detection ✓

Phone Normalization ✓

Partner Order ✓

Correct Attribution ✓

Staff Assignment ✓

Order Edit ✓

Cancel ✓

SANCI View ✓

Partner View ✓

Cross Branch Permission ✓

Cross Partner Isolation ✓

Audit ✓

Local Draft ✓

Weak Network ✓

Responsive ✓

Independent Verification ✓

---

# 111. 商業驗收情境 A

Golden Home Cirebon 的 Siti 登入。

輸入：

08123456789

沒有 Customer。

建立：

Budi Santoso

Package A

Sales:
Andi

PIC:
Siti

Expected：

Customer 建立一次。

Order 建立一次。

Order Attribution：

Golden Home
Cirebon

SANCI 可以立即查到。

---

# 112. 商業驗收情境 B

同一 Budi 第二次來。

輸入相同電話。

Expected：

系統提示 Existing Customer。

使用：

Budi Santoso

建立新的 Order。

不得建立第二個 Budi，除非使用者明確 Override。

---

# 113. 商業驗收情境 C

Golden Home Cirebon 只取得潛在客戶資料。

沒有 Package。

Expected：

可以只建立 Customer。

不用建立假 Order。

---

# 114. 商業驗收情境 D

Golden Cirebon 建立 Order。

Golden Bandung 登入。

Permission：

Own Branch Only。

Expected：

Bandung 看不到。

---

# 115. 商業驗收情境 E

SANCI 將 Golden Home 設定：

Same Partner
View Only

Expected：

Bandung 可以看 Cirebon Order。

但：

Edit

Cancel

都被拒絕。

---

# 116. 商業驗收情境 F

SANCI 設：

Same Partner
View + Edit

Expected：

依實際 permission policy 允許跨 Branch 指定操作。

所有跨 Branch 修改：

Audit 必須記：

Actor Branch

Target Branch

Before

After

---

# 117. 商業驗收情境 G

Golden Cirebon 建錯 Branch Attribution。

普通 User：

不能修改。

SANCI Authorized Admin：

Correct Attribution

Cirebon
→
Bandung

Reason Required。

Audit 完整。

---

# 118. 商業驗收情境 H

Golden Home Customer 過去曾經是 SANCI Customer。

Phase 2 不得因為這個原因自動把 Golden Home 這張 Order 改成 SANCI Direct。

本次 Order：

Golden Home Cirebon

仍然保持 Partner Attribution。

這是核心商業規則。

---

# 119. 商業驗收情境 I

Customer 取消 Package。

Golden Home：

Cancel Order

Reason:

Customer cancelled purchase

Expected：

Order = CANCELLED

Customer Record 仍存在。

History 仍存在。

Audit 仍存在。

---

# 120. Phase 2 最終產品原則

這一階段成功的標準不是：

功能很多。

而是：

Golden Home 店員拿手機，

可以很快完成：

找到客戶
或
建立客戶

↓

選 Package

↓

選 Sales / PIC

↓

送出

↓

SANCI 立即知道：

「這是 Golden Home Cirebon 的客戶。」

同時系統從底層保證：

Partner Attribution 不會被 SANCI 或其他 Branch 的普通操作搞混。

---

# 121. Future Phase Boundary

Phase 2 完成後，

下一 Phase 才開始：

Customer Arrival

SANCI Showroom Check-in

Furniture Selection

Package Item Selection

Upgrade

Add-on

Selection Confirmation

並且：

Golden Home 可以看到自己的客戶在 SANCI 實際選了哪些家具。

現在不要提前實作。

---

# 122. Final Instruction to Developer / AI

先檢查 Phase 1 是否真的完成。

不要因為 FEATURES.md 寫 DONE 就相信。

實際驗證：

Partner

Branch

Staff

Auth

Permission

RLS

Audit

Responsive

如果 Phase 1 有 P0 / P1 問題：

先報告。

不要直接把 Phase 2 疊在不安全的基礎上。

Phase 2 完成後：

執行 audit-jenzo。

列出：

Implemented

Not Implemented

Files Changed

Migrations

RLS Changes

Tests

Verification Evidence

P0/P1/P2/P3 Findings

Known Risks

Backup Status

Deployment Status

如果沒有部署：

明確寫：

NOT DEPLOYED

如果 Backup 沒驗證：

明確寫：

NOT VERIFIED

如果 Supabase 沒有真正連接：

明確寫：

NOT CONNECTED

禁止用模糊文字假裝完成。

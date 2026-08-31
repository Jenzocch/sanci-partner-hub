# 訂單自動同步到 Google 試算表（單向）

> 這份說明寫給 Jenzo 本人操作，**不需要任何程式基礎**。照著順序做，每一步
> 都有明確的畫面路徑。全部做完大約 15 分鐘。
>
> 這份文件（連同 `integrations/sheets-so-filler/README.md`）是整個專案裡
> 使用繁體中文的檔案，都是給你自己看的操作手冊。系統本身的中文介面一律是
> 簡體中文，那是給 SANCI 印尼辦公室同事看的。

---

## 一、這個工具做什麼

每 15 分鐘自動把系統裡的訂單抄一份到你的 Google 試算表。**2026-08-31 起它從
「訂單清單」升級成「資料存檔」**——除了每個合作商一個分頁，另外多了三個全系統
共用的分頁。**同一天再升級一次**：合作商分頁又加了 9 欄客戶付款資料 + PIC。

### 分頁結構

| 分頁 | 內容 | 誰在寫 |
|---|---|---|
| 合作商名稱（每家一個） | 一列一筆訂單，**40 欄（A..AN）** | 就地更新／新單追加 |
| **Item Pesanan** | 一列一個品項，**24 欄**——查「這個型號賣給誰過」 | 每次整頁重寫 |
| **Pelanggan** | 一列一個客戶——查「這個客戶買過幾次」 | 每次整頁重寫 |
| **Warna** | 一列一個顏色代碼——給 Item Pesanan 的 VLOOKUP 查照片用 | 每次整頁重寫 |

> ⚠️ **Item Pesanan、Pelanggan、Warna 三個分頁每次同步都會整頁重寫**，所以
> **不要在這三個分頁裡寫任何備註**，會被蓋掉。要寫備註請寫在合作商分頁的
> **AO 欄以後**（那裡永遠不會被碰）。

### Item Pesanan 分頁欄位（24 欄）

**欄位順序刻意照著你們手工的「Laporan Penjualan-Sanci」排**，兩份表可以並排
對照，眼睛不用跳來跳去。**串起兩份表的鑰匙是 `No. SO`**——手工報表是用 SO 號碼
認的，不是系統訂單編號。

| 欄 | 標題 | 對應手工報表 |
|---|---|---|
| A | Nomor Pesanan | （系統獨有） |
| B | Tanggal Pesanan | （系統獨有） |
| C | **No. SO** | No. SO ⭐ |
| D | **Tgl SO** | Tanggal SO |
| E | Partner | — |
| F | Cabang | — |
| G | Pelanggan | Nama Customer |
| H | **Telepon** | No. Telefon |
| I | Kode Produk | Code |
| J | Nama Produk | Type / UKURAN |
| K | Ukuran | Ukuran |
| L | Warna | Code Warna ⚠️ |
| M | Jumlah | Qty |
| N | **Harga Satuan (IDR)** | Price/Unit |
| O | **Total Baris (IDR)** | Total Amount |
| P | **Diskon Baris (IDR)** | Disc Amount |
| Q | **Catatan** | — |
| R | **Nama Sales** | Nama sales |
| S | Status Kirim | （系統獨有，見下） |
| T | Sudah DO (jumlah) | （系統獨有） |
| U | **No. DO** | — |
| V | **Tgl DO** | Tanggal Delivery |
| W | **Tgl Terima Pelanggan** | Tanggal Kirim |
| X | **Alamat Kirim** | Alamat Pengiriman |

⚠️ **L 欄「Warna」現在多半是空的**，這不是同步壞掉：系統**建立品項時不收集顏色**
（計算器、Package 複製都不寫），只有在訂單詳情頁點開某個品項按「修改」手動打字
才會有值。要讓它自動有值，得改建立流程——跟我說一聲。L 欄存的是**顏色代碼**
（例如 `C01`），不是顏色名稱或照片；要查名稱/照片，用 §「Warna 分頁」那節的
ARRAYFORMULA 去查新的 **Warna** 分頁。

**手工報表還有 6 欄，2026-08-31（第二次升級）已經全部補齊，但只在「合作商」
分頁，不在這個 Item Pesanan 分頁**：Status Payment → 合作商分頁 AH 欄「Status
Bayar」、Tanggal DP → AI 欄「Tgl DP Pelanggan」、Tanggal Pelunasan → AJ 欄
「Tgl Lunas」、Ekspedisi → AK 欄「Ekspedisi」、Status Confirm → AL 欄「Status
Confirm」、Nama Admin → AD 欄「Nama PIC」（系統內部欄位叫 PIC，跟你們口語的
「Admin」是同一個人）。**PHOTO 和 Foto Warna 做不到**——圖片沒辦法同步進試算表
格子，Warna 分頁只能存照片的**網址**（見下）。

**沒填的金額是空白格，不是 Rp 0。** 0 是一個合法的價格（促銷品），跟「還沒填」
意思完全不同，所以絕不互相假裝。

### Warna 分頁（2026-08-31 新增，5 欄）

系統的產品顏色代碼表（`product_colors`，需要 `0025`）整頁抄過來，**專門給
Item Pesanan 分頁的 L 欄「Warna」查照片用**——L 欄存的只是代碼（例如 `C01`），
不是名字或照片，把幾千列品項每一列都存一份照片網址太浪費，所以照片網址只
存在 Warna 這一個分頁，其他地方用查表（VLOOKUP/ARRAYFORMULA）去抓。

| 欄 | 標題 | 說明 |
|---|---|---|
| A | Kode Warna | 顏色代碼，例如 `C01`——跟 Item Pesanan 的 L 欄對應 |
| B | Nama | 顏色名稱（可能空白，資料庫欄位本身允許不填） |
| C | Foto (URL) | 照片網址（不是圖片本身——試算表格子放不下圖片） |
| D | Status | Aktif／Nonaktif |
| E | Urutan | 排序用的數字，越小排越前面 |

**複製貼上就能用的公式**——在 Item Pesanan 分頁**右邊自己插入一欄新的**（例如
Alamat Kirim 之後），貼這個，會自動幫 L 欄每一列查出對應的顏色名稱：

```
=ARRAYFORMULA(IF(L2:L="",,IFERROR(VLOOKUP(L2:L,Warna!A:C,2,FALSE))))
```

要查**照片網址**（Warna 的 C 欄）就把上面公式的 `,2,` 改成 `,3,`：

```
=ARRAYFORMULA(IF(L2:L="",,IFERROR(VLOOKUP(L2:L,Warna!A:C,3,FALSE))))
```

⚠️ **Warna 是存檔分頁，每次同步都整頁重寫**——跟 Item Pesanan、Pelanggan 一樣，
**不要在裡面寫任何備註或公式**，會被蓋掉。上面的 ARRAYFORMULA 要寫在 **Item
Pesanan** 分頁，不是寫在 Warna 分頁裡。`0025` 還沒在 Supabase 執行的話，這個
分頁**根本不會被建立**（不是建出來但空白），執行紀錄會寫
`product_colors belum ada`。

### 訂單分頁欄位（A..AN 共 40 欄）

用 **A 欄「訂單編號」** 認人：已經在表上的訂單**就地更新**，新訂單**加在最下面**。

| 欄 | 標題 | 說明 |
|---|---|---|
| A | Nomor Pesanan | 訂單編號（比對用的鑰匙，不要手動改） |
| B | No. PO Pelanggan | 客戶自己開的採購單編號（需要 `0020`） |
| C | Cabang | 分店 |
| D | Pelanggan | 客戶姓名 |
| E | Kode Pelanggan | 客戶編號（需要 `0017`–`0019`） |
| F | Telepon | 電話 |
| G | Nama Sales | 承辦業務員——算業績用 |
| H | Package | 套裝名稱 |
| I | Status | 已登記 Terdaftar／已取消 Dibatalkan |
| J | Jalur Pesanan | 交付方式：直接送貨／到店選購 |
| K | Status Kirim | **出貨狀態**，五種值，見下方說明 |
| L | Belanja Toko (IDR) | 客戶在合作商店裡消費的金額（分店回報） |
| M | Penawaran SANCI (IDR) | 🔴 SANCI 給店家的基礎金額（**成本價**） |
| N | Uang Muka / DP (IDR) | 訂金（需要 `0014`） |
| O | Kondisi Pembayaran | 付款條件，自由文字 |
| P | Alamat Kirim | 收貨地址（需要 `0014`） |
| Q | Diskon | 折扣鏈，「8+10」= 先減 8% 再減 10%（連乘）（需要 `0015`） |
| R | Markup (%) | 折扣之後的加成百分比（需要 `0015`） |
| S | Potongan Tunai (IDR) | 最後扣除的現金折讓（需要 `0015`） |
| T | Harga Akhir (IDR) | 🔴 資料庫算出的最終應付金額（**成本價**）（需要 `0015`） |
| U | Sisa (IDR) | Harga Akhir 減 DP（顯示用算式，不是資料庫欄位） |
| V | No. SO | 銷售單號；同一張訂單開了多張就用 `+` 串起來 |
| W | Tgl SO | 最新一張 SO 的日期 |
| X | No. DO | 出貨單號（分批出貨會有多張，用 `+` 串起來） |
| Y | Tgl DO | 最新一張 DO 的日期 |
| Z | No. Invoice | 發票號 |
| AA | Tgl Invoice | 最新一張發票的日期 |
| AB | Tgl Terima Pelanggan | 客戶簽收時間（需要 `0023`） |
| AC | Alasan Batal | 取消原因（需要 `0005`） |
| AD | **Nama PIC** | 承辦 PIC——**你們口語叫「Nama Admin」，是同一個人**（需要 `0026`） |
| AE | **Total Pelanggan (IDR)** | 賣給**客戶**的總金額——注意跟 M/T 欄不同，M/T 是 SANCI 賣給**店家**的成本價（需要 `0026`） |
| AF | **Sudah Bayar (IDR)** | 客戶已付金額；Total 沒填且此值為 0 時顯示空白，避免誤讀成「已確認未付款」（需要 `0026`，見下方說明） |
| AG | **Sisa Pelanggan (IDR)** | Total 減 Sudah Bayar（顯示用算式，不是資料庫欄位；Total 空白則此欄也空白） |
| AH | **Status Bayar** | Lunas／DP／Belum Bayar／空白，算法見下方說明 |
| AI | **Tgl DP Pelanggan** | 客戶付訂金的日期（需要 `0026`） |
| AJ | **Tgl Lunas** | 客戶付清的日期（需要 `0026`） |
| AK | **Ekspedisi** | 貨運公司/物流方式（需要 `0026`） |
| AL | **Status Confirm** | 訂單確認狀態，自由文字（需要 `0026`） |
| AM | Dibuat | 建立時間 |
| AN | Diubah | 最後修改時間 |

粗體 = **2026-08-31 第二次升級新增**（AD..AL 共 9 欄）。V..AA 六欄是同一天第一次
升級加的，需要 `0016`（文件功能）；**Dibuat/Diubah 這次從 AD/AE 移到了
AM/AN**——只有引用到這兩欄字母的公式需要改，AD 以前的所有欄位字母完全沒變。

#### AF「Sudah Bayar」和 AH「Status Bayar」怎麼算

**金額規則貫穿整份表**：沒填的金額是空白格，0 只在**真的有記錄**的時候才寫
0（例如 Total 已經填了、DP 卻真的還沒進帳）。這一條在 AF/AG/AH 三欄尤其容易
搞混，所以拆開講：

- **AF Sudah Bayar**：Total（AE 欄）沒填 **而且** Sudah Bayar 是 0 → 空白（意思
  是「什麼都還沒記錄」，不是「記錄成沒付錢」）。Total 一旦有值，Sudah Bayar
  的 0 就是真的 0，照樣寫 0。
- **AH Status Bayar**（跟系統本身算「Lunas/DP/Belum Bayar」用的是**同一套
  公式**，不會各算各的）：
  1. Total 沒填 → 空白（不知道要付多少，談不上狀態）
  2. Sudah Bayar ≥ Total → `Lunas`（Total 剛好是 0 也算 Lunas，因為 0 塊不用
     再付）
  3. Sudah Bayar > 0（但小於 Total） → `DP`
  4. 其他情況（Sudah Bayar = 0，Total > 0） → `Belum Bayar`

### 🔴 M 欄和 T 欄是成本價 —— 這份表不能給合作商看

M（Penawaran SANCI）和 T（Harga Akhir）是 **SANCI 賣給店家的價格**，也就是
店家的進貨成本。任何一家合作商看到這份表，等於看到你給他的底價，也可能推算
出你給別家的價。**要給合作商看的話，必須另外做一份不含這兩欄的表。**

### K 欄「Status Kirim」的五種值

| 值 | 意思 | 怎麼判定 |
|---|---|---|
| `Dibatalkan` | 訂單已取消 | 狀態是 CANCELLED（**優先於一切**——取消的單不該出現在待出貨名單裡） |
| `Sudah diterima` | 客戶已簽收 | `delivered_at` 有值（優先於 DO 的計算） |
| `Sudah DO` | 全部開了出貨單 | DO 涵蓋的數量 ≥ 訂購數量 |
| `DO sebagian` | **部分出貨** | 有 DO，但沒蓋滿（例如訂 5 件出了 3 件） |
| `Belum DO` | 還沒開任何出貨單 | 有品項，但一張 DO 都沒有 |
| （空白） | **不知道** | `0016`/`0014` 還沒跑，或這張訂單沒有品項 |

**空白是刻意的**：資料不足時寧可留白，也不寫「Belum DO」——猜錯會叫人去出
一批可能早就出過的貨。

篩選 K 欄 = `Belum DO` 或 `DO sebagian`，就是你今天該處理的出貨清單。

- 金額寫成**純數字**，日期寫成**真正的日期**，所以可以直接排序、篩選、加總。

## 二、⚠️ 這次升級要做什麼（2026-08-31，第五次欄位變更）

這份文件承諾的「絕不碰某欄以後」已經被打破五次：`0014`（K→N）、`0015`（N→S）、
`0020`（S→T，而且是插在 B 欄）、2026-08-31 第一次升級（T→AE，加存檔分頁）、
以及**這次、同一天的第二次升級**（AE→AN，加客戶付款資料 + PIC + Warna 分頁）。
不假裝沒變，直接講後果。

- **這次也是加在後面，不是插在中間**——延續第一次升級的做法。A..AC 這些欄位
  的字母**完全沒有變**（AC 欄以前就是 Alasan Batal，現在還是）。新的 9 欄接
  在 Alasan Batal 後面，原本的 Dibuat/Diubah 從 AD/AE 移到 **AM/AN**。所以只
  有引用到 AD/AE 兩欄的公式需要改。
- **你的手寫備註不會被動到。** 同步程式偵測到分頁還是舊格式（11／14／19／20／
  31 欄）就**直接拒絕同步那個分頁**並在執行紀錄留言，不會盲目覆蓋——包括剛
  升級過一次、還是 31 欄的舊分頁，這次一樣會被拒絕，這是**預期行為**。
- **偵測方式**：比對第一列標題是不是跟 40 欄標題**逐格完全一致**。不一致就跳過
  那個分頁，其他分頁不受影響。
- **手寫備註的新起點是 AO 欄**（原本是 AF）。
- **優雅降級**：`0016` 沒跑 → V..AA 六欄留空、K 欄留空；`0023` 沒跑 → AB 欄留空；
  `0017`–`0019` 沒跑 → E 欄留空；`0026` 沒跑 → AD..AL 九欄全部留空；`0025`
  沒跑 → **Warna 分頁整個不會被建立**（跟其他欄位留空不同，因為它是獨立分頁
  不是一欄）。每一項各自獨立偵測，**不會因為一個欄位/分頁讀不到就整批失敗**。

### 升級步驟

**只需要重新貼 Code.gs，不用動 Supabase，試算表本身也不用手動改任何東西。**

1. 打開你的試算表 → **擴充功能** → **Apps Script**。
2. 打開 `Code.gs`，**全選、刪除**，把這份資料夾裡**新版** `Code.gs` 的內容
   全選、複製、貼上。
3. 按 💾 儲存。**不需要重填 Script Properties**（沒變），也**不需要重跑
   `setupTrigger`**（既有排程照常生效）。
4. 回到試算表 → 選單 **SANCI Sync** → **Sync sekarang**。
5. 看執行紀錄（**執行項目** → 最新一次）：
   - 每個既有分頁**又會**出現一次 `TAB GAGAL "合作商名稱": Error: Format lama
     terdeteksi ...`——**就算是上次升級後才剛建好的 31 欄分頁也一樣會被拒絕，
     這是預期行為，不是壞掉**。你的資料完全沒被碰。
   - **`Item Pesanan` 和 `Pelanggan` 兩個既有存檔分頁照常整頁重寫**（它們的
     格式這次沒變）；`0025` 已執行的話，**`Warna` 新分頁會直接建立好**。
6. 把每個被拒絕的分頁**改名**（例如「合作商 A (舊 2026-08-31 前)」）或搬到別的
   試算表存檔。
7. 再點一次 **SANCI Sync → Sync sekarang**——這次每個合作商會拿到一個全新的
   40 欄分頁。改名保留的舊分頁還在，資料原封不動，只是不會再被更新。
8. 舊分頁的手寫備註要不要搬到新分頁，是**手動**的事——同步程式從不做這件事。

> 不想現在升級也可以：舊版 Code.gs 不會自己壞掉，繼續同步 31 欄，只是不會有
> 客戶付款狀態、PIC、Ekspedisi、Status Confirm，也不會有 Warna 分頁。

## 三、關於備份 —— 請先讀這段

**這個工具不是備份。** 它是一面鏡子：反映系統現在的樣子。

| | 這個同步 | 真正的資料庫備份 |
|---|---|---|
| 訂單、品項、客戶 | ✅ 有（2026-08-31 起） | ✅ 有 |
| 型錄、照片、權限、稽核紀錄 | ❌ 沒有 | ✅ 有 |
| 誤刪一筆訂單 | 那一列就地被覆蓋，**救不回來** | 可還原 |
| 還原整個系統 | ❌ 做不到 | ✅ 做得到 |

**Supabase 目前是 Free 方案 = 完全沒有自動備份。** 這份試算表因此是你現在
**唯一**的訂單資料副本——它擋得住「有人手滑改錯一筆」，但擋不住資料庫層級的
意外。想要真正的還原能力，只有升級 Supabase 方案（Pro 含每日備份 + 7 天內可
還原到任一秒）這條路。

**一個免費的加強做法**：每個月手動做一次 **檔案 → 建立副本**，把副本命名成
「SANCI 訂單存檔 2026-08」。同步只會更新原本那份，副本會停在那個時間點，形成
真正的歷史快照。

## 四、這個工具**不做**什麼（很重要，先看完再用）

- ❌ **不會反向同步**。你在試算表上改任何格子，**系統裡不會跟著變**。
  試算表是「看的」，不是「填的」。真正要改資料，還是要回後台改。
- ❌ **永遠不會刪除合作商分頁的任何一列**。訂單取消了，只是 I 欄（Status）變成
  「Dibatalkan」、K 欄變成「Dibatalkan」，那一列還在。
- ❌ **不會碰合作商分頁 AO 欄以後的任何東西**（歷次是 L → O → T → U → AF → AO，
  見上方「欄位範圍變更」）。你想在右邊自己加備註欄、加公式、加顏色，儘管加——
  同步程式只會寫 A 到 AN。
- ⚠️ **但 `Item Pesanan`、`Pelanggan`、`Warna` 三個分頁例外**：它們每次同步都
  整頁重寫，在裡面寫什麼都會被蓋掉。備註請寫在合作商分頁的 AO 欄以後。
- ❌ **不會即時**。它每 15 分鐘跑一次。想馬上更新，用選單手動跑（第六步）。

---

## 五、第一步：建立一個「專用同步帳號」

**為什麼要多開一個帳號，不用你自己的？** 因為這組帳號密碼要打在 Apps Script
的設定裡，等於留在試算表上。用專用帳號的話，萬一哪天這份試算表分享錯人，
你只要把這一個帳號停用就好，你自己的管理員帳號完全不受影響。

### 3-1 在 Supabase 建帳號

1. 打開 <https://supabase.com> → 登入 → 點進 SANCI 的專案。
2. 左邊選單點 **Authentication**（一個人形圖示）。
3. 上方點 **Users** 分頁 → 右上角綠色按鈕 **Add user** → 選 **Create new user**。
4. 填：
   - **Email**：`sheets-sync@sanci.com`（你可以換成別的，但要記住）
   - **Password**：自己設一組**長一點**的密碼，並先貼到記事本存著
   - **Auto Confirm User**：**打勾**（很重要，這個帳號沒有真的信箱可以收確認信）
5. 按 **Create user**。

### 3-2 把這個帳號設成 SANCI 管理員

這個帳號要能讀到全部合作商的訂單，所以必須是平台管理員。

1. 左邊選單找 **SQL Editor**（圖示長得像 `>_`，就在 Table Editor 圖示的正下方）。

   > ⚠️ **注意**：左邊選單另外有一區叫 **Logs**，那裡面也有可以打字的查詢框，
   > 但那是查日誌用的、**不是資料庫**。貼在那裡按 Run 會出現
   > 「Failed to get project's logs」之類的錯誤，而且資料庫裡其實什麼都沒發生。
   > 一定要用 **SQL Editor**。

2. 點 **New query**，把下面這段整段貼進去，**把信箱改成你剛剛建的那個**：

   ```sql
   insert into public.platform_admins (auth_user_id, note)
   select id, 'Akun sync Google Sheets'
   from auth.users
   where email = 'sheets-sync@sanci.com'   -- ← 改成你剛剛建的信箱
   on conflict do nothing;

   -- 驗證：應該回傳 SYNC_ADMIN_BOUND | 1
   select 'SYNC_ADMIN_BOUND' as check_type, count(*)::text as result
   from public.platform_admins pa
   join auth.users u on u.id = pa.auth_user_id
   where u.email = 'sheets-sync@sanci.com';  -- ← 同一個信箱
   ```

3. 按 **Run**。
4. **看結果，不要只看有沒有紅字**：下面應該出現一列
   `SYNC_ADMIN_BOUND | 1`。
   - 如果是 **0**：信箱打錯了，或第 3-1 步的帳號沒建成功。回去檢查。
   - 「Run 沒有紅字」**不算**成功，一定要看到那個 `1`。

---

## 六、第二步：把程式貼進試算表

1. 開一個新的 Google 試算表（或用你現有的那份）。
2. 上方選單 **擴充功能** → **Apps Script**。會開一個新分頁。
3. 裡面預設有一個 `Code.gs`，內容大概是 `function myFunction() {}`。
   **把裡面的內容全部選起來刪掉**。
4. 打開本資料夾裡的 `Code.gs`，**全選、複製、貼上**到剛剛清空的地方。
5. 按上方的 💾 **儲存**圖示（或 Ctrl+S / ⌘+S）。
6. 左上角專案名稱點一下，改成「SANCI Sync」之類看得懂的名字（可選）。

---

## 七、第三步：填四個設定值

1. 還在 Apps Script 畫面，左邊選單點 **專案設定**（⚙️ 齒輪圖示）。
2. 往下捲到 **指令碼屬性** 這一區 → 點 **新增指令碼屬性**。
3. 一組一組加進去，**總共四組**：

   | 屬性名稱（左邊，要一字不差） | 值（右邊） | 去哪裡拿 |
   |---|---|---|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Project Settings → Data API → Project URL |
   | `SUPABASE_ANON_KEY` | 一長串 `eyJ...` | 同一頁的 **anon / public** 那一把 |
   | `SYNC_EMAIL` | `sheets-sync@sanci.com` | 你在第 3-1 步建的信箱 |
   | `SYNC_PASSWORD` | 你設的那組密碼 | 你在第 3-1 步存到記事本的那組 |

4. 按 **儲存指令碼屬性**。

> 🔒 **絕對不要**把 Supabase 的 **service_role** 那把鑰匙貼進來。
> 那把鑰匙可以繞過所有權限保護，等於整個資料庫的萬能鑰匙。
> 這個工具只需要 **anon** 那把（那把本來就是設計成公開的，
> 真正的保護是靠帳號權限）。頁面上兩把 key 長得很像，**看清楚標籤再複製**。

---

## 八、第四步：啟動自動同步

1. Apps Script 畫面上方，中間有一個下拉選單，預設可能顯示 `onOpen`。
   把它切換成 **`setupTrigger`**。
2. 按左邊的 **▶ 執行**。
3. **第一次會跳出授權視窗**，這是正常的，Google 要你確認這支程式可以動你的檔案：
   - 跳出「需要授權」→ 按 **審查權限**。
   - 選你自己的 Google 帳號。
   - 出現 **「Google 尚未驗證這個應用程式」** 的警告畫面 —— 這是因為這支程式是
     你自己寫在自己試算表裡的，不是上架的商店應用程式，**屬於正常情形**。
     點左下角小小的 **進階** → 再點 **前往「SANCI Sync」(不安全)**。
   - 最後一頁列出它要的權限（讀寫這份試算表、連到外部網路），按 **允許**。
4. 回到畫面下方的「執行紀錄」，應該看到類似：
   `setupTrigger: 0 trigger 舊的已刪除, 1 個新的每 15 分鐘`
   （訊息是印尼文，看到 `1 trigger baru setiap 15 menit` 就對了。）

> `setupTrigger` **可以重複執行**，不會變成兩個排程——它會先把舊的清掉。
> 如果哪天你想停掉自動同步：左邊選單 **觸發條件**（⏰ 圖示）→ 找到那一條 →
> 右邊三個點 → **刪除觸發條件**。

---

## 九、第五步：驗證它真的有用

1. 回到試算表那個分頁，**重新整理頁面**（F5）。
2. 上方選單列會多出一個 **SANCI Sync**（如果沒出現，再重新整理一次）。
3. 點 **SANCI Sync** → **Sync sekarang**。
4. 等十幾秒。畫面下方會有「執行中」的小提示，結束後：
   - 應該看到每個合作商各自一個分頁。
   - 分頁裡第一列是標題（而且會被凍結，往下捲時標題不會消失）。
   - 訂單資料從第二列開始。
5. **獨立核對**：隨便挑一筆訂單，打開後台 → Pesanan → 找到同一個訂單編號，
   對一下客戶名字、分店、金額是不是一樣。
   **看到資料出現不代表資料是對的**，一定要實際對一筆。

---

## 十、關於 M..U 欄「Penawaran SANCI」相關欄位（舊版是 J..R）

J..M 欄（Penawaran SANCI／Uang Muka／Kondisi Pembayaran／Alamat Kirim）都是
後台**訂單詳細頁**「Penawaran SANCI」卡片裡填的資料，性質完全相同：**人在
後台或分店手動打進去的數字/文字，資料庫不對它們做任何計算**（這條規矩從
`0009` 就定下來，`0014` 也沒有打破它）。

N..R 欄（Diskon／Markup／Potongan Tunai／Harga Akhir／Sisa）**不一樣**——這是
`0015` 新增的訂單層級折扣鏈：**資料庫真的會計算**。詳細規則見
`web/lib/i18n/GLOSSARY.md` §「订单层级的折扣链计算」；簡單說：Harga Akhir
（Q 欄）＝ 基礎金額（J 欄）依序乘上每個折扣（N 欄，連乘不是相加）→ 乘上
（1＋Markup%）→ 減 Potongan Tunai（P 欄），資料庫算出來的數字，人只能打
折扣/加成/現金折讓這三種輸入，算出來的最終金額不能手動覆寫。這**不違反**
「產品目錄不放價格」的鐵律——這是單一訂單的成交價，不是產品定價。

- 這一整組欄位（J..R）**只有 SANCI 看得到**，除非後台「Hak Akses」分頁裡
  個別合作商被打開「可以查看/填寫 Penawaran SANCI」（N..R 另外需要「可以
  設置折扣」）——這是資料庫層級（RLS）擋掉的權限，不是只把畫面藏起來而已。
- J 欄（Penawaran SANCI）需要先執行 **`0013_order_offer_amount.sql`**。
  **如果還沒執行，J 欄會整欄空白**，其他欄位一切正常。
- K 欄（Uang Muka/DP）與 L 欄（Kondisi Pembayaran）需要 **`0014`** 這份腳本
  （檔名見 `supabase/migrations/` 資料夾裡以 `0014_` 開頭的檔案）。
  **如果只執行到 0013、還沒執行 0014，K/L 兩欄會空白，J 欄照常運作**——
  同步程式會自動偵測並在執行紀錄留言，不會整個同步失敗。
- M 欄（Alamat Kirim）是這筆訂單自己的收貨地址（可能跟客戶主檔地址不同），
  同樣需要 **`0014`**；沒執行的話這欄也是空白，其他欄位不受影響。
- N/O/P/Q/R 五欄（Diskon/Markup/Potongan Tunai/Harga Akhir/Sisa）需要
  **`0015`** 這份腳本。**如果只執行到 0014、還沒執行 0015，這五欄會空白，
  J/K/L/M 照常運作**——同步程式會自動偵測並在執行紀錄留言。
- J 欄（基礎金額）跟 Q 欄（Harga Akhir，最終應付）是**兩個不同的數字**——
  沒有折扣/加成/現金折讓時兩者相同，有的話會不一樣，看報表時不要混用。

## 十之一、關於 B 欄「No. PO Pelanggan」

B 欄是 `0020` 新增的欄位，跟 J..M 那組「Penawaran SANCI」欄位不是同一類：
**它是客戶自己開的採購單（PO）編號**，跟後台或分店打的其他欄位一樣，都是
「人打什麼就顯示什麼」，資料庫不驗證格式、也不去重（同一個 PO 拆成幾筆系統
訂單是常見情形）。

- 資料來源：分店建單表單、後台建單表單的「Nomor PO Pelanggan」欄位，或分店
  之後用「Ubah Pesanan」補填/修改。沒有的話（大部分零售客戶不會開 PO）就是
  空白，這是正常狀態，不代表資料漏填。
- **不像 J..R 那組，B 欄不受「Hak Akses」的 Penawaran SANCI 權限管控**——
  只要合作商本來就能看到這筆訂單，就能看到它的 PO 編號（跟 Alamat Kirim
  同一類，屬於一般訂單資訊，不是 SANCI 內部的成交價資料）。
- 需要先執行 **`0020_order_customer_po.sql`**。**如果還沒執行，B 欄會整欄
  空白**，其他欄位（含 A 欄訂單編號）一切正常運作，同步不會因此失敗。
- 印在 Invoice 上的「Purchase Order」那一行走的是同一個資料來源：客戶有填
  PO 就印客戶的號碼，沒填就印回系統訂單編號（永不留空）——B 欄看到的空白，
  代表那張 Invoice 印的其實是系統訂單編號，不是客戶自己的號碼。

---

## 十一、安全須知

| 情況 | 該怎麼辦 |
|---|---|
| 這份試算表不小心分享給不該看的人 | ① 先把試算表的分享權限收回；② 到 Supabase → Authentication → Users 找到 `sheets-sync@...` → 右邊三個點 → **Delete user**（或先改密碼）。刪掉之後同步會停，重新做第三、五步就能恢復。 |
| 懷疑密碼外流 | 到 Supabase 把那個同步帳號的密碼改掉，然後回 Apps Script 的**指令碼屬性**把 `SYNC_PASSWORD` 換成新的。 |
| 有人問你要 service_role key | 不要給，也不要貼進這個工具。這個工具完全用不到它。 |

這個同步帳號**只能讀**——它不會、也沒有任何一行程式會往系統裡寫東西。

---

## 十二、疑難排解

| 症狀 | 原因 | 怎麼修 |
|---|---|---|
| 執行紀錄出現 `Login akun sync GAGAL (HTTP 400)` | `SYNC_EMAIL` 或 `SYNC_PASSWORD` 打錯 | 回第五步重新確認那兩格，注意前後不要多空白 |
| 執行紀錄出現 `Login akun sync GAGAL (HTTP 401)` | `SUPABASE_ANON_KEY` 貼錯（可能複製到別把 key，或少複製了一段） | 回 Supabase → Project Settings → Data API 重新複製 **anon / public** 整串 |
| `Script Property belum diisi: ...` | 後面列出來的那幾格還沒填 | 回第五步補齊，名稱要一字不差（全大寫、底線） |
| 跑完了，但一個分頁都沒有 | 同步帳號還不是平台管理員，所以讀到 0 筆訂單 | 回第 3-2 步，確認驗證查詢回傳 `1` 而不是 `0` |
| **B 欄（No. PO Pelanggan）整欄空白，其餘欄位正常** | `0020_order_customer_po.sql` 還沒在 Supabase 執行 | 執行那份腳本，下一次同步就會有了。執行紀錄裡也會直接寫 `customer_po belum ada` |
| **J 欄（Penawaran SANCI）整欄空白** | `0013_order_offer_amount.sql` 還沒在 Supabase 執行 | 執行那份腳本，下一次同步就會有了。執行紀錄裡也會直接寫 `order_sanci_offers belum ada` |
| **K/L 欄（Uang Muka/Kondisi Pembayaran）空白，J 欄正常** | 只執行到 `0013`，還沒執行 `0014` | 執行 `0014` 那份腳本。執行紀錄會寫 `dp_amount/payment_condition belum ada` |
| **M 欄（Alamat Kirim）整欄空白**，B 欄（No. PO Pelanggan）也跟著空白 | `0014` 還沒執行（`0020` 的前提是 `0014` 已跑過，所以兩欄一起空） | 執行 `0014` 那份腳本。執行紀錄會寫 `shipping_address belum ada` |
| **N/O/P/Q/R 欄（Diskon/Markup/Potongan Tunai/Harga Akhir/Sisa）空白，J..M 正常** | 只執行到 `0014`，還沒執行 `0015` | 執行 `0015_order_discount_chain.sql`。執行紀錄會寫 `discount_pcts/markup_pct/cash_discount/final_amount belum ada` |
| **AD..AL 九欄（Nama PIC..Status Confirm）整批空白** | `0026` 還沒在 Supabase 執行 | 執行那份腳本，下一次同步就會有了。執行紀錄裡也會直接寫對應欄位「belum ada」 |
| **Warna 分頁沒有出現**（不是空白，是整個分頁不存在） | `product_colors` 表還沒建（`0025` 還沒在 Supabase 執行） | 執行 `0025` 那份腳本，下一次同步 `Warna` 分頁就會自動建出來。執行紀錄會寫 `product_colors belum ada` |
| **某個分頁的執行紀錄寫「Format lama terdeteksi」** | 那個分頁還是舊版格式（11／14／19／20／31 欄），跟現在 40 欄的標題對不上 | 照訊息指示：把那個分頁改名或搬走存檔，再重新 Sync，系統會用新格式建一個同名新分頁（見「升級步驟」一節） |
| 某個合作商的分頁沒更新，其他都正常 | 那個分頁可能被保護／鎖定，或名稱有特殊字元 | 看執行紀錄裡的 `TAB GAGAL "合作商名稱": ...`，照後面的訊息處理 |
| 同一筆訂單出現兩列 | A 欄的訂單編號被人手動改過（改了就對不上，會被當成新訂單） | 把多出來的那一列刪掉，並且**不要再手動編輯 A 到 AN 欄** |
| 日期時間看起來差了幾小時 | 試算表的時區設定 | 試算表 → **檔案** → **設定** → **時區** 改成 `(GMT+07:00) Jakarta` |
| 選單列沒有出現「SANCI Sync」 | 頁面還沒重新載入 | 重新整理試算表頁面（F5）。如果還是沒有，回 Apps Script 確認 `Code.gs` 有存到 |
| 執行紀錄說 `dilewati — run lain sedang berjalan` | 剛好有另一次同步在跑 | 正常現象，這是防止同一筆訂單被寫成兩列的保護。等一下再跑就好 |

---

## 十三、要去哪裡看執行紀錄

Apps Script 畫面 → 左邊選單 **執行項目**（≡ 圖示）→ 點任何一次執行 →
下面就是那次的訊息。每次跑完最後一行會像這樣：

```
SANCI Sync selesai: 132 pesanan, 4 tab OK, 0 tab gagal,
128 baris diperbarui, 4 baris baru, penawaran: 37 baris, 6.2 detik.
```

意思是：132 筆訂單、4 個分頁都成功、0 個失敗、128 列更新、4 列新增、
37 筆有填 SANCI 方案金額、花了 6.2 秒。

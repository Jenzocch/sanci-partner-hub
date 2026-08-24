# Daftar Istilah / 词汇表 / Glossary

**Disetujui Jenzo 2026-08-17. Ini mengikat.** Satu konsep = satu kata, di
setiap bahasa, di seluruh aplikasi. Kalau sebuah kata belum ada di sini dan
akan dipakai lebih dari sekali, tambahkan dulu ke tabel ini baru dipakai —
jangan mengarang sinonim di tengah jalan.

Prinsip dari owner: **注意用詞,要能夠快速理解** — pilih kata yang langsung
dimengerti pegawai toko, bukan istilah formal/teknis.

| Konsep | Bahasa Indonesia | 简体中文 | English |
|---|---|---|---|
| Mitra toko | Partner | 合作商 | Partner |
| Cabang | Cabang | 分店 | Branch |
| Pegawai | Staf | 员工 | Staff |
| Akun login | Akun | 账号 | Account |
| Nama untuk masuk (bentuk email, BUKAN email sungguhan — kotak "Email" di halaman login tetap bernama Email, jadi teksnya selalu menjelaskan hubungan itu) | ID login | 登录 ID | Login ID |
| Pelanggan | Pelanggan | 客户 | Customer |
| Pesanan | Pesanan | 订单 | Order |
| Nomor pesanan | Nomor Pesanan | 订单编号 | Order No. |
| Paket furnitur | Package | 套装 | Package |
| Produk SANCI | Produk | 产品 | Product |
| Katalog produk | Katalog | 产品目录 | Catalog |
| Stok | Stok | 库存 | Stock |
| — tersedia | Tersedia | 有货 | Available |
| — terbatas | Terbatas | 库存少 | Limited |
| — habis | Habis | 缺货 | Out of stock |
| Status pesanan — terdaftar | Terdaftar | 已登记 | Registered |
| Status pesanan — batal | Dibatalkan | 已取消 | Cancelled |
| Cara penyerahan | Jalur Pesanan | 交付方式 | Fulfillment |
| — kirim langsung | Kirim Langsung | 直接送货 | Direct Delivery |
| — datang ke showroom | Kunjungan Showroom | 到店选购 | Showroom Visit |
| Penjual | Sales | 销售员 | Sales |
| Penanggung jawab | PIC | 负责人 | PIC |
| Kode identitas pelanggan, dibangkitkan otomatis — SANCI-direct (0018) ATAU branch-created (0019), dua skema BERBEDA menulis kolom yang SAMA | Kode Pelanggan | 客户代码 | Customer Code |
| Cara pelanggan SANCI-direct masuk — master data admin (0018) | Sumber | 来源 | Source |
| Kode identitas staf partner, dipakai dalam Kode Pelanggan branch-created (0019) — beda dari Sales/PIC pada pesanan, ini KODE-nya, bukan pilihannya | Kode Staf | 员工代码 | Staff Code |
| Invoice | Invoice | Invoice | Invoice |
| Dokumen — Sales Order (0016) | SO | SO | SO |
| Dokumen — Surat Jalan (0016) | DO | DO | DO |
| Belanja di toko mitra | Total Belanja di Toko | 店内消费金额 | Store Purchase |
| Pelanggan sudah datang | Pelanggan Tiba | 客户已到店 | Customer Arrived |
| Catatan khusus SANCI | Catatan Internal | 内部备注 | Internal Note |
| Nilai penawaran SANCI per pesanan | Penawaran SANCI | SANCI 方案金额 | SANCI Offer |
| Uang muka pesanan | Uang Muka (DP) | 订金 | Down payment (DP) |
| Syarat pembayaran (teks bebas) | Kondisi Pembayaran | 付款条件 | Payment condition |
| Alamat tujuan kirim satu pesanan | Alamat Pengiriman | 收货地址 | Shipping address |
| Daftar produk/baris di dalam satu pesanan | Isi Pesanan | 订单明细 | Order items |
| Alat hitung penawaran cepat, ephemeral, tanpa gerbang izin (2026-08-20) | Kalkulator Penawaran | 方案计算器 | Offer Calculator |
| Rantai diskon % tingkat pesanan (0015) | Diskon | 折扣 | Discount |
| Persentase kenaikan setelah diskon (0015) | Markup | 加成 | Markup |
| Potongan tunai flat, dikurangi terakhir (0015) | Potongan Tunai | 现金折让 | Cash discount |
| Nilai yang harus dibayar setelah diskon/markup/potongan tunai (0015) | Harga Akhir | 最终金额 | Final price |
| Kepemilikan pesanan | Atribusi | 归属 | Attribution |
| Hak akses | Hak Akses | 权限 | Access |
| — hanya cabang sendiri | Cabang sendiri | 仅本店 | Own branch |
| — semua cabang mitra | Sesama partner | 同合作商全部分店 | All partner branches |
| — lihat saja | Lihat saja | 只能查看 | View only |
| — lihat dan ubah | Lihat + edit | 查看和修改 | View + edit |
| Status — aktif | Aktif | 启用 | Active |
| Status — nonaktif | Nonaktif | 停用 | Inactive |
| Status — draf | Draf | 草稿 | Draft |
| Status — ditangguhkan | Ditangguhkan | 已暂停 | Suspended |
| Riwayat perubahan | Aktivitas | 操作记录 | Activity |
| Simpan | Simpan | 保存 | Save |
| Batal (tombol) | Batal | 取消 | Cancel |
| Ubah | Ubah | 修改 | Edit |
| Tambah | Tambah | 新增 | Add |
| Cari | Cari | 搜索 | Search |
| Alasan | Alasan | 原因 | Reason |
| Nonaktifkan | Nonaktifkan | 停用 | Deactivate |
| Aktifkan | Aktifkan | 启用 | Activate |
| Peran kerja staf | Peran | 角色 | Role |

## Aturan gaya per bahasa

**Bahasa Indonesia** — bahasa toko sehari-hari. Hindari istilah birokratis
(pakai "Ubah", bukan "Melakukan perubahan data"). Tombol = kata kerja
perintah pendek.

**简体中文** — 必须是**中国大陆用户一看就懂**的简体中文(owner 明确要求)。
不是"把繁体字转成简体字",而是用大陆本地的说法。短句优先,按钮用动词
("保存"不用"进行保存"),不要生硬直译("订单路径"→"交付方式")。

**本系统只有三个语言:印尼语 / 英语 / 简体中文(大陆)。没有繁体版,
也不需要。** 下表右栏是**禁用词**,不是备选 —— 出现任何一个都算错译。
(开发者本身习惯繁体中文,这类词最容易不知不觉混进来,所以明文列出。)

| ✅ 必须用 | ❌ 禁用 |
|---|---|
| 保存 | 儲存 |
| 搜索 | 搜尋 |
| 账号 | 帳號 |
| 登录 / 退出 | 登入 / 登出 |
| 设置 | 設定 |
| 默认 | 預設 |
| 界面 | 介面 |
| 菜单 | 選單 |
| 文件 | 檔案 |
| 数据 | 資料 |
| 网络 | 網路 |
| 信息 / 消息 | 訊息 |
| 项目 | 專案 |
| 质量 | 品質 |
| 操作记录 | 稽核紀錄 |

**"发票"是陷阱,所以中文版也直接用 "Invoice"**(owner 拍板 2026-08-17):
"发票"在大陆专指税务发票(fapiao),有法律含义,而本系统里 Invoice 只是
合作商开给客户的消费单据照片 —— 叫"发票"会让人误以为是报税用的。
不用"消费凭证"的原因:看中文版的是 SANCI 印尼办公室的同事,他们日常工作
本来就说 "invoice",直接用反而最快看懂。三种语言统一同一个词,培训和对照
都更省事。

**通用原则(owner 2026-08-17 拍板):凡是翻译过去有可能被误会的词,三种语言
一律保留大家日常在用的原词,不硬翻。** Invoice 是第一个这样的例子。判断标准
不是"能不能翻",而是"翻了之后会不会有人理解成别的东西" —— 会,就别翻。

以下词在三种语言里都保持原样:Invoice、WhatsApp、PIC(印尼语界面)、
SANCI 及各合作商名称、订单编号与各种代码。

**"Penawaran SANCI" bukan "harga"** (owner 拍板 2026-08-20)：这是 SANCI 针对
**某一笔订单**手工决定的方案金额，跟产品目录没有关系——**产品目录永远不放
价格（0010 的铁律，至今有效）**。所以三种语言都不用"Harga / Price / 价格"
这类词指产品，避免有人误以为系统里开始有产品定价了。

**订单层级的折扣链计算——owner 已拍板要做**（Jenzo 2026-08-19/20 亲自定案，
含算例确认）：早先这里写过"系统不计算折扣，只记录人决定的那个数字"——那句
话是 0013 施工时对旧边界（0009/0010"目录零价格、方案人工决定"）的**过度
推广**，写下时 owner 还没有说明他们的折扣算法；owner 随后明确定案了订单
层级的折扣链：**多段百分比连乘（8% 再 10% = ×0.92×0.90，不是 18%）→
可选加成 % → 最后减现金折让（去尾数用）→ 系统算出最终金额**，并确认了
算例（10.000.000 → [8,10] → +10% → −8.000 = 9.100.000）。这属于
**订单成交价的计算**，不推翻 0010"产品目录零价格"——目录里依然一个价格
都没有。词汇：Diskon / Discount / 折扣（指订单折扣链）可以用；产品目录
相关的一切照旧不碰价格词。

**0014 补充（依然有效的部分）**：`dp_amount`（订金）、`payment_condition`
（付款条件）、`order_items.unit_price`/`line_discount`（单价／单行扣减
金额）是人手动输入的数字/文字。`line_discount` 维持"Potongan Baris /
Line deduction / 单行扣减金额"的叫法——它是**单行**的手填扣减，与订单
层级的折扣链（0015）是两个不同的东西，名字刻意分开以免混淆。

**计算器购物车品项现在会带入 order_items（修正早前的范围决定）**：
Phase 2 第十二切片（Kalkulator Penawaran，2026-08-20）当时明确决定"计算器
里的逐项商品清单与每行单价完全不会自动变成 `order_items`"（见 FEATURES.md
当时的 P2-63/P2-64）——理由是分店端建立订单完全走 Package-based（0008），
没有任何写入路径接受 client 传入任意品项清单。这不是判断错误，是当时真实
的系统限制；owner 后来要求补上这个缺口，所以新增了一条独立的写入
（`copyCalcCartItemsToOrder`，`web/app/cabang/pesanan/actions.ts`），不改
`createCustomerAndOrder`本身的 Package-based 建单方式，纯粹是订单建立成功
之后的第二段 best-effort 写入。**没有新 migration**——完全复用 order_items
既有的分店 INSERT policy 与 `trg_order_item_price_guard`（皆为 0014 既有）：
`unit_price`/`line_discount` 依然只有 partner 的 `can_edit_offer` 开启才能
写入；计算器本身不设权限门槛这件事（P2-62 的既有设计）不变，只是这个
免权限只到"算给客户看"为止——真正落到 order_items 这一步时，价格栏位的
权限把关跟 OfferSection/`setOrderOfferBranch` 完全一样地生效，partner 没
有那个权限时，商品仍会建立，只是价格栏位留空（trigger 拒绝后重试一次，
不带 unit_price）。

**"Sales"这个词，0018 沿用既有决定，没有重新造词**：`sanci_sales_staff`
（SANCI 自己内部的业务员名单，用来生成 `customer_code` 里的 SalesCode）
跟上面"Penjual｜Sales｜销售员"这一行说的是**同一个词**，三语言维持完全
相同的翻译（Sales / Sales / 销售员）——但指的是**不同的表**：那一行原本
指 `partner_staff`（各合作商店家自己的员工，订单建立时选的"Sales/PIC"），
0018 的 `sanci_sales_staff` 是 SANCI 自己的业务团队，两者结构相似但完全
独立，不共用同一张表，也不共用同一个下拉选单（详见 migration 0018 头部
的 disambiguation）。词汇选择上刻意不造新词区分（例如不叫"SANCI Sales"）
——画面本身的分类（"Kode Sales" 独立分页、跟 partner_staff 的 Sales/PIC
下拉完全不同的位置）已经足够让使用者分清楚是哪一份名单，硬要在词汇上加
前缀反而制造新的、GLOSSARY 里没有的术语。

**"Kode Staf"（partner_staff.code，0019）不是新的角色概念，只是给已有的
Sales/PIC 员工加一个可选的短代码**：`partner_staff` 从 0004 起就是订单建
立时"Sales/PIC"下拉菜单指向的同一张表，0019 只加了一个可以留空的 `code`
栏位——不是新增一种员工、也不影响 Sales/PIC 下拉本身的显示方式（那里
继续显示 `full_name`，不是 code）。跟 0018 的 `sanci_sales_staff`（SANCI
内部业务员名单，生成 SANCI-direct 客户代码用）完全是两回事：一个属于
合作商门店自己的员工，一个属于 SANCI 内部团队；两者的"代码"分别进入两
种**不同格式**的客户代码（0018 是 `A/26-C/033`，0019 是
`GH-BSD-AS/26/001`），字符位置不会互相混淆（详见 migration 0019 头部的
不冲突证明）。

**English** — plain English, not enterprise jargon. "Add Staff", not
"Create Personnel Record". Sentence case for buttons and labels.

**"SO"/"DO"（Sales Order／Surat Jalan，0016 拍板）**：跟 Invoice 同一条原则
——三种语言都直接用英文缩写 SO/DO，不硬翻。印尼语原本就习惯说 "Surat Jalan"，
但系统内的单据编号前缀（`DO-...`）与合作商/员工日常口语已经是 "DO" 这个缩写，
翻成"送货单"或"运单"反而是系统里从未出现过的新词，会让人对不上号；SO 同理
（不翻成"销售订单"）。三份印出来的纸本单据本身维持印尼语硬编码（不跑 i18n，
见下方说明），这条只影响系统介面里*指称*这三种单据的文字（卡片标题、按鈕、
篩選等），不影响紙本內容本身的語言。

**列印文件（SO/DO/Invoice 紙本）本身不跑 i18n，永遠是印尼文**：這三份文件是
客戶會簽名的正式商業文件，紙本的語言不該跟著登入 admin 當下切换的介面語言
變動——签字的客户看得懂印尼文，不代表懂 admin 恰好切到的英文/简体中文介面。
標籤直接寫死在 `web/app/admin/orders/[orderId]/documents/[documentId]/print/page.tsx`，
不經過 `Messages`，理由寫在該檔案的註解裡。系統介面本身（卡片/按鈕/表單提示）
仍然完整三語系，跟紙本內容是兩件事。

## Yang TIDAK diterjemahkan

- Nama merek: SANCI, Golden Home, dan nama partner/cabang lain
- Nomor pesanan (`GH-BSD-260817-0001`) dan kode partner/cabang/produk
- **Invoice** — di KETIGA bahasa, alasannya di atas
- **SO / DO** — di KETIGA bahasa (dokumen pesanan, 0016), alasan sama dengan Invoice
- **WhatsApp** — di ketiga bahasa
- **PIC** — tetap "PIC" di Bahasa Indonesia dan Inggris (sudah jadi kata
  sehari-hari), tapi di 中文 diterjemahkan jadi **负责人**: singkatan Inggris
  tiga huruf tidak langsung dimengerti pembaca Tiongkok, sedangkan "负责人"
  justru lebih cepat dipahami — kebalikan dari kasus Invoice.

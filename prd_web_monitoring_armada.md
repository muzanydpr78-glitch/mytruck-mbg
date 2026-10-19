# Product Requirement Document (PRD)
## Web Monitoring Armada

* **Versi Document:** 1.3
* **Status:** Approved / Finalized
* **Teknologi Backend & Database:** Google Apps Script (GAS) & Google Sheets
* **Teknologi Frontend:** HTML5, CSS3 (Bootstrap / Tailwind CSS), JavaScript (Fetch / Google Script API, Chart.js / ApexCharts, SheetJS / FileReader API)
* **Integrasi AI:** Google Gemini API via Google Apps Script (`UrlFetchApp`)

---

## 1. Ringkasan Projek & Tujuan

Sistem Web Monitoring Armada adalah platform aplikasi web internal berbasis Google Apps Script dan Google Sheets yang dirancang untuk membantu operasional logistik dalam memantau:

1. Status ketersediaan dan utilisasi armada secara *real-time*.
2. Kondisi armada standby, perawatan (KIR), dan perbaikan.
3. Laporan muatan operasional (Bukti Keluar Barang/BKB) dan muatan retur (Bukti Terima Barang/BTB).
4. Analisis eksekutif dan rekomendasi keputusan operasional berbasis kecerdasan buatan (AI).

---

## 2. Modul Autentikasi & Keamanan

### 2.1 Halaman Login & Keamanan Sesi

**Tampilan Antarmuka (UI):**
* Desain *clean* dan modern dengan branding "Monitoring Armada".
* Form Field: Username / Email dan Password.
* Checkbox: Ingat Saya (*Remember Me*).
* Toggle Show/Hide Password.
* Indikator Loading Spinner pada tombol Login.
* Pop-up / Alert Notifikasi untuk kegagalan autentikasi.

**Fitur Keamanan & Logika Backend:**
* **Password Hashing:** Password pengguna disimpan dalam bentuk hash di database.
* **Fitur "Ingat Saya" (Persistent Session):** 
  * Menyimpan *auth token* acak secara aman pada `LocalStorage` browser jika opsi ini dicentang.
  * Memungkinkan *auto-login* saat pengguna membuka kembali tautan web tanpa perlu memasukkan ulang kredensial.
* **Role-Based Access Control (RBAC):**
  * **Admin:** Akses penuh ke seluruh modul (Dashboard, Master Data, Import/Export, Konfigurasi User).
  * **Operator / Supervisor:** Akses Dashboard, Master Data (Input/Edit & Import/Export).
  * **Viewer / Management:** Akses Read-Only ke Dashboard & AI Insights.
* **Logout:** Menghapus token di `LocalStorage` dan merevokasi sesi aktif di backend.

---

## 3. Detail Modul Dashboard

### 3.1 Dashboard Armada

**Filter Utama:**
* Dropdown PT (All PT / PT Spesifik)
* Dropdown Nama Depo
* Dropdown Periode Bulan & Tahun

**Komponen & Visualisasi:**
1. **Summary Cards:** Total Armada, Total Armada Retail, Total Armada Dropping, Total Armada Standby (Termasuk Standby, KIR, Perbaikan).
2. **Progress Bar (Persentase Jenis Armada):** Menampilkan persentase tiap jenis kendaraan (contoh: Engkel Box, Grandmax Box, L300 Box, Ban Double Box, dll.) terhadap Total Armada berdasarkan filter PT.
3. **Bar Chart (Diagram Batang):** Distribusi Nama Depo vs Jumlah Armada.
4. **Pie Chart (Diagram Lingkaran):** Distribusi Tipe Muatan Armada (JUGS, SPS, MIX).

### 3.2 Dashboard Armada Standby

**Filter Utama:**
* Dropdown PT
* Dropdown Nama Depo
* Date Range Picker (Tanggal Mulai s/d Tanggal Selesai)

**Komponen & Visualisasi:**
1. **Summary Cards:** Total Armada, Total Armada Standby, Total Armada KIR, Total Armada Perbaikan, Average Harian (Rata-rata Harian Standby, KIR, Perbaikan).
2. **Tabel Matrix 1 (Summary by Depo):**
   * Baris: Nama Depo
   * Kolom: Tanggal terpilih dalam rentang
   * Nilai Cell: Total armada non-aktif/standby pada depo & tanggal tersebut.
   * Hover Callout (Tooltip): Menampilkan rincian detail saat kursor diarahkan ke cell (contoh: Standby: 2, Perbaikan: 1).
3. **Tabel Matrix 2 (Summary by Driver):**
   * Baris: Nama Driver
   * Kolom: Tanggal terpilih dalam rentang
   * Nilai Cell (Badge Status):
     * `S` (Biru) = Standby
     * `K` (Kuning) = KIR
     * `P` (Merah) = Perbaikan

### 3.3 Dashboard Muatan Armada

**Filter Utama:**
* Date Range Picker (Tanggal Mulai s/d Tanggal Selesai)
* Dropdown PT
* Dropdown Nama Depo
* Dropdown Jenis Pengiriman (Retail, Dropping)

**Komponen & Visualisasi:**
1. **Summary Cards:** Total In Box & Total In Jugs, Average Daily, Average In Box & Average In Jugs, Total Retur In Box & Total Retur In Jugs, Average Retur (In Box & In Jugs).
2. **Trendline Chart (Grafik Tren Mingguan):**
   * Grafik Kiri: Tren Muatan Weekly (In Box vs In Jugs)
   * Grafik Kanan: Tren Retur Weekly (Retur Box vs Retur Jugs)
3. **Tabel Matrix 1 (Summary by BKB - Bukti Keluar Barang):**
   * Baris: Nama Driver
   * Kolom: Tanggal terpilih
   * Nilai Cell: Total Muatan In Box (Teks/Badge Biru) dan Jugs (Teks/Badge Hijau).
4. **Tabel Matrix 2 (Summary by BTB - Bukti Terima Barang / Retur):**
   * Baris: Nama Driver
   * Kolom: Tanggal terpilih
   * Nilai Cell: Total Muatan Retur In Box (Teks/Badge Biru) dan Jugs (Teks/Badge Hijau).

---

## 4. Modul AI Executive Summary & Smart Insights

* **Penempatan Widget:** Card khusus di bagian atas setiap halaman Dashboard dengan tombol *"Generate AI Insight"*.
* **Fungsi Utama:**
  1. **Executive Summary:** Narasi ringkas otomatis berdasarkan data terfilter di dashboard untuk laporan pihak manajemen/supervisor.
  2. **Anomaly & Pattern Detection:** Mendeteksi keanehan data operasional (misal: lonjakan status perbaikan/KIR di depo tertentu, tren retur berlebih pada driver tertentu).
  3. **Operational Recommendation:** Usulan tindakan taktis (misal: pengalihan unit standby antar-depo).

---

## 5. Modul Master Data & Konfigurasi User

### 5.1 Master Armada & Master Standby Armada
* **Interaksi Input/Edit (Modal Dialog):** Proses Tambah Data (Create) dan Edit Data (Update) dilakukan menggunakan Modal Pop-Up tanpa berpindah halaman (*Single Page Experience*).
* **Fitur Export Excel:** Tombol *"Export to Excel"* untuk mengunduh data tabel ke format `.xlsx`.

### 5.2 Master Muatan (Import Dual Excel BKB & BTB)
* **Tampilan Antarmuka Upload (UI):**
  * Card 1 (BKB): Area Upload File BKB + Tombol Download Template BKB.
  * Card 2 (BTB): Area Upload File BTB + Tombol Download Template BTB.
* **Spesifikasi Pemrosesan & Database:**
  * **Tanpa Modal Create/Edit Manual:** Manipulasi data muatan sepenuhnya menggunakan import massal Excel.
  * **Penyimpanan:** Kedua file disimpan pada 1 Sheet Google Sheets (`DB_Muatan`).
  * **Kolom Identifikator:** Sistem secara otomatis menyisipkan kolom pertama (Kolom A) dengan nama `Jenis_Muatan` (berisi nilai "BKB" atau "BTB").
* **Fitur Export Excel:** Tombol *"Export to Excel"* untuk mengunduh seluruh data muatan terintegrasi ke format `.xlsx`.

### 5.3 Konfigurasi User & Manajemen User
* **Pengolahan Account:** Pengelolaan data akun (Username, Email, Role, Status Aktif).
* **Interaksi Modal Dialog:** Proses Tambah dan Edit User/Hak Akses menggunakan Modal Pop-Up tanpa melakukan navigasi/pindah halaman.

---

## 6. Matriks Fitur UI/UX & Akses Modul

| Halaman / Modul | Modal Create/Edit | Import Excel | Export Excel | Hak Akses Utama |
| :--- | :--- | :--- | :--- | :--- |
| Form Login (inc. "Ingat Saya") | - | - | - | Public (Unauthenticated) |
| Dashboard Armada | - | - | - | Admin, Operator, Viewer |
| Dashboard Armada Standby | - | - | - | Admin, Operator, Viewer |
| Dashboard Muatan Armada | - | - | - | Admin, Operator, Viewer |
| Master Armada | Ya (Modal Pop-up) | - | Ya (`.xlsx`) | Admin, Operator |
| Master Standby Armada | Ya (Modal Pop-up) | - | Ya (`.xlsx`) | Admin, Operator |
| Master Muatan | Tidak (Upload Only) | Ya (Dual UI: BKB & BTB) | Ya (`.xlsx`) | Admin, Operator |
| Manajemen User | Ya (Modal Pop-up) | - | - | Admin |
| Konfigurasi User | Ya (Modal Pop-up) | - | - | Admin |

---

## 7. Skema Arsitektur Database (Google Sheets)

Google Sheets akan bertindak sebagai *database relational* dengan tab-tab berikut:

1. **DB_Users:** `[User_ID, Username, Email, Password_Hash, Role, Status_Aktif, Remember_Token, Token_Expiry, Last_Login]`
2. **DB_Armada:** `[No, PT, Depo, Driver_ID, Nama_Driver, Vehicle_ID, Nopol, Jenis_Armada, Kapasitas, UOM, Tipe_Pengiriman]`
3. **DB_Standby:** `[Document_ID, tanggal, PT, Nama_Depo, Driver_ID, Nama_Driver, Nopol, Status, Created_by, Created_at, Updated_at, Updated_by]`
4. **DB_Muatan:** `[Jenis_Muatan, Document_ID, tanggal, Nama_Depo, Driver_ID, Nama_Driver, Vehicle_ID, Nopol, Product_ID, Nama_Product, QTY, Satuan, Keterangan, Created_dms_by, Uploaded_by, Upload_at]`
5. **DB_Logs:** `[Log_ID, Timestamp, User, Activity, Keterangan]`
# Panduan Integrasi Google Apps Script (GAS) & Google Sheets

Dokumen ini menjelaskan langkah-langkah *deployment* backend Google Apps Script dan sinkronisasi dengan Web Monitoring Armada (v1.3).

---

## 1. Persiapan Spreadsheet Google

1. Buat Google Spreadsheet baru di Google Drive Anda (misal beri nama: `DB_Monitoring_Armada`).
2. Buka menu **Extensions (Ekstensi)** > **Apps Script**.
3. Hapus kode default di editor, lalu *copy & paste* seluruh kode dari file `gas/Code.gs`.
4. Klik tombol **Save** (ikon disket).

---

## 2. Inisialisasi Database (5 Sheet Otomatis)

1. Di toolbar editor Apps Script, pilih fungsi `setupInitialSpreadsheet` dari dropdown fungsi.
2. Klik tombol **Run (Jalankan)**.
3. Berikan izin otorisasi (*Review Permissions* > *Pilih Akun* > *Advanced* > *Go to Untitled project (unsafe)* > *Allow*).
4. Kembali ke Google Spreadsheet Anda. Sistem secara otomatis telah membuat 5 sheet berikut beserta *header* dan *seed data*:
   - `DB_Users`
   - `DB_Armada`
   - `DB_Standby`
   - `DB_Muatan`
   - `DB_Logs`

---

## 3. Konfigurasi Google Gemini API (Opsional)

Untuk mengaktifkan fitur AI Executive Summary langsung dari Google Apps Script:
1. Buka menu **Project Settings** (ikon gerigi di sebelah kiri editor Apps Script).
2. Di bagian **Script Properties**, klik **Add script property**.
   - **Property:** `GEMINI_API_KEY`
   - **Value:** `[Masukkan API Key Google Gemini Anda]`
3. Klik **Save script properties**.

---

## 4. Deploy sebagai Web App

1. Di pojok kanan atas editor Apps Script, klik tombol **Deploy** > **New deployment**.
2. Klik ikon gerigi di samping *Select type*, pilih **Web app**.
3. Isi parameter deployment:
   - **Description:** `Web Monitoring Armada API v1.3`
   - **Execute as:** `Me (email@gmail.com)`
   - **Who has access:** `Anyone` (agar web frontend dapat memanggil API via AJAX/Fetch).
4. Klik **Deploy**.
5. Salin tautan **Web app URL** yang muncul (format: `https://script.google.com/macros/s/.../exec`).

---

## 5. Hubungkan ke Web Monitoring Armada

1. Buka aplikasi web `index.html`.
2. Masuk sebagai **Admin** (`admin` / `admin123`).
3. Buka menu **Konfigurasi & Logs**.
4. Tempelkan URL Web App pada kolom **Google Apps Script Web App URL**.
5. Pilih Mode Operasi Data: **Google Apps Script Live Sync**.
6. Klik **Simpan Konfigurasi**.

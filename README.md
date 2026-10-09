# Task Ledger

Mini Task Manager untuk tim internal. User dapat membuat task, memajukan status sesuai urutan, menghapus task, dan membaca riwayat perubahan status beserta actor dan waktunya.

## Menjalankan aplikasi

Prasyarat: Node.js 20+ dan pnpm 11.

```bash
pnpm install
pnpm dev
```

Bila sebelumnya `pnpm install` dijalankan saat workspace belum dikonfigurasi, jalankan lagi dari root proyek agar dependensi `client` dan `server` ikut terpasang.

Buka `http://localhost:5173`. Perintah tersebut menjalankan Express di port `3001` dan Vite di port `5173`. Untuk menjalankan secara terpisah, gunakan `pnpm --filter server dev` dan `pnpm --filter client dev` pada dua terminal. Vite meneruskan request `/api` ke Express.

## Situs belajar statis

Buka `study/index.html` langsung di browser. Tidak perlu server, pnpm, atau koneksi internet. Panduan berbahasa Indonesia ini membahas spesifikasi task, model data, transisi status, audit log, API, konsistensi, frontend, test, dan trade-off. Ada simulator status dan kuis untuk memeriksa pemahaman. Simulator berjalan sepenuhnya di browser dan tidak mengubah data aplikasi utama.

Perintah pemeriksaan:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Data lokal disimpan di `server/data/tasks.json` (dibuat otomatis dan tidak masuk Git). Dari folder `server`, lokasi dapat diubah dengan `DATA_FILE=/path/to/tasks.json`; port API dapat diubah dengan `PORT=3001`. Jika port API diubah, sesuaikan proxy pada `client/vite.config.ts`.

## Alur dan API

Status hanya dapat bergerak `to_do → pending → in_progress → done`, satu langkah per update. Pembuatan task selalu dimulai dari `to_do`. Actor dipilih dari daftar tetap di UI dan divalidasi oleh backend.

| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | `/api/actors` | Daftar actor |
| GET | `/api/tasks` | Daftar task aktif |
| GET | `/api/tasks?includeDeleted=true` | Daftar task aktif dan terhapus |
| POST | `/api/tasks` | Buat task, body `{ "title": "Prepare invoice" }` |
| PUT | `/api/tasks/:id/status` | Ubah status, body `{ "status": "pending", "actorId": "john.doe", "expectedStatus": "to_do" }` |
| DELETE | `/api/tasks/:id` | Tandai task terhapus |
| GET | `/api/tasks/:id/audit-logs` | Riwayat status, termasuk task terhapus |

`expectedStatus` opsional untuk klien API, tetapi UI selalu mengirimnya agar perubahan dari layar yang stale mendapat respons `409`. Update ke status yang sudah aktif mengembalikan `changed: false` dan tidak membuat log. Perpindahan yang melewati tahap atau mundur juga mendapat `409`.

## Arsitektur dan asumsi

- `client/`: React + TypeScript. Satu layar berisi form, daftar, pilihan actor, serta riwayat inline per task. Tab **Deleted** menjaga riwayat task yang dihapus tetap dapat dilihat.
- `server/src/app.ts`: endpoint HTTP dan validasi input. `domain.ts`: model dan nilai domain. `store.ts`: aturan transisi serta penyimpanan.
- Task minimal terdiri dari `id`, `title`, `status`, waktu pembuatan/perubahan, dan `deletedAt`. Field struktur minimum pada soal tidak terisi; saya memakai field tersebut karena cukup untuk fitur yang diminta.
- Hanya perubahan **status** yang dicatat sebagai audit log. Create dan delete tidak diberi log karena requirement audit meminta log untuk perubahan status. Delete memakai soft delete supaya log dan identitas task tidak hilang.
- Semua timestamp ISO 8601 UTC disimpan di backend, lalu ditampilkan dalam zona waktu browser. `sequence` yang meningkat menjaga urutan log saat beberapa perubahan memiliki timestamp sama.

## Konsistensi dan audit log

Setiap update membaca snapshot, memvalidasi transisi, lalu menulis status task **dan** satu audit log ke snapshot JSON yang sama. File sementara ditulis dan di-rename secara atomik. Dalam satu proses server, operasi file sinkron ini membuat update berurutan; kegagalan sebelum rename meninggalkan snapshot lama. Update ke status yang sama selesai tanpa penulisan.

Audit log tidak memiliki endpoint edit/delete. Kode update hanya menambah entri baru; soft delete tidak menyentuh entri lama. Test memeriksa urutan, idempotensi, transisi ilegal, persistensi setelah restart, dan riwayat setelah delete. Ini menjamin log tidak berubah melalui aplikasi selama file hanya diakses oleh proses ini. Admin yang dapat mengubah file JSON langsung masih dapat memodifikasi log; tidak ada jaminan antitamper kriptografis pada solusi ini.

## Trade-off dan risiko

File JSON membuat setup dan penjelasan solusi singkat. Ini cocok untuk demo atau satu proses dengan traffic kecil. **Risiko terbesar untuk banyak user** adalah beberapa proses/server membaca snapshot lama lalu saling menimpa hasilnya. Penulisan sinkron juga memblokir event loop sementara ukuran file terus bertambah. `expectedStatus` membantu mendeteksi layar stale, tetapi tidak memberi transaksi lintas proses.

Jika sistem membesar, bagian pertama yang saya refactor adalah `FileTaskStore` ke database transaksional (misalnya PostgreSQL): tabel task dan audit log dengan transaksi untuk update status + insert log, optimistic locking/version pada task, dan izin database yang melarang update/delete pada log. Lapisan API dan UI dapat dipertahankan sebagian besar. Sesudah itu saya akan menambah pagination untuk task/log, autentikasi actor, dan pengujian integrasi multi-user.

## Penggunaan AI

AI membantu menyusun struktur proyek, implementasi awal React/Express, situs belajar statis, test, dan README. Saya memvalidasi aplikasi dengan typecheck backend/frontend, build backend/frontend, serta test aturan domain. Untuk situs belajar, saya memeriksa sintaks JavaScript, tautan/ID HTML, dan menguji alur simulator serta kuis dengan DOM tiruan. Test integrasi API juga disediakan di `server/test/api.test.ts`; lingkungan pengerjaan ini menolak pembukaan port loopback, sehingga test tersebut perlu dijalankan di lingkungan biasa. Semua asumsi dan batasan teknis yang tersisa tercatat di atas dan harus dapat saya jelaskan saat review.

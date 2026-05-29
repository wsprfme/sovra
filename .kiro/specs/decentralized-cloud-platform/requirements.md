# Requirements Document

## Introduction

Proyek ini adalah platform cloud **self-hosted dan modular** yang bersifat open source. Platform di-deploy pada satu server milik pengguna (selalu menyala, memiliki IPv4 publik langsung pada interface jaringan tanpa NAT) dan diakses melalui **aplikasi web**.

Arsitektur platform terdiri dari dua lapis:

1. **Core Platform** — kerangka aplikasi web, identitas/autentikasi, sistem ekstensi, dan **Storage_Module** (penyimpanan file dan foto bergaya Google Drive/Photos) sebagai modul bawaan default yang selalu tersedia.
2. **Extensions** — kapabilitas tambahan yang dapat dipasang, diaktifkan, dan dinonaktifkan oleh pengguna. Pada rilis awal disediakan dua ekstensi resmi (first-party): **Web_Hosting_Extension** (hosting situs web statis dengan custom domain) dan **VPS_Extension** (kontrol VPS eksternal melalui SSH).

Sifat self-sovereign dijaga melalui identitas berbasis kunci kriptografi, enkripsi konten privat di sisi klien, dan content addressing (CID) untuk integritas serta deduplikasi. Server berperan sebagai source of truth.

Dokumen ini hanya membahas APA yang harus dilakukan sistem (problem space). Pilihan teknologi konkret (framework web, reverse proxy, database, dst.) ditangguhkan ke fase Design dan akan dipilih dengan referensi dokumentasi terbaru.

### Cakupan Rilis (Scope)

- **Termasuk MVP:** Core Platform (instalasi, first-run setup, identitas/autentikasi, sistem ekstensi, web client) + Storage_Module bawaan (file, foto, album, berbagi, enkripsi isi file) + dua ekstensi first-party (Web_Hosting_Extension untuk **hosting situs statis**, VPS_Extension).
- **Di luar MVP (ditunda):** aplikasi desktop (Windows/Linux), aplikasi mobile PWA, federasi/replikasi multi-node, multi-tenant, dan **hosting aplikasi dinamis** (App_Runtime_Extension — menjalankan proses Node/SSR per situs dengan isolasi container). Hosting dinamis direncanakan sebagai ekstensi terpisah di masa depan, bukan bagian MVP.

### Keputusan Teknologi yang Sudah Disepakati (akan difinalkan di Design)

- **Rendering dashboard:** pola Backend-for-Frontend (server-side data fetching / Server Components) agar tampilan ter-render dengan data awal saat reload dan API internal tidak terekspos langsung; data live (chart, status real-time) tetap diambil di klien melalui koneksi real-time. Isi file privat selalu didekripsi di sisi klien.
- **Reverse proxy:** Caddy dipilih sebagai default karena dukungan TLS on-demand untuk domain arbitrer; lapisan proxy dirancang abstrak agar dapat diganti (mis. nginx) oleh pengadopsi lain.
- **Hosting MVP:** statis saja. Output build modern (Vite, Astro, Next.js export, dll.) tetap didukung karena hasilnya berupa file statis.

### Asumsi Kerja (untuk diiterasi)

- A1. Deployment awal bersifat single-user: pemilik server adalah satu-satunya pengguna terotentikasi. Pengguna dapat memilih mode autentikasi tradisional (username/password) atau berbasis key pair kriptografi.
- A2. Konten disimpan pada content-store lokal di server menggunakan content addressing (CID) untuk integritas dan deduplikasi. Distribusi P2P/DHT lintas node bukan bagian MVP.
- A3. Custom domain (disediakan oleh Web_Hosting_Extension) dipetakan melalui reverse proxy pada IPv4 publik server, dengan routing berdasarkan Host header dan penerbitan sertifikat TLS otomatis (ACME/Let's Encrypt). Pengguna mengarahkan DNS domainnya ke server.
- A4. VPS_Extension mengontrol VPS/host eksternal yang sudah ada milik pengguna melalui SSH (kredensial dimasukkan pengguna), bukan menyediakan VPS baru.
- A5. Klien adalah aplikasi web yang berjalan di browser modern; tidak ada klien desktop atau PWA pada MVP.
- A6. Penyimpanan dibatasi oleh kapasitas disk server (Quota dapat dikonfigurasi di bawah kapasitas fisik).
- A7. Karena sumber daya server modest (CPU dan RAM kelas menengah), Design SHALL memprioritaskan footprint ringan (mis. proses tunggal, database embedded) dibanding tumpukan layanan berat.
- A8. Karena platform open source, ekstensi pihak ketiga dimungkinkan; oleh karena itu setiap ekstensi SHALL mendeklarasikan permission yang dibutuhkannya secara eksplisit.
- A9. Enkripsi konten berlaku pada **isi (byte) File_Object**. Metadata (nama, path, ukuran, tipe MIME, struktur album) dapat dibaca server agar dashboard dapat di-render server-side; konsekuensi privasi metadata diterima karena server milik pengguna sendiri.

## Glossary

- **Core_Platform**: Kerangka aplikasi web inti yang menyediakan identitas, sistem ekstensi, dan modul bawaan.
- **Storage_Module**: Modul bawaan Core_Platform yang menyimpan dan mengelola file dan foto pengguna. Selalu tersedia dan tidak dapat dinonaktifkan.
- **Extension**: Paket kapabilitas tambahan yang dapat dipasang ke Core_Platform, mendeklarasikan metadata dan permission melalui Extension_Manifest.
- **Extension_Manifest**: Dokumen terstruktur milik sebuah Extension yang mendeklarasikan id, nama, versi, permission yang dibutuhkan, dan kontribusi (rute API dan elemen antarmuka).
- **Extension_Registry**: Komponen Core_Platform yang mencatat ekstensi yang terpasang beserta status aktif/nonaktifnya.
- **Web_Hosting_Extension**: Ekstensi first-party yang menerima, menyimpan, dan menyajikan situs web statis serta mengelola custom domain.
- **VPS_Extension**: Ekstensi first-party yang mengontrol VPS eksternal milik pengguna melalui SSH.
- **Auth_Module**: Komponen Core_Platform yang mengelola identitas, autentikasi, dan otorisasi. Mendukung dua mode: tradisional (username/password) dan key pair kriptografi.
- **Auth_Mode**: Pilihan metode autentikasi pengguna, bernilai "password" atau "keypair".
- **Installer**: Komponen/skrip yang memasang Core_Platform beserta dependensinya (runtime, reverse proxy, service) pada server dalam satu prosedur.
- **Setup_Wizard**: Alur first-run yang dijalankan setelah instalasi untuk mengonfigurasi akun admin, mode autentikasi, dan domain utama platform.
- **Primary_Domain**: Domain utama tempat dashboard Core_Platform diakses, ditetapkan saat Setup_Wizard.
- **Permission**: Hak akses spesifik (mis. baca/tulis storage, mengikat port jaringan, koneksi keluar SSH) yang harus diberikan kepada Extension sebelum kapabilitas terkait dapat dijalankan.
- **Network_Layer**: Komponen server yang menangani penyimpanan konten beralamat CID pada content-store lokal.
- **Content_Store**: Penyimpanan fisik konten beralamat CID pada disk server.
- **CID**: Content Identifier; pengenal konten yang berasal dari hash kriptografi konten itu sendiri.
- **File_Object**: Satu file (termasuk foto) yang dikelola Storage_Module, diidentifikasi oleh CID dan metadata.
- **Album**: Koleksi File_Object foto yang dikelompokkan oleh pengguna.
- **Share_Link**: URL yang memberikan akses ke File_Object atau Album ke pihak yang ditunjuk.
- **Quota**: Batas ukuran data yang boleh disimpan pengguna, dikonfigurasi di bawah kapasitas disk server.
- **Content_Visibility**: Sifat keterbacaan **isi** konten, bernilai "public" atau "private" (isi terenkripsi). Metadata File_Object tetap dapat dibaca server pada kedua nilai.
- **Content_Key**: Kunci simetris untuk mengenkripsi/mendekripsi **isi** konten privat. Pada Auth_Mode "password" diturunkan dari password melalui fungsi key-derivation; pada Auth_Mode "keypair" diturunkan dari kunci identitas.
- **Web_Client**: Aplikasi web Core_Platform yang dijalankan di browser modern; satu-satunya klien pada MVP.
- **Reverse_Proxy**: Komponen (digunakan oleh Web_Hosting_Extension) yang menerima permintaan HTTP/HTTPS pada IPv4 publik, mengarahkannya berdasarkan Host header, dan menerbitkan sertifikat TLS otomatis.
- **Site_Manifest**: Dokumen terstruktur yang mendeskripsikan satu situs (CID konten per path, domain, versi, timestamp).
- **Site_Manifest_Parser**: Komponen yang membaca Site_Manifest dari string ke representasi objek.
- **Site_Manifest_Printer**: Komponen yang menulis representasi objek Site_Manifest kembali ke string.
- **Custom_Domain**: Nama domain milik pengguna yang dipetakan ke satu situs di Web_Hosting_Extension.
- **TLS_Strategy**: Metode penerbitan sertifikat TLS untuk satu Custom_Domain, bernilai "http-01" (verifikasi via port 80/TLS-ALPN untuk domain yang menunjuk langsung ke server), "dns-01" (verifikasi via DNS, cocok untuk domain di belakang proxy Cloudflare), atau "cloudflare-origin" (memasang Cloudflare Origin Certificate pada origin).
- **Cloudflare_Integration**: Komponen Web_Hosting_Extension yang berkomunikasi dengan Cloudflare API untuk mengelola DNS record, status proxy, dan sertifikat origin atas nama pengguna.
- **Cloudflare_API_Token**: Token API Cloudflare bercakupan terbatas yang diberikan pengguna agar Cloudflare_Integration dapat mengelola zona DNS terkait.
- **VPS_Connection**: Konfigurasi koneksi (host, port, kredensial SSH) yang digunakan VPS_Extension untuk mengontrol satu VPS eksternal.

## Requirements

---

## A. Core Platform

### Requirement 1: Identitas dan Autentikasi

**User Story:** Sebagai pemilik server, saya ingin mengakses platform dengan metode autentikasi yang saya pilih sendiri, agar saya nyaman menggunakannya sesuai preferensi keamanan saya.

#### Acceptance Criteria

1. WHEN pengguna menyiapkan akun pada Setup_Wizard, THE Auth_Module SHALL menawarkan dua Auth_Mode: "password" (username dan kata sandi) dan "keypair" (key pair kriptografi).
2. WHERE Auth_Mode "password" dipilih, THE Auth_Module SHALL menyimpan verifier kata sandi menggunakan fungsi hash kata sandi yang aman (mis. Argon2/bcrypt) dan tidak pernah menyimpan kata sandi dalam bentuk plaintext.
3. WHERE Auth_Mode "keypair" dipilih, THE Auth_Module SHALL menghasilkan key pair, menyimpan kunci privat di sisi klien, dan menampilkan frasa pemulihan untuk dicadangkan pengguna.
4. WHERE Auth_Mode "keypair" dipilih dan pengguna memilih impor identitas, THE Auth_Module SHALL menerima frasa pemulihan dan merekonstruksi key pair yang sama.
5. WHEN pengguna berhasil terautentikasi, THE Auth_Module SHALL menerbitkan sesi terotorisasi yang digunakan untuk operasi berikutnya.
6. IF permintaan terhadap operasi terproteksi tidak menyertakan sesi atau tanda tangan yang valid, THEN THE Auth_Module SHALL menolak operasi dan mengembalikan kode error "unauthorized".
7. THE Auth_Module SHALL menurunkan Content_Key untuk enkripsi isi konten dari kredensial pengguna (password melalui key-derivation, atau kunci identitas pada mode keypair) dan tidak pernah menyimpan Content_Key tersebut dalam bentuk plaintext secara persisten.
8. WHERE Auth_Mode "keypair" dipilih, THE Auth_Module SHALL tidak pernah mengirim kunci privat pengguna ke server.
9. WHEN pengguna membuka kembali Web_Client pada browser yang sama dan sesi masih berlaku, THE Auth_Module SHALL memulihkan sesi tanpa mengharuskan login ulang.

### Requirement 2: Instalasi dan First-Run Setup

**User Story:** Sebagai pemilik server, saya ingin memasang platform dengan cepat dan dipandu mengonfigurasinya saat pertama dijalankan, agar saya bisa langsung menggunakannya tanpa konfigurasi manual yang rumit.

#### Acceptance Criteria

1. THE Installer SHALL memasang Core_Platform beserta dependensi yang diperlukan (runtime, reverse proxy, dan service yang berjalan saat boot) melalui satu prosedur instalasi.
2. WHEN Installer selesai, THE Installer SHALL menyediakan integritas paket yang dapat diverifikasi (mis. checksum) sebelum eksekusi sehingga pengguna dapat memvalidasi sumber.
3. WHEN platform dijalankan pertama kali dan belum ada akun admin, THE Setup_Wizard SHALL mewajibkan pembuatan satu akun admin sebelum fitur lain dapat diakses.
4. WHEN pengguna menyelesaikan Setup_Wizard, THE Setup_Wizard SHALL meminta dan menyimpan Auth_Mode pilihan pengguna beserta kredensial admin terkait.
5. WHEN pengguna menyelesaikan Setup_Wizard, THE Setup_Wizard SHALL meminta Primary_Domain untuk akses dashboard dan menampilkan instruksi DNS yang diperlukan.
6. WHILE Setup_Wizard belum diselesaikan, THE Core_Platform SHALL menolak akses ke seluruh fungsi selain Setup_Wizard.
7. WHEN Setup_Wizard selesai, THE Core_Platform SHALL mengaktifkan reverse proxy untuk menyajikan dashboard pada Primary_Domain melalui HTTPS.

### Requirement 3: Sistem Ekstensi

**User Story:** Sebagai pengguna, saya ingin menambah atau mengurangi kapabilitas platform melalui ekstensi, agar saya hanya menjalankan fitur yang saya butuhkan dan menjaga server tetap ringan.

#### Acceptance Criteria

1. THE Core_Platform SHALL menyediakan Storage_Module sebagai modul bawaan yang selalu aktif dan tidak dapat dinonaktifkan atau dihapus.
2. WHEN pengguna memasang sebuah Extension, THE Extension_Registry SHALL membaca Extension_Manifest dan mencatat ekstensi tersebut dalam status "installed" dan "disabled".
3. IF Extension_Manifest tidak valid atau tidak memuat field wajib (id, nama, versi, permission), THEN THE Extension_Registry SHALL menolak pemasangan dan mengembalikan kode error "invalid_extension_manifest".
4. WHEN pengguna mengaktifkan sebuah Extension, THE Extension_Registry SHALL menampilkan daftar Permission yang diminta ekstensi dan meminta persetujuan eksplisit pengguna sebelum mengaktifkannya.
5. WHILE sebuah Extension berstatus "disabled" atau tidak terpasang, THE Core_Platform SHALL tidak menjalankan kode ekstensi tersebut dan tidak menampilkan rute API maupun elemen antarmukanya.
6. WHEN sebuah Extension aktif, THE Core_Platform SHALL hanya mengizinkan ekstensi mengakses kapabilitas yang sesuai dengan Permission yang telah disetujui.
7. IF sebuah Extension aktif mengalami kegagalan saat dijalankan, THEN THE Core_Platform SHALL mengisolasi kegagalan tersebut sehingga Storage_Module dan ekstensi lain tetap berfungsi.
8. WHEN pengguna menghapus sebuah Extension, THE Extension_Registry SHALL menghentikan ekstensi dan menghapus pendaftarannya, sambil mempertahankan data pengguna yang dihasilkan ekstensi kecuali pengguna meminta penghapusan data tersebut.
9. WHEN pengguna melihat daftar ekstensi, THE Core_Platform SHALL menampilkan id, nama, versi, status (installed/enabled/disabled), dan Permission yang diminta setiap ekstensi.

### Requirement 4: Penyimpanan File gaya Drive (Storage_Module)

**User Story:** Sebagai pengguna, saya ingin menyimpan file dalam struktur folder dan menemukannya kembali, agar dapat menggunakan platform sebagai pengganti penyimpanan cloud konvensional.

#### Acceptance Criteria

1. WHEN pengguna mengunggah file, THE Storage_Module SHALL menyimpan file sebagai File_Object dengan CID, nama, ukuran byte, tipe MIME, dan timestamp upload.
2. WHEN pengguna membuat folder pada path P yang valid, THE Storage_Module SHALL mencatat folder tersebut sebagai bagian dari hierarki milik pengguna.
3. WHEN pengguna memindahkan File_Object dari path A ke path B, THE Storage_Module SHALL memperbarui referensi path tanpa mengubah CID dari File_Object.
4. WHEN pengguna menghapus File_Object, THE Storage_Module SHALL memindahkan File_Object ke status "trashed" selama 30 hari sebelum penghapusan permanen.
5. WHEN pengguna memulihkan File_Object dari "trashed" sebelum 30 hari berakhir, THE Storage_Module SHALL mengembalikan File_Object ke path semula jika masih ada, atau ke path root jika tidak ada.
6. THE Storage_Module SHALL menjamin bahwa dua unggahan dengan konten byte identik menghasilkan CID yang sama.
7. IF total ukuran File_Object milik pengguna setelah upload akan melebihi Quota, THEN THE Storage_Module SHALL menolak upload dan mengembalikan kode error "quota_exceeded".

### Requirement 5: Pengelolaan Foto dan Album (Storage_Module)

**User Story:** Sebagai pengguna, saya ingin mengelompokkan foto ke dalam album dan melihat thumbnail-nya, agar pengalaman serupa dengan Google Photos.

#### Acceptance Criteria

1. WHEN sebuah File_Object dengan tipe MIME "image/*" disimpan, THE Storage_Module SHALL menghasilkan thumbnail dan menyimpannya sebagai File_Object terpisah dengan referensi ke File_Object asli.
2. WHEN pengguna membuat Album, THE Storage_Module SHALL menyimpan Album sebagai daftar referensi ke File_Object foto tanpa menggandakan konten foto.
3. WHEN pengguna menambahkan File_Object foto ke Album yang sama lebih dari satu kali, THE Storage_Module SHALL menyimpan paling banyak satu referensi ke File_Object tersebut di Album itu.
4. WHEN pengguna menghapus File_Object foto yang tercantum di satu atau lebih Album, THE Storage_Module SHALL menghapus referensi foto tersebut dari setiap Album terkait.

### Requirement 6: Berbagi File dan Album (Storage_Module)

**User Story:** Sebagai pengguna, saya ingin membagikan file atau album dengan kontrol akses, agar dapat berkolaborasi tanpa kehilangan kepemilikan data.

#### Acceptance Criteria

1. WHEN pengguna meminta Share_Link untuk satu File_Object atau Album, THE Storage_Module SHALL menghasilkan URL unik yang merujuk ke konten yang dibagikan.
2. WHERE Share_Link dibuat dengan opsi "public", THE Storage_Module SHALL mengizinkan akses tanpa autentikasi melalui URL tersebut.
3. WHERE Share_Link dibuat dengan opsi "restricted", THE Storage_Module SHALL hanya mengizinkan akses dari identitas yang ditunjuk oleh pemilik.
4. WHERE Share_Link dibuat dengan masa berlaku T detik, THE Storage_Module SHALL menolak akses melalui URL tersebut setelah T detik berlalu sejak pembuatan.
5. WHEN pengguna mencabut Share_Link, THE Storage_Module SHALL menolak akses berikutnya melalui URL tersebut dengan status HTTP 410.

### Requirement 7: Penyimpanan Konten dan Integritas

**User Story:** Sebagai pemilik server, saya ingin konten disimpan dengan integritas terverifikasi dan tanpa duplikasi, agar penggunaan disk efisien dan konten tidak dapat dirusak diam-diam.

#### Acceptance Criteria

1. WHEN konten baru dipublikasikan, THE Network_Layer SHALL mengaitkan konten dengan CID-nya dan menyimpannya pada Content_Store.
2. WHEN klien meminta konten berdasarkan CID, THE Network_Layer SHALL mengembalikan byte yang hash-nya cocok dengan CID tersebut.
3. IF byte yang tersimpan untuk suatu CID tidak lagi cocok dengan CID-nya saat dibaca, THEN THE Network_Layer SHALL mengembalikan kode error "content_corrupted" dan tidak menyajikan byte yang rusak.
4. THE Network_Layer SHALL menjamin bahwa dua publikasi dengan byte identik menghasilkan CID yang sama dan disimpan sebagai satu salinan fisik (deduplikasi).
5. WHILE penggunaan disk belum melampaui Quota, THE Network_Layer SHALL menjaga ketersediaan setiap CID milik pengguna.

### Requirement 8: Privasi dan Enkripsi Isi Konten

**User Story:** Sebagai pengguna yang menyimpan file dan foto pribadi, saya ingin isi file saya tidak dapat dibaca oleh pihak lain yang mengakses disk server, agar privasi tetap terjaga, sementara metadata tetap dapat dibaca server untuk pengalaman dashboard yang responsif.

#### Acceptance Criteria

1. WHEN pengguna mengunggah File_Object dengan Content_Visibility "private", THE Storage_Module SHALL mengenkripsi isi (byte) file menggunakan Content_Key di sisi klien sebelum byte diserahkan ke server.
2. WHEN pengguna mengakses isi File_Object privat miliknya, THE Storage_Module SHALL mendekripsi isi menggunakan Content_Key di sisi klien setelah byte diterima dari server.
3. THE Storage_Module SHALL menetapkan Content_Visibility default "private" untuk setiap File_Object yang diunggah.
4. THE Storage_Module SHALL menyimpan metadata File_Object (nama, path, ukuran, tipe MIME, timestamp, keanggotaan album) dalam bentuk yang dapat dibaca server, terpisah dari isi terenkripsi.
5. WHEN pengguna membuat Share_Link "public" untuk File_Object privat, THE Storage_Module SHALL menyertakan Content_Key yang diperlukan di dalam Share_Link sehingga penerima dapat mendekripsi isi, tanpa mengungkap kredensial autentikasi pengguna.
6. THE Storage_Module SHALL tidak pernah menyimpan Content_Key dalam bentuk plaintext secara persisten di server.

### Requirement 9: Klien Web

**User Story:** Sebagai pengguna, saya ingin mengakses platform dari browser tanpa instalasi, agar dapat menggunakan layanan dari perangkat manapun.

#### Acceptance Criteria

1. THE Web_Client SHALL berjalan pada versi stabil terbaru dari Chromium, Firefox, dan WebKit.
2. THE Web_Client SHALL menyediakan akses ke Storage_Module dan ke setiap Extension yang sedang aktif dalam satu antarmuka terpadu.
3. WHEN pengguna pertama kali membuka Web_Client, THE Web_Client SHALL menjalankan Auth_Module di sisi klien sehingga kunci privat tidak meninggalkan browser pengguna.
4. WHEN sebuah Extension aktif menyumbang elemen antarmuka, THE Web_Client SHALL menampilkan elemen tersebut hanya selama ekstensi terkait aktif.
5. THE Web_Client SHALL menyajikan antarmuka yang dapat digunakan pada layar dengan lebar minimum 320 piksel CSS (responsif).

### Requirement 10: Penanganan Error

**User Story:** Sebagai pengguna, saya ingin mendapat umpan balik yang jelas ketika terjadi kesalahan, agar saya tahu apa yang terjadi dan tindakan apa yang mungkin.

#### Acceptance Criteria

1. IF operasi gagal karena error yang dapat diulang (mis. gangguan jaringan sementara), THEN THE Web_Client SHALL mencoba ulang dengan backoff eksponensial sampai maksimum lima percobaan.
2. IF operasi gagal karena error yang tidak dapat diulang, THEN THE Web_Client SHALL menampilkan pesan error spesifik dan tidak mencoba ulang.
3. WHEN pengguna meminta detail error, THE Web_Client SHALL menampilkan kode error, deskripsi singkat, dan timestamp kejadian.
4. WHEN unggahan file terganggu sebelum selesai, THE Storage_Module SHALL tidak menyimpan File_Object parsial dan mengembalikan kode error "upload_incomplete".

### Requirement 11: Backup dan Restore

**User Story:** Sebagai pemilik server, saya ingin mencadangkan dan memulihkan seluruh data platform, agar saya tidak kehilangan file, foto, dan konfigurasi jika terjadi kegagalan disk atau migrasi server.

#### Acceptance Criteria

1. WHEN pengguna meminta backup, THE Core_Platform SHALL menghasilkan satu artefak backup yang memuat metadata, Content_Store, dan konfigurasi platform (termasuk daftar ekstensi yang terpasang).
2. THE Core_Platform SHALL menyertakan informasi versi skema data di dalam artefak backup.
3. WHEN pengguna memulihkan dari artefak backup yang valid, THE Core_Platform SHALL mengembalikan metadata, Content_Store, dan konfigurasi ke keadaan saat backup dibuat.
4. IF artefak backup memiliki versi skema yang lebih baru daripada yang didukung instalasi saat ini, THEN THE Core_Platform SHALL menolak restore dan mengembalikan kode error "backup_version_unsupported".
5. WHERE pengguna mengonfigurasi jadwal backup otomatis, THE Core_Platform SHALL membuat artefak backup sesuai jadwal tanpa intervensi manual.
6. THE Core_Platform SHALL tidak memasukkan Content_Key maupun kredensial dalam bentuk plaintext ke dalam artefak backup.

### Requirement 12: Audit Log

**User Story:** Sebagai pemilik server, saya ingin melihat catatan tindakan penting yang terjadi pada platform, agar saya dapat mengaudit aktivitas dan mendeteksi penyalahgunaan.

#### Acceptance Criteria

1. WHEN sebuah tindakan administratif terjadi (login, perubahan kredensial, pemasangan/penghapusan/aktivasi ekstensi, perubahan custom domain, pembuatan/pencabutan Share_Link), THE Core_Platform SHALL mencatat entri audit berisi jenis tindakan, identitas pelaku, timestamp, dan hasil.
2. THE Core_Platform SHALL menyimpan entri audit secara append-only sehingga entri yang sudah tercatat tidak dapat diubah melalui antarmuka aplikasi.
3. WHEN pengguna meninjau audit log, THE Core_Platform SHALL menampilkan entri terurut berdasarkan waktu dan dapat difilter berdasarkan jenis tindakan.
4. THE Core_Platform SHALL tidak mencatat nilai rahasia (kata sandi, token, kunci) ke dalam entri audit.

### Requirement 13: Rate Limiting pada Endpoint Publik

**User Story:** Sebagai pemilik server, saya ingin endpoint yang dapat diakses publik dibatasi lajunya, agar server saya terlindung dari penyalahgunaan dan beban berlebih.

#### Acceptance Criteria

1. WHILE permintaan ke endpoint publik (akses Share_Link, situs yang di-host, dan endpoint autentikasi) melampaui ambang laju yang dikonfigurasi dari satu sumber, THE Core_Platform SHALL menolak permintaan berlebih dengan status HTTP 429.
2. WHEN permintaan ditolak karena rate limit, THE Core_Platform SHALL menyertakan header yang menunjukkan kapan permintaan dapat dicoba kembali.
3. THE Core_Platform SHALL menyediakan ambang rate limit yang dapat dikonfigurasi oleh pemilik server.
4. WHEN percobaan autentikasi gagal berulang kali dari satu sumber melampaui ambang, THE Auth_Module SHALL menerapkan penundaan atau penguncian sementara terhadap sumber tersebut.

---

## B. Web_Hosting_Extension

### Requirement 14: Hosting Situs Web Statis

**User Story:** Sebagai pemilik situs, saya ingin mengunggah situs web statis dan membuatnya dapat diakses publik, agar tidak perlu mengelola server tradisional.

#### Acceptance Criteria

1. WHILE Web_Hosting_Extension tidak aktif, THE Core_Platform SHALL tidak menampilkan kapabilitas hosting apapun kepada pengguna.
2. WHEN pengguna mengunggah satu direktori berisi file situs statis (termasuk hasil build dari Vite, Astro, Next.js export, atau generator statis lain), THE Web_Hosting_Extension SHALL menyimpan setiap file sebagai konten beralamat CID dan menghasilkan satu Site_Manifest baru yang merujuk file-file tersebut.
3. WHEN Site_Manifest baru disimpan, THE Web_Hosting_Extension SHALL mengembalikan URL yang dapat digunakan untuk mengakses situs tersebut.
4. WHEN pengguna mengunggah versi baru dari situs yang sudah ada, THE Web_Hosting_Extension SHALL membuat Site_Manifest baru tanpa menghapus Site_Manifest sebelumnya milik situs yang sama.
5. WHEN pengguna meminta rollback ke Site_Manifest sebelumnya, THE Web_Hosting_Extension SHALL menjadikan Site_Manifest tersebut sebagai versi aktif tanpa kehilangan Site_Manifest lain.
6. WHILE sebuah Site_Manifest aktif, THE Web_Hosting_Extension SHALL menyajikan file situs hanya jika hash file yang disajikan sama dengan CID yang tercantum di Site_Manifest.
7. IF file yang diminta tidak terdapat di Site_Manifest aktif, THEN THE Web_Hosting_Extension SHALL mengembalikan status HTTP 404.
8. WHEN konten situs disajikan, THE Web_Hosting_Extension SHALL memperlakukan konten sebagai Content_Visibility "public" dan tidak mengenkripsinya.
9. THE Web_Hosting_Extension SHALL menyajikan konten statis saja dan tidak menjalankan proses aplikasi sisi-server (mis. Node SSR) per situs; hosting aplikasi dinamis berada di luar cakupan ekstensi ini.

### Requirement 15: Site_Manifest sebagai Format yang Dapat Diparse dan Dicetak Ulang

**User Story:** Sebagai pengembang, saya ingin Site_Manifest memiliki format tekstual yang konsisten, agar dapat diaudit, di-version, dan dipertukarkan.

#### Acceptance Criteria

1. WHEN sebuah string manifest valid diberikan, THE Site_Manifest_Parser SHALL menghasilkan objek Site_Manifest dengan field domain, daftar entri (path, CID), versi, dan timestamp.
2. IF string manifest tidak sesuai grammar Site_Manifest, THEN THE Site_Manifest_Parser SHALL mengembalikan error yang menyebutkan posisi baris dan kolom kesalahan.
3. THE Site_Manifest_Printer SHALL mengubah objek Site_Manifest valid menjadi string yang sesuai grammar Site_Manifest.
4. FOR ALL objek Site_Manifest valid m, THE pasangan Site_Manifest_Parser dan Site_Manifest_Printer SHALL memenuhi properti round-trip sehingga parse(print(m)) menghasilkan objek yang ekuivalen dengan m.
5. FOR ALL string manifest valid s yang dihasilkan oleh Site_Manifest_Printer, THE pasangan Site_Manifest_Parser dan Site_Manifest_Printer SHALL memenuhi properti round-trip sehingga print(parse(s)) menghasilkan string yang ekuivalen dengan s.

### Requirement 16: Pemetaan Custom Domain per Situs

**User Story:** Sebagai pemilik situs, saya ingin mengaitkan domain milik saya sendiri dengan situs di platform, agar pengunjung dapat mengaksesnya melalui domain saya.

#### Acceptance Criteria

1. WHEN pengguna mendaftarkan Custom_Domain pada satu situs, THE Web_Hosting_Extension SHALL mencatat pemetaan domain → Site_Manifest aktif untuk situs tersebut.
2. WHEN Reverse_Proxy menerima permintaan HTTP yang Host header-nya adalah Custom_Domain terdaftar, THE Web_Hosting_Extension SHALL menyajikan konten dari Site_Manifest aktif yang dipetakan ke domain tersebut.
3. WHEN pengguna mendaftarkan Custom_Domain, THE Web_Hosting_Extension SHALL menampilkan instruksi konfigurasi DNS (record dan nilai yang harus dibuat).
4. WHILE Custom_Domain belum diverifikasi melalui DNS, THE Web_Hosting_Extension SHALL menandai pemetaan sebagai "pending" dan tidak menyajikan konten melalui domain tersebut.
5. WHEN verifikasi DNS untuk Custom_Domain berhasil, THE Web_Hosting_Extension SHALL memilih TLS_Strategy yang sesuai, menerbitkan/memasang sertifikat TLS melalui Reverse_Proxy, mengubah status pemetaan menjadi "active", dan mulai menyajikan konten melalui domain tersebut.
6. WHERE Custom_Domain menunjuk langsung ke IPv4 server, THE Web_Hosting_Extension SHALL menggunakan TLS_Strategy "http-01".
7. WHERE Custom_Domain berada di belakang proxy Cloudflare dan Cloudflare_Integration aktif, THE Web_Hosting_Extension SHALL menggunakan TLS_Strategy "dns-01" atau "cloudflare-origin".
8. IF Custom_Domain yang sama sudah dipetakan ke situs lain, THEN THE Web_Hosting_Extension SHALL menolak pendaftaran dan mengembalikan kode error "domain_conflict".
9. WHEN pengguna mengganti situs target untuk Custom_Domain miliknya, THE Web_Hosting_Extension SHALL memperbarui pemetaan tanpa mengubah status verifikasi DNS yang sudah aktif.

### Requirement 17: Integrasi Cloudflare

**User Story:** Sebagai pemilik situs yang menggunakan Cloudflare, saya ingin platform terhubung ke akun Cloudflare saya, agar DNS dan TLS untuk custom domain dikelola otomatis tanpa konfigurasi manual.

#### Acceptance Criteria

1. WHEN pengguna memberikan Cloudflare_API_Token, THE Cloudflare_Integration SHALL memverifikasi token dan zona DNS yang dapat diaksesnya sebelum menyimpan token dalam bentuk terenkripsi.
2. THE Cloudflare_Integration SHALL tidak menyimpan Cloudflare_API_Token dalam bentuk plaintext pada penyimpanan persisten.
3. WHEN pengguna menambahkan Custom_Domain yang zonanya dikelola token tersimpan, THE Cloudflare_Integration SHALL membuat atau memperbarui DNS record yang diperlukan agar domain menunjuk ke server, tanpa mengharuskan pengguna mengedit DNS secara manual.
4. WHEN Custom_Domain diverifikasi melalui Cloudflare_Integration, THE Web_Hosting_Extension SHALL menerbitkan sertifikat TLS menggunakan TLS_Strategy "dns-01" melalui Cloudflare_API_Token meskipun proxy Cloudflare aktif.
5. WHEN Cloudflare_Integration mendeteksi status proxy (orange-cloud) untuk Custom_Domain, THE Web_Hosting_Extension SHALL menampilkan mode SSL Cloudflare yang direkomendasikan ("Full (strict)") dan memperingatkan pengguna jika mode "Flexible" terdeteksi.
6. WHERE pengguna memilih opsi Cloudflare Origin Certificate, THE Cloudflare_Integration SHALL menerbitkan dan memasang Origin Certificate pada Reverse_Proxy untuk Custom_Domain tersebut.
7. IF Cloudflare API menolak operasi karena token tidak berwenang, THEN THE Cloudflare_Integration SHALL mengembalikan kode error "cloudflare_unauthorized" dan tidak mengubah konfigurasi domain.
8. WHEN pengguna mencabut integrasi Cloudflare, THE Cloudflare_Integration SHALL menghapus Cloudflare_API_Token tersimpan dan berhenti mengelola DNS serta sertifikat melalui Cloudflare.

---

## C. VPS_Extension

### Requirement 18: Kontrol VPS Eksternal

**User Story:** Sebagai pengguna teknis, saya ingin mengontrol VPS milik saya melalui platform, agar tidak perlu berpindah aplikasi untuk operasi server dasar.

#### Acceptance Criteria

1. WHILE VPS_Extension tidak aktif, THE Core_Platform SHALL tidak menampilkan kapabilitas kontrol VPS apapun kepada pengguna.
2. WHEN pengguna menambahkan VPS_Connection, THE VPS_Extension SHALL menyimpan host, port, dan kredensial SSH dalam bentuk terenkripsi menggunakan kunci yang berasal dari identitas pengguna.
3. WHEN pengguna meminta status VPS, THE VPS_Extension SHALL membuka koneksi ke VPS_Connection terkait dan mengembalikan informasi uptime, beban CPU, penggunaan memori, dan penggunaan disk.
4. WHEN pengguna meminta operasi "start", "stop", atau "restart" pada layanan yang terdaftar di VPS_Connection, THE VPS_Extension SHALL menjalankan operasi tersebut pada VPS dan mengembalikan kode keluar dari operasi.
5. WHEN pengguna membuka konsol VPS, THE VPS_Extension SHALL menyediakan saluran terminal interaktif antara klien dan VPS_Connection sampai pengguna menutup konsol.
6. IF kredensial VPS_Connection ditolak oleh VPS, THEN THE VPS_Extension SHALL mengembalikan kode error "vps_auth_failed" dan tidak mencoba ulang lebih dari tiga kali dalam 60 detik.
7. THE VPS_Extension SHALL tidak menyimpan kredensial VPS dalam bentuk plaintext pada penyimpanan persisten.

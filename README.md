# SpeedLens

SpeedLens adalah aplikasi computer vision untuk mendeteksi kendaraan,
melacak pergerakannya, dan memperkirakan kecepatannya dari kamera jalan.
Aplikasi menyediakan web UI lokal berbasis Flask dan mendukung dua sumber:

- Video rekaman: MP4, MOV, AVI, MKV, atau M4V.
- CCTV realtime melalui URL RTSP.

## Fitur

- Deteksi kendaraan menggunakan model YOLO fine-tuned `truck-hauler-ft.pt`.
- Alternatif deteksi Background Subtraction untuk kamera statis tanpa model deep learning.
- Pelacakan objek menggunakan ByteTrack.
- Pengukuran kecepatan dengan dua metode kalibrasi:
  - **Poligon**: menghitung perubahan posisi kendaraan sepanjang lintasan yang dikalibrasi.
  - **Gate**: menghitung waktu kendaraan melewati dua atau lebih garis pengukuran.
- Anotasi bounding box, ID tracker, lintasan, dan kecepatan dalam km/jam.
- Ekspor video hasil analisis dan log Excel.
- Preview dan tampilan hasil realtime untuk CCTV RTSP.

## Cara Kerja

1. Sumber video dibaca frame demi frame.
2. Kendaraan dideteksi oleh YOLO atau Background Subtraction.
3. ByteTrack memberi ID yang konsisten untuk setiap kendaraan.
4. Posisi kendaraan dibandingkan dengan lintasan atau gate yang dikalibrasi.
5. Jarak dan waktu digunakan untuk menghitung kecepatan.
6. Hasil diberi anotasi dan ditampilkan atau disimpan.

Kecepatan hanya akurat jika area kamera dikalibrasi dengan ukuran nyata dalam
meter. Koordinat bawaan hanya cocok untuk video contoh `vehicles.mp4` dan harus
diatur ulang untuk kamera lain.

## Instalasi

Jalankan dari direktori contoh ini:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Model YOLO yang digunakan web UI harus tersedia sebagai:

```text
truck-hauler-ft.pt
```

## Menjalankan Web UI

```bash
source .venv/bin/activate
python app.py
```

Buka `http://127.0.0.1:5000`.

### Video Rekaman

1. Pilih **Upload video** dan pilih file.
2. Jeda preview pada frame yang jelas.
3. Pilih metode **Poligon** atau **Gate**.
4. Klik titik kalibrasi pada frame.
5. Masukkan jarak nyata dalam meter.
6. Pilih metode deteksi dan mulai analisis.

### CCTV RTSP

1. Pilih **CCTV realtime (RTSP)**.
2. Masukkan URL, contohnya:

   ```text
   rtsp://username:password@192.168.1.10:554/stream
   ```

3. Klik **Hubungkan untuk preview**.
4. Kalibrasi area atau gate pada frame CCTV.
5. Mulai analisis untuk melihat anotasi secara realtime.

Komputer yang menjalankan Flask harus dapat mengakses jaringan kamera. Browser
tidak perlu membuka URL RTSP secara langsung karena stream dibaca oleh backend
OpenCV dan hasilnya dikirim ke browser sebagai MJPEG. Stream berjalan selama
koneksi kamera tersedia. Log Excel dibuat ketika stream berhenti atau proses
Flask dihentikan.

## Metode Pengukuran

### Poligon

Digunakan untuk mengukur kecepatan sepanjang area jalan. Tentukan batas koridor
jalan, kemudian gambar lintasan tengah mengikuti arah jalan dan masukkan panjang
lintasan sebenarnya.

### Gate

Digunakan untuk menghitung kecepatan rata-rata antar-garis. Tentukan minimal dua
gate dan jarak antar-gate. Gate tambahan dapat dipakai untuk mengukur beberapa
segmen jalan secara berurutan.

## Metode Deteksi

### YOLO

Deteksi deep learning dengan model `truck-hauler-ft.pt`. Confidence dan IoU
dapat disesuaikan. Metode ini lebih fleksibel, tetapi membutuhkan resource
komputasi lebih besar.

### Background Subtraction

Membangun model latar belakang menggunakan MOG2. Metode ini cepat dan cocok
untuk kamera yang tidak bergerak. Parameter seperti area blob, solidity,
warmup, sensitivitas, dan area langit dapat disesuaikan.

## Output

Untuk video rekaman, aplikasi menghasilkan:

- Video MP4 beranotasi.
- Workbook Excel berisi ringkasan, deteksi per frame, dan pengukuran kecepatan.

Untuk RTSP, anotasi ditampilkan langsung melalui stream realtime dan workbook
Excel dibuat setelah sesi berakhir.

## Script CLI Tambahan

Contoh script analisis offline tersedia dalam tiga variasi:

```bash
python ultralytics_example.py \
  --source_video_path data/vehicles.mp4 \
  --target_video_path data/vehicles-result.mp4 \
  --confidence_threshold 0.3 \
  --iou_threshold 0.5
```

`inference_example.py` memakai Roboflow Inference, sedangkan
`yolo_nas_example.py` memakai YOLO-NAS dan membutuhkan dependensi tambahan.

## Catatan

- Kamera harus relatif stabil agar kalibrasi dan tracking dapat diandalkan.
- URL RTSP dan kredensial kamera jangan dibagikan ke repositori publik.
- Akurasi kecepatan bergantung pada kualitas frame, sudut kamera, FPS, tracking,
  dan ketepatan jarak kalibrasi.

## Lisensi

Kode analitik pada contoh ini mengikuti lisensi MIT dari Supervision. Model dan
Ultralytics memiliki ketentuan lisensi masing-masing; periksa lisensi tersebut
sebelum digunakan untuk distribusi komersial.

# 📱 DocuCraft PDF — 100% Offline Mobile PDF Studio & Scanner

An ultra-fast, lightweight (< 2MB bundle), **100% offline** mobile application for document scanning, PDF merging, splitting, converting, watermarking, and page management. All operations run directly inside the device CPU/GPU with zero cloud dependencies and complete user privacy.

---

## 🌟 Key Features

1. **📸 Camera Document Scanner**:
   - Live camera document scanning with viewfinder guidelines.
   - Real-time filters: **Magic B&W** (CamScanner-style paper whitening), **Magic Color**, **Grayscale**, and **Sharp**.
   - Multi-page batch scan: scan multiple receipts/pages in one go, reorder, delete, and export directly to PDF.
2. **📑 Merge PDFs**:
   - Combine multiple PDF documents into a single file with custom page ordering.
3. **✂️ Split & Extract PDF**:
   - Visual page thumbnail grid with one-click page selection and custom range support (e.g. `1-3, 5`).
4. **🖼️ PDF to Image (JPG/PNG)**:
   - High-definition on-device rendering with single-page downloads or **One-Click Download All as ZIP**.
5. **📁 Images to PDF Maker**:
   - Convert multiple gallery photos into formatted PDFs with custom page sizes (A4, Letter, Fit), orientations, and margins.
6. **🛠️ PDF Power Tools**:
   - Custom Watermarking (Text, opacity, angle, size).
   - Page Rotation (90°, 180°, 270° clockwise).
   - Page Trimmer & Remover.
7. **💾 Offline Document Library**:
   - IndexedDB local storage that keeps all your created documents safely on your phone without taking server space.
8. **📲 PWA & Android APK Ready**:
   - Works immediately in browser, installable on Android/iOS Home Screen as a native-like PWA.
   - Ready for standalone Android APK compilation via Capacitor.

---

## 🚀 How to Run Locally

```bash
# 1. Install dependencies (already completed)
npm install

# 2. Start the development server with local network access
npm run dev -- --host
```

When started, Vite will display a local URL and a Network URL:
- Open `http://localhost:5173` on your PC.
- Open `http://<your-ip>:5173` on your **Mobile Phone's browser** (connected to same Wi-Fi) to test camera scanning and mobile features directly on your phone!

---

## 📦 How to Build Native Android APK

To package as a standalone Android APK using Capacitor:

```bash
# 1. Install Capacitor CLI & Android package
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

# 2. Initialize Capacitor
npx cap init "DocuCraft PDF" com.docucraft.pdfstudio --web-dir dist

# 3. Build Web Assets
npm run build

# 4. Add Android platform & Sync
npx cap add android
npx cap sync android

# 5. Open in Android Studio to build APK
npx cap open android
```

---

## 🔒 100% Privacy Guarantee
Zero analytics, zero tracking, zero server uploads. All PDF manipulations, image processing, and rendering happen strictly on the client machine.

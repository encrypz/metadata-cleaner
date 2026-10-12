# 🔒 Encrypz Metadata Cleaner

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.103-009688.svg?logo=fastapi)
![React](https://img.shields.io/badge/React-18.2-61dafb.svg?logo=react)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF.svg?logo=vite)
![License](https://img.shields.io/badge/License-MIT-green.svg)

**Encrypz Metadata Cleaner** is a privacy-first, zero-disk web application that strips hidden metadata and AI labels from photos (JPEG, PNG, WebP) and PDFs before you share them on social media. Built as a companion tool for the [Encrypz](https://encrypz.com) ecosystem, it prioritizes verifiable privacy through a 100% in-memory processing architecture.

## ✨ Features

- **Removes AI Label Triggers**: Strips C2PA Content Credentials (JPEG APP11/JUMBF, PNG `caBX`, WebP chunks), IPTC `DigitalSourceType` (`trainedAlgorithmicMedia`) in XMP, and generator prompts/parameters (Stable Diffusion, ComfyUI, Midjourney, ChatGPT/DALL-E, Firefly...) - the metadata Instagram, Facebook, Threads, TikTok and LinkedIn read to show "AI info" labels.
- **Privacy Scrub**: GPS, camera/device model, serial numbers, timestamps, author, editing history, embedded thumbnails, MPF data and anything appended after the image end.
- **Bulk Upload + ZIP Download**: Drop many files at once; they are processed in parallel and can be downloaded individually or as a single ZIP (built in the browser).
- **Filename Randomizer**: Optionally renames outputs (e.g. `ChatGPT Image...png` -> `IMG_8F3A12C4.png`) so filenames don't give you away.
- **Removal Report**: Each file shows exactly what was found and removed.
- **Zero-Disk Architecture**: The FastAPI backend utilizes strict `io.BytesIO` buffers. Files are processed entirely in RAM and never written to the server's physical disk—preventing data leaks and scraping.
- **Lossless Image Quality**: Parses JPEG segments, PNG chunks and WebP RIFF chunks directly, removing metadata without decoding/re-encoding, preserving 100% of the original visual quality.
- **Native PDF Sanitization**: Uses `PyMuPDF` to wipe document-level XMP, XML tags, and author history without rasterizing or re-rendering the PDF.
- **Premium Frontend**: A sleek, fully responsive React (Vite) interface styled to match the Encrypz dark-mode aesthetic.

> **Note:** Some generators (e.g. Google SynthID) also embed invisible watermarks in the pixels themselves. That is not metadata and is not removed by this tool.

### API

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/clean` | `file` (multipart) | Cleaned file. `X-Clean-Report` header holds a JSON list of removed items. |
| `POST /api/clean-zip` | `files` (multipart, repeatable, max 100) | ZIP of cleaned files. `X-Clean-Report` header holds a per-file JSON report. |

Files are detected by content (magic bytes), not extension. Max 50 MB per file.

---

## 🛠️ Architecture

- **Backend**: Python / FastAPI
- **Frontend**: React.js / Vite

---

## 🚀 Local Development

To run this project locally, you will need two terminal windows—one for the FastAPI backend and one for the React frontend.

### 1. Start the Backend (FastAPI)

```bash
# Clone the repository
git clone https://github.com/Encrypz/metadata-cleaner.git
cd metadata-cleaner

# Create and activate a virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```
*The backend API will be available at `http://localhost:8000/api/clean`*

### 2. Start the Frontend (React + Vite)

```bash
# In a new terminal window, navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```
*The frontend will typically be available at `http://localhost:5173`. Any files dropped here will be routed locally to your FastAPI backend on port 8000.*

---
## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Built with 💙 for the [Encrypz](https://encrypz.com) ecosystem.

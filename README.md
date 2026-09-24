# 🔒 Encrypz Metadata Cleaner

![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.103-009688.svg?logo=fastapi)
![React](https://img.shields.io/badge/React-18.2-61dafb.svg?logo=react)
![Vite](https://img.shields.io/badge/Vite-5.0-646CFF.svg?logo=vite)
![License](https://img.shields.io/badge/License-MIT-green.svg)

**Encrypz Metadata Cleaner** is a privacy-first, zero-disk web application designed to strip hidden metadata (EXIF, APP1, XMP) from JPEGs and PDFs. Built as a companion tool for the [Encrypz](https://encrypz.com) ecosystem, it prioritizes verifiable privacy through a 100% in-memory processing architecture.

## ✨ Features

- **Zero-Disk Architecture**: The FastAPI backend utilizes strict `io.BytesIO` buffers. Files are processed entirely in RAM and never written to the server's physical disk—preventing data leaks and scraping.
- **Lossless Image Quality**: Employs pure byte manipulation via `piexif` to surgically remove EXIF markers from JPEGs without decoding/re-encoding, preserving 100% of the original visual quality.
- **Native PDF Sanitization**: Uses `PyMuPDF` to wipe document-level XMP, XML tags, and author history without rasterizing or re-rendering the PDF.
- **Premium Frontend**: A sleek, fully responsive React (Vite) interface styled to match the Encrypz dark-mode aesthetic with ambient glows and a bento-grid layout.

---

## 🛠️ Architecture

- **Backend**: Python / FastAPI
- **Frontend**: React.js / Vite
- **Deployment**: Configured for Heroku (Single dyno serving a compiled static frontend + API)

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

## 🌐 Heroku Deployment

This repository is configured to be easily deployed to Heroku as a single full-stack application. The FastAPI backend is configured in `main.py` to statically serve the compiled React frontend from the `frontend/dist` directory.

### Build & Deploy Steps:

1. **Build the Frontend for Production:**
   ```bash
   cd frontend
   npm run build
   ```
2. **Commit the Build:**
   Ensure the `frontend/dist` folder is committed to your git repository.
   ```bash
   cd ..
   git add .
   git commit -m "Build frontend for deployment"
   ```
3. **Deploy to Heroku:**
   ```bash
   heroku create your-app-name
   git push heroku master
   ```

*Heroku will read the `Procfile` and `requirements.txt` to automatically provision the Python environment and start the `uvicorn` server.*

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Built with 💙 for the [Encrypz](https://encrypz.com) ecosystem.
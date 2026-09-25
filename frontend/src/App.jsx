import React, { useState, useRef } from 'react';
import './App.css';
import encrypzLogo from './assets/logo.png';

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await processFiles(Array.from(files));
    }
  };

  const handleFileSelect = async (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      await processFiles(Array.from(files));
    }
  };

  const processFiles = async (files) => {
    setIsProcessing(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setMessage(`Scrubbing metadata from ${file.name} (${i + 1}/${files.length})...`);

      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type)) {
        errorCount++;
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        const apiUrl = process.env.NODE_ENV === 'development' 
          ? 'http://localhost:8000/api/clean' 
          : '/api/clean';

        const response = await fetch(apiUrl, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to process file');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.setAttribute('download', `clean_${file.name}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);

        successCount++;
      } catch (error) {
        console.error(error);
        errorCount++;
      }
    }

    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (successCount > 0 && errorCount === 0) {
      setMessage(`Success! Metadata stripped losslessly from ${successCount} file(s).`);
    } else if (successCount > 0 && errorCount > 0) {
      setMessage(`Success for ${successCount} file(s). Failed for ${errorCount} file(s).`);
    } else if (errorCount > 0) {
      setMessage(`Failed to process the uploaded file(s).`);
    }
  };

  return (
    <div className="app-container">
      {/* Background Ambient Effects */}
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>
      <div className="ambient-glow glow-3"></div>

      <nav className="navbar">
        <div className="nav-brand">
          <img src={encrypzLogo} alt="Encrypz" className="brand-logo" /> Encrypz <span className="highlight">Cleaner</span>
        </div>
        <div className="nav-links">
          <a href="#about">Architecture</a>
          <a href="#features">Features</a>
          <a href="https://encrypz.com" className="btn-glow">Back to Encrypz</a>
        </div>
      </nav>

      <div className="hero-split">
        <header className="hero-section">

          <h1 className="hero-headline">
            Scrub Metadata.<br /> <span className="text-gradient">Leave No Trace.</span>
          </h1>
          <p className="hero-subline">
            The ultimate privacy-first metadata stripper for JPEGs, PNGs, WebPs, and PDFs. All processing is executed completely in-memory. Files are never written to disk.
          </p>
          <ul className="hero-checklist">
            <li>✓ Drops EXIF, XMP & AI Prompts (Midjourney, Stable Diffusion)</li>
            <li>✓ Wipes PDF XMP & Author tags in RAM</li>
            <li>✓ No temporary files, zero logging</li>
            <li>✓ 100% Forever Free & Open Source</li>
          </ul>
        </header>

        <main className="main-content">
          <div 
            className={`drop-zone ${isDragging ? 'dragging' : ''} ${isProcessing ? 'processing' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/jpeg, image/png, image/webp, application/pdf"
              multiple
              hidden
            />
            
            <div className="drop-content">
              {isProcessing ? (
                <div className="loader-container">
                  <div className="loader"></div>
                  <p className="loading-text">Wiping EXIF & XMP Data...</p>
                </div>
              ) : (
                <>
                  <svg className="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                  </svg>
                  <h2>Drop your file to sanitize</h2>
                  <p>Supports <strong>JPEG</strong>, <strong>PNG</strong>, <strong>WebP</strong> & <strong>PDF</strong></p>
                  <button className="btn-primary">Browse Files</button>
                </>
              )}
            </div>
          </div>

          {message && (
            <div className={`message ${message.includes('Success') ? 'success' : 'error'}`}>
              <span className="message-icon">{message.includes('Success') ? '✓' : '⚠'}</span>
              {message}
            </div>
          )}
        </main>
      </div>

      <section id="about" className="features-section">
        <div className="section-heading">
          <h2 className="section-title">Built for <span className="text-gradient">Absolute Privacy</span></h2>
          <p className="section-desc">Traditional web tools save your files to their hard drives, risking leaks and data scraping. Our architecture guarantees zero persistence.</p>
        </div>

        <div className="bento-grid">
          <div className="bento-card card-glow col-span-2 row-span-2 highlight-card">
            <div className="card-icon large">
              <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <h3>Zero-Disk RAM Architecture</h3>
            <p>Our FastAPI backend is built specifically around strict <code>io.BytesIO</code> buffers. When you upload a file, it remains entirely in memory. It never touches the physical server disk, not even a temporary folder. The moment the cleaned file is returned to you, it is wiped from RAM by the Python garbage collector.</p>
          </div>
          <div className="bento-card card-glow">
            <div className="card-icon">
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <h3>Lossless Image Quality</h3>
            <p>Unlike standard tools that decode and re-encode JPEGs (ruining quality), we use pure byte manipulation via <code>piexif</code> to surgically drop EXIF markers without altering a single pixel.</p>
          </div>
          <div className="bento-card card-glow">
            <div className="card-icon">
              <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <h3>PDF Native Sanitization</h3>
            <p>Using PyMuPDF, we strip document-level XMP, XML tags, and author history entirely in memory, without rasterizing or re-rendering the PDF contents.</p>
          </div>
        </div>
      </section>

      <section id="features" className="technical-section">
         <div className="tech-box">
            <div className="tech-content">
              <h2>Open Source & Transparent</h2>
              <p>Because privacy tools require trust, our entire cleaning stack is open source. You can audit the FastAPI endpoints and the React frontend to verify that we practice what we preach.</p>
              <div className="tech-stats">
                <div className="stat">
                  <span className="stat-num">0</span>
                  <span className="stat-label">Bytes written to disk</span>
                </div>
                <div className="stat">
                  <span className="stat-num">&lt;1s</span>
                  <span className="stat-label">Average processing time</span>
                </div>
                <div className="stat">
                  <span className="stat-num">100%</span>
                  <span className="stat-label">Original visual quality</span>
                </div>
              </div>
            </div>
            <div className="tech-code">
               <pre>
<code>{`@app.post("/api/clean")
async def clean_metadata(file: UploadFile = File(...)):
    # File is read directly into a memory buffer
    content = await file.read()
    
    # 100% RAM based processing
    out_img = io.BytesIO()
    piexif.remove(content, out_img)
    
    # Wiped from memory on return
    return Response(out_img.getvalue())`}</code>
               </pre>
            </div>
         </div>
      </section>

      <footer className="footer">
        <div className="footer-content">
          <p>Built as a companion tool for the <strong>Encrypz</strong> Ecosystem.</p>
          <div className="footer-links">
            <a href="https://encrypz.com/privacy.html">Privacy Policy</a>
            <a href="https://encrypz.com/terms.html">Terms of Service</a>
            <a href="https://github.com/Encrypz">GitHub</a>
          </div>
          <p className="copyright">© 2026 Encrypz. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;

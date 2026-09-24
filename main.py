import io
import os
import piexif
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Encrypz Metadata Cleaner")

# Allow CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/clean")
async def clean_metadata(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    filename = file.filename.lower()
    content = await file.read()
    
    try:
        if filename.endswith((".jpg", ".jpeg")):
            # piexif.remove requires a second argument (like BytesIO) when input is bytes
            out_img = io.BytesIO()
            piexif.remove(content, out_img)
            cleaned_bytes = out_img.getvalue()
            
            return Response(
                content=cleaned_bytes, 
                media_type="image/jpeg",
                headers={
                    "Content-Disposition": f'attachment; filename="cleaned_{file.filename}"'
                }
            )
            
        elif filename.endswith(".pdf"):
            # Open PDF from memory stream
            doc = fitz.open("pdf", content)
            
            # Wipe XMP metadata and author tags completely
            doc.set_metadata({})
            
            # Save cleaned PDF into a new memory buffer (lossless, no re-render)
            # Garbage collect to strip unreferenced objects where metadata might hide
            out_pdf = io.BytesIO()
            doc.save(out_pdf, garbage=4, deflate=True)
            cleaned_bytes = out_pdf.getvalue()
            doc.close()
            
            return Response(
                content=cleaned_bytes, 
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="cleaned_{file.filename}"'
                }
            )
            
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload JPEG or PDF.")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

# Mount React static files if running in production (Heroku)
if os.path.isdir("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")

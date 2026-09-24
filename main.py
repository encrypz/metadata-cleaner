import io
import os
import struct
import piexif
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

def clean_png_metadata_lossless(file_bytes: bytes) -> bytes:
    PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
    if not file_bytes.startswith(PNG_SIGNATURE):
        raise ValueError("Not a valid PNG file")

    out_io = io.BytesIO()
    out_io.write(PNG_SIGNATURE)
    
    offset = 8
    # Metadata chunks to remove losslessly. 
    # We keep critical chunks (IHDR, IDAT, IEND) and color chunks (sRGB, etc.)
    chunks_to_remove = {b'tEXt', b'zTXt', b'iTXt', b'eXIf', b'tIME'}
    
    while offset < len(file_bytes):
        if offset + 8 > len(file_bytes):
            break
        
        length_bytes = file_bytes[offset:offset+4]
        length = struct.unpack(">I", length_bytes)[0]
        chunk_type = file_bytes[offset+4:offset+8]
        
        total_chunk_size = 8 + length + 4
        
        if chunk_type not in chunks_to_remove:
            out_io.write(file_bytes[offset:offset+total_chunk_size])
            
        offset += total_chunk_size
        
    return out_io.getvalue()

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

        elif filename.endswith(".png"):
            # Parse and remove PNG metadata chunks in-memory losslessly
            try:
                cleaned_bytes = clean_png_metadata_lossless(content)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
                
            return Response(
                content=cleaned_bytes, 
                media_type="image/png",
                headers={
                    "Content-Disposition": f'attachment; filename="cleaned_{file.filename}"'
                }
            )
            
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload JPEG, PNG, or PDF.")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

# Mount React static files if running in production (Heroku)
if os.path.isdir("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")

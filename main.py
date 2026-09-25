import io
import os
import struct
import fitz  # PyMuPDF
import fitz  # PyMuPDF
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

def clean_jpeg_metadata_lossless(file_bytes: bytes) -> bytes:
    if not file_bytes.startswith(b'\xff\xd8'):
        raise ValueError("Not a valid JPEG file")
    
    out_io = io.BytesIO()
    out_io.write(b'\xff\xd8')
    
    offset = 2
    # Remove EXIF(APP1), IPTC(APP13), Comment(COM), and most other APP segments
    # Keep APP0 (JFIF), APP2 (ICC), APP14 (Adobe) for image integrity
    markers_to_remove = {0xE1, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xEB, 0xEC, 0xED, 0xEF, 0xFE}
    
    while offset < len(file_bytes):
        if offset + 1 >= len(file_bytes) or file_bytes[offset] != 0xFF:
            out_io.write(file_bytes[offset:])
            break
            
        marker = file_bytes[offset+1]
        
        if marker == 0xDA or marker == 0xD9:
            out_io.write(file_bytes[offset:])
            break
            
        if marker in [0x00, 0x01, 0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7]:
            out_io.write(file_bytes[offset:offset+2])
            offset += 2
            continue
            
        length = struct.unpack(">H", file_bytes[offset+2:offset+4])[0]
        
        if marker not in markers_to_remove:
            out_io.write(file_bytes[offset:offset+2+length])
            
        offset += 2 + length
        
    return out_io.getvalue()

def clean_png_metadata_lossless(file_bytes: bytes) -> bytes:
    PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
    if not file_bytes.startswith(PNG_SIGNATURE):
        raise ValueError("Not a valid PNG file")

    out_io = io.BytesIO()
    out_io.write(PNG_SIGNATURE)
    
    offset = 8
    # Use an allowlist approach to strip all non-essential metadata (like AI prompts, C2PA)
    # Keep critical chunks (IHDR, PLTE, IDAT, IEND) and visual/color chunks
    chunks_to_keep = {b'tRNS', b'gAMA', b'cHRM', b'sRGB', b'iCCP', b'bKGD', b'pHYs', b'sBIT', b'PLTE'}
    
    while offset < len(file_bytes):
        if offset + 8 > len(file_bytes):
            break
        
        length_bytes = file_bytes[offset:offset+4]
        length = struct.unpack(">I", length_bytes)[0]
        chunk_type = file_bytes[offset+4:offset+8]
        
        total_chunk_size = 8 + length + 4
        
        # PNG spec: 1st byte uppercase means critical chunk (IHDR, IDAT, IEND, etc)
        is_critical = (chunk_type[0] < 97)
        
        if is_critical or chunk_type in chunks_to_keep:
            out_io.write(file_bytes[offset:offset+total_chunk_size])
            
        offset += total_chunk_size
        
    return out_io.getvalue()

def clean_webp_metadata_lossless(file_bytes: bytes) -> bytes:
    if not file_bytes.startswith(b'RIFF') or file_bytes[8:12] != b'WEBP':
        raise ValueError("Not a valid WebP file")

    riff_header = file_bytes[0:4]
    
    offset = 12
    # Allowlist approach for WebP to ensure all custom/AI metadata is stripped
    chunks_to_keep = {b'VP8 ', b'VP8L', b'VP8X', b'ALPH', b'ANIM', b'ANMF', b'ICCP'}
    
    new_file_size = 4 
    chunks_data = []
    
    while offset < len(file_bytes):
        if offset + 8 > len(file_bytes):
            break
            
        chunk_id = file_bytes[offset:offset+4]
        chunk_size = struct.unpack("<I", file_bytes[offset+4:offset+8])[0]
        
        padded_size = chunk_size + (chunk_size % 2)
        
        if chunk_id in chunks_to_keep:
            chunks_data.append(file_bytes[offset:offset+8+padded_size])
            new_file_size += 8 + padded_size
            
        offset += 8 + padded_size
        
    out_io = io.BytesIO()
    out_io.write(riff_header)
    out_io.write(struct.pack("<I", new_file_size))
    out_io.write(b'WEBP')
    
    for chunk in chunks_data:
        out_io.write(chunk)
        
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
            try:
                cleaned_bytes = clean_jpeg_metadata_lossless(content)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            
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
            
        elif filename.endswith(".webp"):
            try:
                cleaned_bytes = clean_webp_metadata_lossless(content)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
                
            return Response(
                content=cleaned_bytes, 
                media_type="image/webp",
                headers={
                    "Content-Disposition": f'attachment; filename="cleaned_{file.filename}"'
                }
            )
            
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload JPEG, PNG, WebP, or PDF.")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

# Mount React static files if running in production (Heroku)
if os.path.isdir("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")

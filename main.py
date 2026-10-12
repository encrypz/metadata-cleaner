

import io
import os
import json
import zlib
import struct
import zipfile
from typing import List
from urllib.parse import quote

try:
    import pymupdf as fitz  # PyMuPDF >= 1.24.3
except ImportError:  # pragma: no cover
    import fitz  # PyMuPDF (legacy import name)
import piexif
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB per file
MAX_BATCH_FILES = 100


class CleanError(ValueError):
    """Raised when a file cannot be parsed as the format it claims to be."""


# ---------------------------------------------------------------------------
# Findings / detection helpers
# ---------------------------------------------------------------------------

# Byte signatures (lower-cased) that social platforms or humans use to identify
# AI-generated media. Platforms like Instagram, Facebook, Threads, TikTok and
# LinkedIn read C2PA manifests and the IPTC DigitalSourceType field in XMP to
# decide whether to show "AI info" / "Made with AI" labels.
AI_SIGNATURES = [
    (b"trainedalgorithmicmedia", "IPTC AI source tag (DigitalSourceType)"),
    (b"compositesynthetic", "IPTC AI source tag (DigitalSourceType)"),
    (b"algorithmicmedia", "IPTC AI source tag (DigitalSourceType)"),
    (b"c2pa", "C2PA Content Credentials"),
    (b"contentauth", "C2PA Content Credentials"),
    (b"negative prompt", "AI prompt / generation parameters"),
    (b"\"prompt\"", "AI prompt / generation parameters"),
    (b"sampler", "AI prompt / generation parameters"),
    (b"openai", "AI generator signature (OpenAI)"),
    (b"dall-e", "AI generator signature (OpenAI)"),
    (b"dall\xc2\xb7e", "AI generator signature (OpenAI)"),
    (b"chatgpt", "AI generator signature (OpenAI)"),
    (b"midjourney", "AI generator signature (Midjourney)"),
    (b"stable diffusion", "AI generator signature (Stable Diffusion)"),
    (b"comfyui", "AI generator signature (ComfyUI)"),
    (b"firefly", "AI generator signature (Adobe Firefly)"),
    (b"google ai", "AI generator signature (Google)"),
    (b"gemini", "AI generator signature (Google)"),
    (b"novelai", "AI generator signature (NovelAI)"),
    (b"leonardo.ai", "AI generator signature (Leonardo)"),
    (b"ideogram", "AI generator signature (Ideogram)"),
]


class Findings:
    """Collects human-readable descriptions of the metadata that was removed."""

    def __init__(self):
        self._items = {}

    def add(self, label: str, kind: str = "meta"):
        # kind: "ai" | "privacy" | "meta"
        if label not in self._items:
            self._items[label] = kind

    def scan_ai(self, blob: bytes):
        low = blob.lower()
        for sig, label in AI_SIGNATURES:
            if sig in low:
                self.add(label, "ai")

    def scan_exif(self, exif_bytes: bytes):
        """Parse an EXIF block (with or without the 'Exif\\0\\0' prefix)."""
        self.add("EXIF data", "meta")
        if not exif_bytes.startswith(b"Exif"):
            exif_bytes = b"Exif\x00\x00" + exif_bytes
        try:
            exif = piexif.load(exif_bytes)
        except Exception:
            self.scan_ai(exif_bytes)
            return
        if exif.get("GPS"):
            self.add("GPS location", "privacy")
        zeroth = exif.get("0th", {})
        if piexif.ImageIFD.Make in zeroth or piexif.ImageIFD.Model in zeroth:
            self.add("Camera / device model", "privacy")
        exif_ifd = exif.get("Exif", {})
        if piexif.ExifIFD.BodySerialNumber in exif_ifd or piexif.ExifIFD.LensSerialNumber in exif_ifd:
            self.add("Device serial number", "privacy")
        if piexif.ExifIFD.DateTimeOriginal in exif_ifd or piexif.ImageIFD.DateTime in zeroth:
            self.add("Capture date & time", "privacy")
        if piexif.ImageIFD.Artist in zeroth or piexif.ImageIFD.Copyright in zeroth:
            self.add("Author / copyright", "privacy")
        if exif.get("thumbnail"):
            self.add("Embedded thumbnail", "privacy")
        self.scan_ai(exif_bytes)

    def scan_xmp(self, xmp_bytes: bytes):
        self.add("XMP data", "meta")
        low = xmp_bytes.lower()
        if b"history" in low or b"photoshop:" in low:
            self.add("Editing history", "privacy")
        if b"exif:gps" in low:
            self.add("GPS location", "privacy")
        self.scan_ai(xmp_bytes)

    def to_list(self):
        order = {"ai": 0, "privacy": 1, "meta": 2}
        items = [{"label": k, "kind": v} for k, v in self._items.items()]
        return sorted(items, key=lambda x: order.get(x["kind"], 3))


# ---------------------------------------------------------------------------
# JPEG
# ---------------------------------------------------------------------------

def clean_jpeg(data: bytes, f: Findings) -> bytes:
    if not data.startswith(b"\xff\xd8"):
        raise CleanError("Not a valid JPEG file")

    out = bytearray(b"\xff\xd8")
    n = len(data)
    i = 2
    saw_eoi = False

    while i < n:
        if data[i] != 0xFF:
            raise CleanError("Corrupt JPEG structure")
        # Skip optional fill bytes (0xFF 0xFF ...)
        while i + 1 < n and data[i + 1] == 0xFF:
            i += 1
        if i + 1 >= n:
            break
        marker = data[i + 1]

        if marker == 0xD9:  # EOI
            out += b"\xff\xd9"
            saw_eoi = True
            trailing = data[i + 2:]
            if trailing.strip(b"\x00"):
                # Data appended after the image: MPF secondary images,
                # gain maps, Samsung/Google trailers, appended AI manifests...
                f.add("Hidden data appended after image", "privacy")
                f.scan_ai(trailing)
            break

        if marker == 0x01 or 0xD0 <= marker <= 0xD7:  # standalone markers
            out += data[i:i + 2]
            i += 2
            continue

        if i + 4 > n:
            break
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        seg = data[i:i + 2 + length]
        payload = seg[4:]
        keep = True

        if marker == 0xE0:  # APP0
            keep = payload.startswith(b"JFIF\x00")
            if not keep:
                f.add("JFIF extension / thumbnail", "meta")
        elif marker == 0xE1:  # APP1: EXIF or XMP
            keep = False
            if payload.startswith(b"Exif"):
                f.scan_exif(payload)
            elif payload.startswith(b"http://ns.adobe.com/"):
                f.scan_xmp(payload)
            else:
                f.add("APP1 vendor data", "meta")
                f.scan_ai(payload)
        elif marker == 0xE2:  # APP2: keep ICC colour profile only
            keep = payload.startswith(b"ICC_PROFILE\x00")
            if not keep:
                if payload.startswith(b"MPF"):
                    f.add("Multi-picture data (MPF)", "meta")
                else:
                    f.add("APP2 vendor data", "meta")
                f.scan_ai(payload)
        elif marker == 0xEB:  # APP11: JUMBF (C2PA lives here)
            keep = False
            f.add("JUMBF box", "meta")
            f.scan_ai(payload)
        elif marker == 0xED:  # APP13: Photoshop IRB / IPTC
            keep = False
            f.add("IPTC / Photoshop data", "privacy")
            f.scan_ai(payload)
        elif marker == 0xEE:  # APP14: Adobe colour transform (needed for decoding)
            keep = payload.startswith(b"Adobe")
            if not keep:
                f.add("APP14 vendor data", "meta")
        elif 0xE3 <= marker <= 0xEF:  # Any other APPn
            keep = False
            f.add(f"APP{marker - 0xE0} vendor data", "meta")
            f.scan_ai(payload)
        elif marker == 0xFE:  # COM
            keep = False
            f.add("Comment", "meta")
            f.scan_ai(payload)

        if keep:
            out += seg
        i += 2 + length

        if marker == 0xDA:  # SOS: copy entropy-coded data until next real marker
            k = i
            while True:
                k = data.find(b"\xff", k)
                if k == -1 or k + 1 >= n:
                    k = n
                    break
                nxt = data[k + 1]
                if nxt == 0x00 or 0xD0 <= nxt <= 0xD7 or nxt == 0xFF:
                    k += 1 if nxt == 0xFF else 2
                    continue
                break
            out += data[i:k]
            i = k

    if not saw_eoi:
        out += b"\xff\xd9"
    return bytes(out)


# ---------------------------------------------------------------------------
# PNG
# ---------------------------------------------------------------------------

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_TEXT_LABELS = {
    "parameters": ("AI prompt / generation parameters", "ai"),
    "prompt": ("AI prompt / generation parameters", "ai"),
    "workflow": ("AI workflow (ComfyUI)", "ai"),
    "negative_prompt": ("AI prompt / generation parameters", "ai"),
    "dream": ("AI prompt / generation parameters", "ai"),
    "sd-metadata": ("AI prompt / generation parameters", "ai"),
    "invokeai_metadata": ("AI prompt / generation parameters", "ai"),
    "xml:com.adobe.xmp": ("XMP data", "meta"),
    "author": ("Author / copyright", "privacy"),
    "copyright": ("Author / copyright", "privacy"),
    "creation time": ("Capture date & time", "privacy"),
}


def _png_text_payload(chunk_type: bytes, body: bytes):
    """Return (keyword, text_bytes) for tEXt/zTXt/iTXt chunks."""
    key, _, rest = body.partition(b"\x00")
    text = rest
    try:
        if chunk_type == b"zTXt":
            text = zlib.decompress(rest[1:])
        elif chunk_type == b"iTXt":
            comp_flag = rest[0:1]
            # skip flag, method, language tag, translated keyword
            parts = rest[2:].split(b"\x00", 2)
            text = parts[2] if len(parts) == 3 else rest
            if comp_flag == b"\x01":
                text = zlib.decompress(text)
    except Exception:
        pass
    return key.decode("latin-1", "ignore").lower(), text


def clean_png(data: bytes, f: Findings) -> bytes:
    if not data.startswith(PNG_SIGNATURE):
        raise CleanError("Not a valid PNG file")

    out = io.BytesIO()
    out.write(PNG_SIGNATURE)
    # Allow-list: only chunks needed to render the image correctly survive.
    keep_ancillary = {b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP", b"bKGD",
                      b"sBIT", b"acTL", b"fcTL", b"fdAT"}

    offset = 8
    n = len(data)
    while offset + 8 <= n:
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        ctype = data[offset + 4:offset + 8]
        total = 12 + length
        body = data[offset + 8:offset + 8 + length]
        is_critical = 65 <= ctype[0] <= 90

        if is_critical or ctype in keep_ancillary:
            out.write(data[offset:offset + total])
        else:
            if ctype in (b"tEXt", b"zTXt", b"iTXt"):
                key, text = _png_text_payload(ctype, body)
                label, kind = PNG_TEXT_LABELS.get(key, ("Text metadata", "meta"))
                f.add(label, kind)
                if key == "xml:com.adobe.xmp":
                    f.scan_xmp(text)
                else:
                    f.scan_ai(key.encode() + b" " + text)
            elif ctype == b"eXIf":
                f.scan_exif(body)
            elif ctype == b"caBX":
                f.add("C2PA Content Credentials", "ai")
            elif ctype == b"tIME":
                f.add("Modification time", "privacy")
            elif ctype == b"pHYs":
                f.add("Physical pixel dimensions", "meta")
            else:
                f.add(f"Ancillary chunk ({ctype.decode('latin-1', 'ignore')})", "meta")
                f.scan_ai(body)

        offset += total
        if ctype == b"IEND":
            if data[offset:].strip(b"\x00"):
                f.add("Hidden data appended after image", "privacy")
                f.scan_ai(data[offset:])
            break

    return out.getvalue()


# ---------------------------------------------------------------------------
# WebP
# ---------------------------------------------------------------------------

def clean_webp(data: bytes, f: Findings) -> bytes:
    if not data.startswith(b"RIFF") or data[8:12] != b"WEBP":
        raise CleanError("Not a valid WebP file")

    keep = {b"VP8 ", b"VP8L", b"VP8X", b"ALPH", b"ANIM", b"ANMF", b"ICCP"}
    chunks = []
    offset = 12
    riff_end = min(len(data), 8 + struct.unpack("<I", data[4:8])[0])

    while offset + 8 <= riff_end:
        cid = data[offset:offset + 4]
        size = struct.unpack("<I", data[offset + 4:offset + 8])[0]
        padded = size + (size & 1)
        chunk = data[offset:offset + 8 + padded]
        body = chunk[8:8 + size]

        if cid in keep:
            if cid == b"VP8X" and len(body) >= 1:
                # Clear the EXIF (0x08) and XMP (0x04) presence flags so the
                # header stays consistent with the stripped content.
                flags = body[0] & ~0x0C
                chunk = chunk[:8] + bytes([flags]) + chunk[9:]
            chunks.append(chunk)
        else:
            if cid == b"EXIF":
                f.scan_exif(body)
            elif cid == b"XMP ":
                f.scan_xmp(body)
            elif cid.upper() == b"C2PA":
                f.add("C2PA Content Credentials", "ai")
            else:
                f.add(f"Extra chunk ({cid.decode('latin-1', 'ignore').strip()})", "meta")
                f.scan_ai(body)
        offset += 8 + padded

    if len(data) > riff_end and data[riff_end:].strip(b"\x00"):
        f.add("Hidden data appended after image", "privacy")
        f.scan_ai(data[riff_end:])

    payload = b"WEBP" + b"".join(chunks)
    return b"RIFF" + struct.pack("<I", len(payload)) + payload


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def clean_pdf(data: bytes, f: Findings) -> bytes:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise CleanError("Not a valid PDF file")
    try:
        meta = doc.metadata or {}
        if meta.get("author"):
            f.add("Author / copyright", "privacy")
        if meta.get("creator") or meta.get("producer"):
            f.add("Creator software", "meta")
        if meta.get("creationDate") or meta.get("modDate"):
            f.add("Capture date & time", "privacy")
        if any(meta.get(k) for k in ("title", "subject", "keywords")):
            f.add("Document info (title, subject, keywords)", "meta")
        f.scan_ai(" ".join(str(v) for v in meta.values() if v).encode("utf-8", "ignore"))

        xmp = doc.get_xml_metadata()
        if xmp:
            f.scan_xmp(xmp.encode("utf-8", "ignore"))

        doc.set_metadata({})
        doc.del_xml_metadata()

        out = io.BytesIO()
        doc.save(out, garbage=4, deflate=True, clean=True)
        return out.getvalue()
    finally:
        doc.close()


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def detect_format(data: bytes):
    if data.startswith(b"\xff\xd8"):
        return "jpeg", "image/jpeg", ".jpg", clean_jpeg
    if data.startswith(PNG_SIGNATURE):
        return "png", "image/png", ".png", clean_png
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp", "image/webp", ".webp", clean_webp
    if data[:1024].lstrip().startswith(b"%PDF"):
        return "pdf", "application/pdf", ".pdf", clean_pdf
    return None


def clean_bytes(data: bytes):
    """Clean a file in memory. Returns (cleaned_bytes, media_type, ext, findings)."""
    if len(data) > MAX_FILE_BYTES:
        raise CleanError("File is larger than the 50 MB limit")
    fmt = detect_format(data)
    if fmt is None:
        raise CleanError("Unsupported file format. Please upload JPEG, PNG, WebP, or PDF.")
    _, media_type, ext, cleaner = fmt
    findings = Findings()
    cleaned = cleaner(data, findings)
    return cleaned, media_type, ext, findings.to_list()


app = FastAPI(title="Encrypz Metadata Cleaner")

# Allow CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Clean-Report", "X-Original-Size", "Content-Disposition"],
)


@app.post("/api/clean")
async def clean_metadata(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    content = await file.read()
    try:
        cleaned, media_type, _, report = clean_bytes(content)
    except CleanError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {e}")

    return Response(
        content=cleaned,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote('cleaned_' + file.filename)}",
            "X-Clean-Report": json.dumps(report),
            "X-Original-Size": str(len(content)),
            "Cache-Control": "no-store",
        },
    )


@app.post("/api/clean-zip")
async def clean_metadata_zip(files: List[UploadFile] = File(...)):
    """Clean many files at once and return them as a single in-memory ZIP."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_BATCH_FILES} files per batch")

    zip_buf = io.BytesIO()
    used_names = set()
    report = {}
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_STORED) as zf:
        for upload in files:
            name = os.path.basename(upload.filename or "file")
            try:
                cleaned, _, real_ext, findings = clean_bytes(await upload.read())
            except Exception as e:
                report[name] = {"error": str(e)}
                continue
            base = os.path.splitext(name)[0]
            ext = real_ext
            candidate, n = base + ext, 1
            while candidate in used_names:
                candidate = f"{base}_{n}{ext}"
                n += 1
            used_names.add(candidate)
            # Fixed timestamp so the archive itself leaks nothing.
            info = zipfile.ZipInfo(candidate, date_time=(1980, 1, 1, 0, 0, 0))
            zf.writestr(info, cleaned)
            report[candidate] = findings

    if not used_names:
        raise HTTPException(status_code=400, detail="None of the files could be processed")

    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="encrypz-cleaned.zip"',
            "X-Clean-Report": json.dumps(report),
            "Cache-Control": "no-store",
        },
    )


# Mount React static files if running in production (Heroku)
if os.path.isdir("frontend/dist"):
    app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")

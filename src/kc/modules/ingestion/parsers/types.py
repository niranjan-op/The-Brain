import hashlib
from pathlib import Path

from fastapi import HTTPException, UploadFile


MAX_FILE_SIZE_MB = 5

MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

ALLOWED_EXTENSIONS = {".pdf", '.png', '.jpg','.jpeg','.md','.txt','.docx','.csv','.xlsx'}
ALLOWED_MIME_TYPES = {
    "application/pdf",          # .pdf
    "image/png",                # .png
    "image/jpeg",               # .jpg, .jpeg
    "text/markdown",            # .md
    "text/plain",               # .txt
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", # .docx
    "text/csv",                 # .csv
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"        # .xlsx
}
MAGIC_BYTES = {
    ".pdf": b"%PDF-",
    ".png": b"\x89PNG\r\n\x1a\n",
    ".jpg": b"\xff\xd8\xff",
    ".jpeg": b"\xff\xd8\xff",
    ".docx": b"PK\x03\x04",
    ".xlsx": b"PK\x03\x04",
}

async def verify_file_type(file:UploadFile):

    # Checking file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Unsupported File type")
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(415, "Invalid MIME Type")

    # Checking magic bytes (extensions with no entry are text formats, skipped)
    magic = MAGIC_BYTES.get(ext)
    if magic:
        head = await file.read(8)
        await file.seek(0)
        if not head.startswith(magic):
            raise HTTPException(415, "File content does not match its extension")
    return ext

async def verify_file_size(file: UploadFile) -> tuple[int, str]:
    """Validate file size <= MAX_FILE_SIZE and compute SHA-256 hex digest in a single pass."""
    size = 0
    hasher = hashlib.sha256()
    while chunk := await file.read(64 * 1024):
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            await file.seek(0)
            raise HTTPException(413, f"File size exceeds {MAX_FILE_SIZE_MB}MB limit!")
        hasher.update(chunk)
    await file.seek(0)
    return size, hasher.hexdigest()
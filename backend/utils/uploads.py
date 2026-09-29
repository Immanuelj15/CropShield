"""
CropShield — Safe upload helper.
Streams an UploadFile to disk under a server-generated uuid filename with a hard size cap.
User input (filenames, ids) is never used to build the destination path.
"""
import asyncio
import uuid
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
CHUNK_SIZE = 1024 * 1024  # 1 MB


async def save_upload_file(
    file: UploadFile,
    dest_dir: Path,
    allowed_extensions: Iterable[str],
    max_bytes: int = MAX_UPLOAD_BYTES,
) -> str:
    """
    Validates the extension, streams the upload in 1 MB chunks (writes off the event loop)
    and aborts with 413 once `max_bytes` is exceeded. Returns the saved file name
    (`<uuid4hex><ext>`), which is always inside `dest_dir`.
    """
    if file is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file uploaded.")
    allowed = {e.lower() for e in allowed_extensions}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext or 'none'}'. Allowed: {', '.join(sorted(allowed))}.",
        )

    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    saved_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = dest_dir / saved_name

    size = 0
    fh = await asyncio.to_thread(open, dest_path, "wb")
    try:
        while True:
            chunk = await file.read(CHUNK_SIZE)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Uploaded file exceeds the {max_bytes // (1024 * 1024)} MB limit.",
                )
            await asyncio.to_thread(fh.write, chunk)
    except HTTPException:
        await asyncio.to_thread(fh.close)
        dest_path.unlink(missing_ok=True)
        raise
    except Exception:
        await asyncio.to_thread(fh.close)
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save uploaded file.")
    await asyncio.to_thread(fh.close)

    if size == 0:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")
    return saved_name

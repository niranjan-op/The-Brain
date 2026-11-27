import asyncio
import socket
from pathlib import Path
from urllib.parse import urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import UploadFile

from src.kc.core.config import settings

LOCAL_STORAGE_ROOT = Path(".local_storage")

s3 = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
    config=Config(
        s3={"addressing_style": "path"},
        connect_timeout=5,
        read_timeout=30,
        retries={"max_attempts": 3},
    ),
)

_BUCKET_READY = False


def _is_localhost_endpoint() -> tuple[bool, str, int]:
    parsed = urlparse(settings.s3_endpoint)
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return host in ("127.0.0.1", "localhost"), host, port


def _local_s3_reachable() -> bool:
    is_local, host, port = _is_localhost_endpoint()
    if not is_local:
        return True
    try:
        with socket.create_connection((host, port), timeout=0.15):
            return True
    except OSError:
        return False


def _local_path(path: str) -> Path:
    target = (LOCAL_STORAGE_ROOT / settings.s3_bucket / path).resolve()
    root = (LOCAL_STORAGE_ROOT / settings.s3_bucket).resolve()
    if not str(target).startswith(str(root)):
        raise ValueError("Invalid storage path")
    return target


def _ensure_bucket_sync() -> None:
    global _BUCKET_READY
    if _BUCKET_READY:
        return
    try:
        s3.head_bucket(Bucket=settings.s3_bucket)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in ("404", "NoSuchBucket"):
            s3.create_bucket(Bucket=settings.s3_bucket)
        else:
            raise
    _BUCKET_READY = True


def _write_local(file_obj, path: str) -> None:
    file_obj.seek(0)
    dest = _local_path(path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(file_obj.read())


def _read_local(path: str) -> bytes:
    dest = _local_path(path)
    if not dest.is_file():
        raise FileNotFoundError(f"Local storage object not found: {path}")
    return dest.read_bytes()


def _upload_sync(file_obj, content_type: str | None, path: str) -> None:
    is_local, _, _ = _is_localhost_endpoint()
    if is_local and not _local_s3_reachable():
        _write_local(file_obj, path)
        return
    try:
        _ensure_bucket_sync()
        s3.upload_fileobj(
            file_obj,
            settings.s3_bucket,
            path,
            ExtraArgs={"ContentType": content_type or "application/octet-stream"},
        )
    except BotoCoreError:
        if not is_local:
            raise
        _write_local(file_obj, path)


def _download_sync(path: str) -> bytes:
    is_local, _, _ = _is_localhost_endpoint()
    if is_local and not _local_s3_reachable():
        return _read_local(path)
    try:
        obj = s3.get_object(Bucket=settings.s3_bucket, Key=path)
        return obj["Body"].read()
    except (BotoCoreError, ClientError):
        if not is_local:
            raise
        return _read_local(path)


async def download_file(path: str) -> bytes:
    return await asyncio.to_thread(_download_sync, path)


async def upload_file(file: UploadFile, path: str):
    await asyncio.to_thread(_upload_sync, file.file, file.content_type, path)

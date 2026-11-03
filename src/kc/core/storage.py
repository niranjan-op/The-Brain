import asyncio

import boto3
from botocore.config import Config
from fastapi import UploadFile

from src.kc.core.config import settings

s3 = boto3.client(
    "s3",
    endpoint_url=settings.s3_endpoint,
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
    config=Config(s3={"addressing_style": "path"}),
)


async def upload_file(file: UploadFile, path: str):
    await asyncio.to_thread(
        s3.upload_fileobj, file.file, settings.s3_bucket, path,
        ExtraArgs={"ContentType": file.content_type},
    )

import asyncio

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from sqlalchemy import text

from src.kc.core.db import get_session

bearer = HTTPBearer()


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    session=Depends(get_session),
):
    try:
        decoded = await asyncio.to_thread(auth.verify_id_token, creds.credentials)
    except Exception:
        raise HTTPException(401, "Invalid or expired token")
    row = (await session.execute(text("""
        INSERT INTO users (firebase_uid, email, display_name)
        VALUES (:uid, :email, :name)
        ON CONFLICT (firebase_uid) DO UPDATE SET last_seen_at = now()
        RETURNING user_uuid, email, display_name, deleted_at
    """), {"uid": decoded["uid"], "email": decoded.get("email"), "name": decoded.get("name")})).mappings().one()
    await session.commit()
    if row["deleted_at"]:
        raise HTTPException(403, "Account deleted")
    return row

import asyncio

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth
from sqlalchemy import text

from src.kc.core.config import settings
from src.kc.core.db import get_session

bearer = HTTPBearer()


def _parse_dev_token(token: str) -> dict[str, str] | None:
    if not token.startswith("dev:"):
        return None
    if settings.queue_dispatcher != "local" and not settings.firebase_auth_emulator_host:
        return None
    parts = token.split(":", 3)
    if len(parts) == 4:
        _, uid, email, name = parts
    elif len(parts) == 3:
        _, email, name = parts
        uid = f"dev_{email}"
    elif len(parts) == 2 and parts[1]:
        email = parts[1]
        uid = f"dev_{email}"
        name = email.split("@")[0]
    else:
        return None
    if not uid or not email:
        return None
    return {"uid": uid, "email": email, "name": name or email}


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    session=Depends(get_session),
):
    decoded = _parse_dev_token(creds.credentials)
    if decoded is None:
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

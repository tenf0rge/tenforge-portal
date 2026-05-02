import jwt
import os
from datetime import datetime

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

def verify_jwt(token: str) -> dict | None:
    if not token or not SUPABASE_JWT_SECRET:
        return None
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        return {"user_id": user_id, "payload": payload}
    except jwt.DecodeError:
        return None
    except Exception:
        return None

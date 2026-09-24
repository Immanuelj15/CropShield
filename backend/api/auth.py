"""
AgriGuard AI — Auth Router
Endpoints for user registration, authentication (JWT), and profile retrieval.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.db.database import get_db
from backend.models.db_models import User as SqlUser, UserRole
from backend.models.user import User as MongoUser
from backend.models.schemas import UserRegister, UserLogin, TokenResponse, UserProfile, UserLanguageUpdate
from backend.utils.auth_utils import hash_password, verify_password, create_access_token, oauth2_scheme

router = APIRouter()

@router.post("/auth/register", response_model=TokenResponse)
async def register_user(user_in: UserRegister, db: Session = Depends(get_db)):
    # 1. Check MongoDB
    existing_mongo = await MongoUser.find_one({"email": user_in.email.lower()})
    if existing_mongo:
        raise HTTPException(status_code=400, detail="Email already registered in system.")
        
    role_str = (user_in.role or "farmer").lower()
    if role_str not in ["farmer", "agronomist", "admin"]:
        role_str = "farmer"

    new_mongo_user = MongoUser(
        name=user_in.full_name or user_in.username,
        email=user_in.email.lower(),
        password_hash=hash_password(user_in.password),
        role=role_str,
        district=user_in.district or "Coimbatore",
        is_active=True,
    )
    await new_mongo_user.insert()

    token = create_access_token({"sub": new_mongo_user.email, "role": new_mongo_user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": new_mongo_user.email,
        "role": new_mongo_user.role
    }

@router.post("/auth/login", response_model=TokenResponse)
async def login_user(user_in: UserLogin, db: Session = Depends(get_db)):
    search_term = (user_in.email or user_in.username or "").strip()
    if not search_term:
        raise HTTPException(status_code=400, detail="Username or email is required.")

    # 1. First attempt: MongoDB Beanie Document (primary source of truth)
    try:
        mongo_user = await MongoUser.find_one(
            {"$or": [
                {"email": search_term.lower()},
                {"name": search_term}
            ]}
        )
        if mongo_user and verify_password(user_in.password, mongo_user.password_hash):
            token = create_access_token({
                "sub": mongo_user.email,
                "role": mongo_user.role,
                "user_id": str(mongo_user.id),
            })
            return {
                "access_token": token,
                "token_type": "bearer",
                "username": mongo_user.email,
                "role": mongo_user.role,
                "user_id": str(mongo_user.id),
                "name": mongo_user.name,
                "region_assigned": getattr(mongo_user, "region_assigned", None),
                "farm_id": str(mongo_user.farm_id) if getattr(mongo_user, "farm_id", None) else None,
                "preferred_language": getattr(mongo_user, "preferred_language", "en") or "en",
            }
    except Exception as e:
        print(f"[AUTH] MongoDB lookup warning: {e}")

    # 2. Second attempt: SQLite database fallback
    sql_user = db.query(SqlUser).filter(
        (SqlUser.username == search_term) | (SqlUser.email == search_term.lower())
    ).first()
    if sql_user and verify_password(user_in.password, sql_user.hashed_password):
        token = create_access_token({"sub": sql_user.username, "role": sql_user.role.value, "user_id": str(sql_user.id)})
        return {
            "access_token": token,
            "token_type": "bearer",
            "username": sql_user.username,
            "role": sql_user.role.value,
            "user_id": str(sql_user.id),
            "name": sql_user.full_name,
            "preferred_language": "en",
        }

    raise HTTPException(status_code=401, detail="Invalid email or password.")

@router.get("/auth/me", response_model=UserProfile)
async def get_me(username: str = "farmer@cropshield.org", db: Session = Depends(get_db)):
    # Check MongoDB
    mongo_user = await MongoUser.find_one(
        {"$or": [{"email": username.lower()}, {"name": username}]}
    )
    if mongo_user:
        return {
            "id": 1,
            "user_id": str(mongo_user.id),
            "username": mongo_user.email,
            "email": mongo_user.email,
            "role": mongo_user.role,
            "full_name": mongo_user.name,
            "district": mongo_user.district or "Tamil Nadu",
            "region_assigned": getattr(mongo_user, "region_assigned", None),
            "farm_id": str(mongo_user.farm_id) if getattr(mongo_user, "farm_id", None) else None,
            "preferred_language": getattr(mongo_user, "preferred_language", "en") or "en",
        }

    # Check SQLite
    sql_user = db.query(SqlUser).filter(
        (SqlUser.username == username) | (SqlUser.email == username.lower())
    ).first()
    if sql_user:
        return {
            "id": sql_user.id,
            "username": sql_user.username,
            "email": sql_user.email,
            "role": sql_user.role.value,
            "full_name": sql_user.full_name,
            "district": sql_user.district,
            "preferred_language": "en",
        }

    return {
        "id": 1,
        "username": username,
        "email": username,
        "role": "farmer",
        "full_name": "AgriGuard Farmer",
        "district": "Tamil Nadu",
        "preferred_language": "en",
    }


@router.put("/users/me/language")
async def update_my_language(
    payload: UserLanguageUpdate,
    token: Optional[str] = Depends(oauth2_scheme)
):
    """Updates the user's preferred language (en, ta, hi, te, ml) across sessions."""
    from backend.utils.localized_errors import resolve_lang, localized_error
    lang = resolve_lang(payload.language)

    if token:
        try:
            from backend.utils.auth_utils import decode_access_token
            decoded = decode_access_token(token)
            email = decoded.get("sub")
            if email:
                mongo_user = await MongoUser.find_one({"email": email.lower()})
                if mongo_user:
                    mongo_user.preferred_language = lang
                    await mongo_user.save()
        except Exception as e:
            print(f"[WARN] Error saving user language: {e}")

    return {
        "status": "success",
        "preferred_language": lang,
        "message": localized_error("language_updated", lang)
    }


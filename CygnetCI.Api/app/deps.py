from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from .database import get_db
from .crud import get_user_by_username
from .auth import decode_access_token
from sqlalchemy.orm import Session

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

def get_db_dep():
    # wrapper to be used in endpoints: depends on this to get DB session
    from .database import get_db
    return next(get_db())

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db_dep)):
    username = decode_access_token(token)
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = get_user_by_username(db, username)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

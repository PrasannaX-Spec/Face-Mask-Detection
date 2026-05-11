import uuid
from fastapi import HTTPException, status, Query

# Hardcoded credentials
VALID_USERNAME = "admin"
VALID_PASSWORD = "admin123"

# In-memory token store: {token: username}
active_tokens: dict[str, str] = {}


def authenticate(username: str, password: str) -> str:
    """Validate credentials and return a new session token."""
    if username != VALID_USERNAME or password != VALID_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = str(uuid.uuid4())
    active_tokens[token] = username
    return token


def verify_token(token: str) -> str:
    """Dependency: validate token from Authorization header value."""
    if token not in active_tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return active_tokens[token]


def verify_token_ws(token: str = Query(...)) -> str:
    """Dependency: validate token passed as WebSocket query param."""
    if token not in active_tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return active_tokens[token]

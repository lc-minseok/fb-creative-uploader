import io
import os

# Google OAuth가 응답에 추가 스코프(profile 등)를 끼워주는 경우가 있어 완화 플래그를 활성화한다.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

import streamlit as st
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token as google_id_token
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "openid",
    "email",
]


def _client_config():
    return {
        "web": {
            "client_id": st.secrets["GOOGLE_CLIENT_ID"],
            "client_secret": st.secrets["GOOGLE_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [st.secrets["GOOGLE_REDIRECT_URI"]],
        }
    }


def build_flow():
    # PKCE는 끈다. google-auth-oauthlib 최신 버전은 autogenerate_code_verifier 가
    # 기본 True 라 매 Flow 인스턴스마다 새 verifier 가 생성되는데, Streamlit이
    # 외부 OAuth 리다이렉트 후 세션 상태 유지를 보장하지 않아 verifier 전달이
    # 어렵다. 우리 OAuth 클라이언트는 PKCE 없이 동작하므로 끄는 것이 안전하다.
    flow = Flow.from_client_config(
        _client_config(),
        scopes=SCOPES,
        autogenerate_code_verifier=False,
    )
    flow.redirect_uri = st.secrets["GOOGLE_REDIRECT_URI"]
    return flow


def get_auth_url():
    flow = build_flow()
    url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    # PKCE: 동일한 code_verifier 가 토큰 교환 시 다시 필요하므로 호출자에게 반환.
    return url, flow.code_verifier


def exchange_code(code, code_verifier=None):
    flow = build_flow()
    if code_verifier:
        flow.code_verifier = code_verifier
    flow.fetch_token(code=code)
    creds = flow.credentials
    # clock_skew_in_seconds: 로컬 PC 시계가 Google 서버보다 살짝 느릴 때
    # "Token used too early" 에러로 로그인이 막히는 일을 막기 위해 10초까지 허용.
    payload = google_id_token.verify_oauth2_token(
        creds.id_token,
        Request(),
        audience=st.secrets["GOOGLE_CLIENT_ID"],
        clock_skew_in_seconds=10,
    )
    return creds, payload.get("email", "")


def credentials_to_dict(creds: Credentials):
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "id_token": creds.id_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
        "expiry": creds.expiry.isoformat() if creds.expiry else None,
    }


def credentials_from_dict(data):
    from datetime import datetime
    creds = Credentials(
        token=data["token"],
        refresh_token=data.get("refresh_token"),
        id_token=data.get("id_token"),
        token_uri=data["token_uri"],
        client_id=data["client_id"],
        client_secret=data["client_secret"],
        scopes=data["scopes"],
    )
    if data.get("expiry"):
        creds.expiry = datetime.fromisoformat(data["expiry"])
    return creds


def _ensure_fresh(creds: Credentials):
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return creds


def list_files_in_folder(creds: Credentials, folder_id: str):
    creds = _ensure_fresh(creds)
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    files = []
    page_token = None
    query = (
        f"'{folder_id}' in parents and trashed = false and "
        "(mimeType contains 'image/' or mimeType contains 'video/')"
    )
    while True:
        resp = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name, mimeType, size, createdTime)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            pageToken=page_token,
        ).execute()
        files.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def download_file_bytes(creds: Credentials, file_id: str) -> bytes:
    creds = _ensure_fresh(creds)
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    data = buf.getvalue()
    buf.close()
    return data


def video_media_url(creds: Credentials, file_id: str) -> str:
    creds = _ensure_fresh(creds)
    return (
        f"https://www.googleapis.com/drive/v3/files/{file_id}"
        f"?alt=media&access_token={creds.token}"
    )


def extract_folder_id(text: str) -> str | None:
    import re
    text = (text or "").strip()
    if not text:
        return None
    patterns = [
        r"/folders/([a-zA-Z0-9_-]+)",
        r"id=([a-zA-Z0-9_-]+)",
        r"/d/([a-zA-Z0-9_-]+)",
    ]
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(1)
    if re.fullmatch(r"[a-zA-Z0-9_-]{10,}", text):
        return text
    return None

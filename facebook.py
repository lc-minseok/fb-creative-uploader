import requests
import streamlit as st

FB_API = "https://graph.facebook.com/v20.0"


def _token():
    return st.secrets["FB_ACCESS_TOKEN"]


def upload_image(ad_account_id: str, file_bytes: bytes, file_name: str) -> dict:
    files = {"filename": (file_name, file_bytes)}
    data = {"access_token": _token()}
    res = requests.post(
        f"{FB_API}/{ad_account_id}/adimages",
        files=files,
        data=data,
        timeout=120,
    )
    res.raise_for_status()
    payload = res.json()
    images = payload.get("images", {})
    if not images:
        raise RuntimeError(f"이미지 업로드 응답이 비어 있습니다: {payload}")
    first_key = next(iter(images))
    return images[first_key]


def upload_video_by_url(ad_account_id: str, file_url: str, file_name: str) -> dict:
    res = requests.post(
        f"{FB_API}/{ad_account_id}/advideos",
        data={
            "file_url": file_url,
            "title": file_name,
            "access_token": _token(),
        },
        timeout=300,
    )
    res.raise_for_status()
    return res.json()

import requests
import streamlit as st

FB_API = "https://graph.facebook.com/v20.0"


def _token():
    return st.secrets["FB_ACCESS_TOKEN"]


def _raise_fb_error(res: requests.Response, label: str):
    """requests.raise_for_status() 는 FB 에러 본문을 안 보여줘서 직접 파싱."""
    if res.ok:
        return
    try:
        err = res.json().get("error", {}) or {}
    except ValueError:
        raise RuntimeError(f"{label} FB API {res.status_code}: {res.text[:400]}")
    code = err.get("code", res.status_code)
    subcode = err.get("error_subcode")
    msg = err.get("message", "(메시지 없음)")
    user_msg = err.get("error_user_msg")
    parts = [f"FB API {code}"]
    if subcode:
        parts.append(f"sub {subcode}")
    detail = msg if not user_msg else f"{msg} | {user_msg}"
    raise RuntimeError(f"{label} {' / '.join(parts)}: {detail}")


def upload_image(ad_account_id: str, file_bytes: bytes, file_name: str) -> dict:
    files = {"filename": (file_name, file_bytes)}
    data = {"access_token": _token()}
    res = requests.post(
        f"{FB_API}/{ad_account_id}/adimages",
        files=files,
        data=data,
        timeout=120,
    )
    _raise_fb_error(res, "이미지 업로드 실패")
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
            "name": file_name,  # FB 그래프 API 공식 파라미터는 name (title 은 구버전)
            "access_token": _token(),
        },
        timeout=300,
    )
    _raise_fb_error(res, "동영상 업로드 실패")
    return res.json()

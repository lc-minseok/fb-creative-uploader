import gc
import time
from pathlib import Path

import pandas as pd
import streamlit as st

from drive import (
    credentials_from_dict,
    credentials_to_dict,
    download_file_bytes,
    exchange_code,
    extract_folder_id,
    get_auth_url,
    list_files_in_folder,
    video_media_url,
)
from facebook import upload_image, upload_video_by_url

ALLOWED_DOMAIN = "@loadcomplete.com"
PUBLIC_DIR = Path(__file__).parent / "public"


st.set_page_config(
    page_title="Facebook Creative Uploader",
    page_icon=str(PUBLIC_DIR / "meta.png") if (PUBLIC_DIR / "meta.png").exists() else "📤",
    layout="wide",
)


def load_ad_accounts():
    raw = st.secrets.get("ad_accounts", [])
    return [
        {"id": a["id"], "name": a.get("name", a["id"]), "icon": a.get("icon", "")}
        for a in raw
    ]


AD_ACCOUNTS = load_ad_accounts()
ACCOUNT_NAMES = {a["id"]: a["name"] for a in AD_ACCOUNTS}
APP_ICONS = {a["id"]: a["icon"] for a in AD_ACCOUNTS}


def handle_oauth_callback():
    qp = st.query_params
    if "code" not in qp:
        return
    code = qp["code"]
    try:
        creds, email = exchange_code(code)
    except Exception as e:
        st.query_params.clear()
        st.error(f"로그인 실패: {e}")
        return
    st.query_params.clear()
    if not email.endswith(ALLOWED_DOMAIN):
        st.session_state["auth_error"] = email
        return
    st.session_state["credentials"] = credentials_to_dict(creds)
    st.session_state["email"] = email
    st.rerun()


def login_view():
    st.title("Facebook Creative Uploader")
    st.caption("소재 라이브러리 전용")

    if "auth_error" in st.session_state:
        email = st.session_state.pop("auth_error")
        st.error(
            f"이 서비스는 Loadcomplete 임직원만 사용할 수 있습니다.\n\n"
            f"**{email}** 계정은 접근이 제한되어 있습니다."
        )

    st.write("Google 계정으로 로그인하세요.")
    st.link_button("Google 로그인", get_auth_url(), type="primary")


def credentials():
    creds = credentials_from_dict(st.session_state["credentials"])
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        st.session_state["credentials"] = credentials_to_dict(creds)
    return creds


def parse_bulk_links(text: str):
    folder_ids = []
    for line in (text or "").splitlines():
        fid = extract_folder_id(line)
        if fid:
            folder_ids.append(fid)
    # 중복 제거 + 입력 순서 유지
    seen = set()
    out = []
    for fid in folder_ids:
        if fid not in seen:
            seen.add(fid)
            out.append(fid)
    return out


def run_uploads(jobs, *, log_box):
    """jobs: list of (folder_id, account_id). 동일 폴더는 한 번만 스캔."""
    results = []

    # 폴더별로 파일 목록을 캐시해 중복 스캔 방지
    folder_files = {}
    creds = credentials()
    for folder_id, _ in jobs:
        if folder_id in folder_files:
            continue
        try:
            folder_files[folder_id] = list_files_in_folder(creds, folder_id)
            log_box.write(f"📂 폴더 `{folder_id}` 스캔: {len(folder_files[folder_id])}개 파일")
        except Exception as e:
            folder_files[folder_id] = None
            log_box.write(f"❌ 폴더 `{folder_id}` 스캔 실패: {e}")

    total_steps = 0
    for folder_id, account_id in jobs:
        files = folder_files.get(folder_id)
        if files is None:
            results.append({
                "folder": folder_id,
                "file": "폴더 스캔 실패",
                "account": ACCOUNT_NAMES.get(account_id, account_id),
                "status": "실패",
                "error": "폴더 조회 실패",
            })
            continue
        total_steps += len(files)

    progress = st.progress(0.0, text="업로드 준비 중...")
    done = 0

    for folder_id, account_id in jobs:
        files = folder_files.get(folder_id)
        if files is None:
            continue
        account_label = ACCOUNT_NAMES.get(account_id, account_id)
        for file in files:
            name = file["name"]
            mime = file.get("mimeType", "")
            try:
                if mime.startswith("image/"):
                    creds = credentials()
                    data = download_file_bytes(creds, file["id"])
                    upload_image(account_id, data, name)
                    del data
                    gc.collect()
                elif mime.startswith("video/"):
                    creds = credentials()
                    url = video_media_url(creds, file["id"])
                    upload_video_by_url(account_id, url, name)
                else:
                    log_box.write(f"⏭️ 지원하지 않는 형식 건너뜀: {name} ({mime})")
                    continue

                results.append({
                    "folder": folder_id,
                    "file": name,
                    "account": account_label,
                    "status": "성공",
                    "error": "",
                })
                log_box.write(f"✅ `{name}` → {account_label}")
            except Exception as e:
                results.append({
                    "folder": folder_id,
                    "file": name,
                    "account": account_label,
                    "status": "실패",
                    "error": str(e),
                })
                log_box.write(f"❌ `{name}` → {account_label}: {e}")

            done += 1
            if total_steps:
                progress.progress(done / total_steps, text=f"{done}/{total_steps} 처리 중...")
            time.sleep(0.3)  # 메모리 안정화

    progress.progress(1.0, text="완료")
    return results


def render_results(results, mode_label: str):
    if not results:
        st.info("업로드된 소재가 없습니다.")
        return

    df = pd.DataFrame(results)
    success = int((df["status"] == "성공").sum())
    failed = int((df["status"] == "실패").sum())

    c1, c2, c3 = st.columns(3)
    c1.metric("전체", len(df))
    c2.metric("성공", success)
    c3.metric("실패", failed)

    st.caption(f"{mode_label} · 총 {len(df)}건 처리")
    st.dataframe(df, use_container_width=True, hide_index=True)


def bulk_tab():
    if not AD_ACCOUNTS:
        st.warning("등록된 광고 계정이 없습니다. `secrets.toml`의 `[[ad_accounts]]`를 확인하세요.")
        return

    st.subheader("벌크 업로드")
    st.caption("선택한 모든 계정에 동일한 Drive 폴더의 소재가 업로드됩니다.")

    selected = st.multiselect(
        "광고 계정 선택",
        options=[a["id"] for a in AD_ACCOUNTS],
        format_func=lambda i: ACCOUNT_NAMES.get(i, i),
        key="bulk_accounts",
    )

    links_text = st.text_area(
        "Google Drive 폴더 링크 또는 ID (한 줄에 하나)",
        height=120,
        placeholder="https://drive.google.com/drive/folders/...\n폴더ID",
        key="bulk_links",
    )

    if st.button("업로드 시작", type="primary", key="bulk_submit", disabled=not selected):
        folder_ids = parse_bulk_links(links_text)
        if not folder_ids:
            st.error("유효한 Drive 폴더 링크를 1개 이상 입력해주세요.")
            return

        jobs = [(fid, acc) for fid in folder_ids for acc in selected]
        with st.status(
            f"{len(selected)}개 계정 × {len(folder_ids)}개 폴더 업로드 중...",
            expanded=True,
        ) as status:
            results = run_uploads(jobs, log_box=status)
            failed = sum(1 for r in results if r["status"] == "실패")
            status.update(
                label=("완료" if failed == 0 else f"완료 (실패 {failed}건)"),
                state=("complete" if failed == 0 else "error"),
            )
        render_results(results, "벌크 업로드")


def mapping_tab():
    if not AD_ACCOUNTS:
        st.warning("등록된 광고 계정이 없습니다.")
        return

    st.subheader("매핑 업로드")
    st.caption("계정별로 다른 Drive 폴더를 지정합니다.")

    account_names = [a["name"] for a in AD_ACCOUNTS]
    name_to_id = {a["name"]: a["id"] for a in AD_ACCOUNTS}

    if "mapping_df" not in st.session_state:
        st.session_state["mapping_df"] = pd.DataFrame(
            {"광고 계정": pd.Series(dtype=str), "Drive 링크": pd.Series(dtype=str)}
        )

    edited = st.data_editor(
        st.session_state["mapping_df"],
        column_config={
            "광고 계정": st.column_config.SelectboxColumn(
                "광고 계정", options=account_names
            ),
            "Drive 링크": st.column_config.TextColumn(
                "Drive 폴더 URL 또는 ID"
            ),
        },
        num_rows="dynamic",
        use_container_width=True,
        key="mapping_editor",
    )

    valid_rows = [
        (name_to_id.get(row["광고 계정"]), extract_folder_id(row["Drive 링크"]))
        for _, row in edited.iterrows()
        if row.get("광고 계정") and row.get("Drive 링크")
    ]
    valid_rows = [(acc, fid) for acc, fid in valid_rows if acc and fid]

    st.caption(f"유효한 매핑: **{len(valid_rows)}건**")

    if st.button(
        "매핑 업로드 시작",
        type="primary",
        key="mapping_submit",
        disabled=not valid_rows,
    ):
        # folder_id, account_id 순서로 job 구성 (같은 폴더 캐시 활용)
        jobs = [(fid, acc) for acc, fid in valid_rows]
        with st.status(f"{len(valid_rows)}개 매핑 업로드 중...", expanded=True) as status:
            results = run_uploads(jobs, log_box=status)
            failed = sum(1 for r in results if r["status"] == "실패")
            status.update(
                label=("완료" if failed == 0 else f"완료 (실패 {failed}건)"),
                state=("complete" if failed == 0 else "error"),
            )
        render_results(results, "매핑 업로드")


def dashboard():
    with st.sidebar:
        st.markdown(f"**{st.session_state.get('email', '')}**")
        if st.button("로그아웃", use_container_width=True):
            st.session_state.clear()
            st.rerun()

    st.title("Facebook Creative Uploader")
    st.caption("소재 라이브러리 전용")

    tab_bulk, tab_map = st.tabs(["벌크 업로드", "매핑 업로드"])
    with tab_bulk:
        bulk_tab()
    with tab_map:
        mapping_tab()


def main():
    handle_oauth_callback()
    if "credentials" in st.session_state:
        dashboard()
    else:
        login_view()


if __name__ == "__main__":
    main()

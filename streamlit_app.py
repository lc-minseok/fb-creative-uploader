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


# ────────────────────────────────────────────────────────────────────────
# UI assets
# ────────────────────────────────────────────────────────────────────────

CSS = """
<style>
:root {
  --fb: #1877F2;
  --fb-dark: #0d6adb;
  --fb-light: #E7F3FF;
  --green: #42B72A;
  --red: #FA3E3E;
  --bg: #F0F2F5;
  --border: #E4E6EB;
  --text: #1C1E21;
  --muted: #65676B;
}

/* Hide default Streamlit chrome */
header[data-testid="stHeader"] { display: none !important; }
footer { display: none !important; }
#MainMenu { display: none !important; }

/* Outer container — wide but capped, centered */
.block-container {
  padding-top: 0 !important;
  padding-bottom: 3rem !important;
  max-width: 1120px !important;
  margin: 0 auto;
}

/* Topbar — full viewport width even inside max-width container */
.fb-topbar {
  background: var(--fb);
  height: 56px;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  margin-bottom: 1.25rem;
  padding: 0 28px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
  box-shadow: 0 2px 8px rgba(24,119,242,0.3);
  position: sticky;
  top: 0;
  z-index: 100;
}
.fb-topbar svg { display: block; flex-shrink: 0; }
.fb-topbar .title { font-weight: 600; font-size: 17px; letter-spacing: -0.3px; }
.fb-topbar .badge {
  margin-left: auto;
  background: rgba(255,255,255,0.2);
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 20px;
  font-weight: 500;
}

/* Bordered containers act as cards */
div[data-testid="stVerticalBlockBorderWrapper"] {
  border-radius: 12px !important;
  border: 1px solid var(--border) !important;
  background: white !important;
  margin-bottom: 14px;
}
div[data-testid="stVerticalBlockBorderWrapper"] > div {
  padding: 18px 22px !important;
}

/* Make side-by-side cards equal height */
div[data-testid="stHorizontalBlock"] > div[data-testid="column"] > div[data-testid="stVerticalBlock"] {
  height: 100%;
}
div[data-testid="stHorizontalBlock"] > div[data-testid="column"] > div[data-testid="stVerticalBlock"] > div[data-testid="stVerticalBlockBorderWrapper"] {
  height: 100%;
}

/* Section header */
.section-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 14px;
}
.section-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.section-title-text { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.2; }
.section-subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; }
.step-badge {
  margin-left: auto;
  background: var(--fb-light); color: var(--fb);
  font-size: 11px; font-weight: 600;
  padding: 3px 9px; border-radius: 20px;
  white-space: nowrap;
}

/* Primary button = FB blue */
.stButton > button[kind="primary"],
button[data-testid="baseButton-primary"] {
  background: var(--fb) !important;
  color: white !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(24,119,242,0.25);
  border-radius: 10px !important;
  font-weight: 600 !important;
}
.stButton > button[kind="primary"]:hover:not(:disabled) {
  background: var(--fb-dark) !important;
  box-shadow: 0 6px 16px rgba(24,119,242,0.35);
}
.stButton > button[kind="primary"]:disabled {
  background: #BCC0C4 !important;
  box-shadow: none;
  opacity: 1 !important;
  color: white !important;
}

/* Link button (Google login) */
.stLinkButton > a {
  background: var(--fb) !important;
  color: white !important;
  border: none !important;
  border-radius: 10px !important;
  font-weight: 600 !important;
  box-shadow: 0 2px 8px rgba(24,119,242,0.25);
}
.stLinkButton > a:hover { background: var(--fb-dark) !important; }

/* Info box */
.info-box {
  background: var(--fb-light);
  border: 1px solid #C5D9F8;
  border-radius: 8px;
  padding: 11px 13px;
  font-size: 12px;
  color: #1864C8;
  line-height: 1.7;
  margin-top: 10px;
}

/* Login card */
.lock-wrap {
  width: 56px; height: 56px;
  margin: 8px auto 18px;
  background: var(--fb-light);
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
}
.login-title { font-size: 18px; font-weight: 600; text-align: center; margin-bottom: 8px; color: var(--text); }
.login-sub { font-size: 13px; color: var(--muted); text-align: center; line-height: 1.7; margin-bottom: 18px; }

/* Tabs polish */
.stTabs [data-baseweb="tab-list"] { gap: 4px; }
.stTabs [data-baseweb="tab"] {
  border-radius: 8px !important;
  font-weight: 500 !important;
}
.stTabs [aria-selected="true"] {
  background: var(--fb-light) !important;
  color: var(--fb) !important;
}

/* Checkbox + image rows in account grid */
.account-row [data-testid="stCheckbox"] label p { font-weight: 600 !important; font-size: 14px !important; }

/* Buttons: no text wrapping inside narrow columns */
.stButton button { white-space: nowrap !important; }

/* Secondary buttons (default) — keep small but visible */
.stButton > button:not([kind="primary"]) {
  border-radius: 8px !important;
  font-size: 12.5px !important;
  font-weight: 500 !important;
  padding: 4px 12px !important;
  background: white !important;
  border: 1px solid var(--border) !important;
  color: var(--text) !important;
}
.stButton > button:not([kind="primary"]):hover {
  border-color: var(--fb) !important;
  color: var(--fb) !important;
}

/* Sidebar tidy */
[data-testid="stSidebar"] { background: white; }

/* Mapping summary chip */
.mapping-summary {
  font-size: 12.5px; color: var(--muted);
  margin-top: 8px;
}
.mapping-summary strong { color: var(--fb); }
</style>
"""

FB_SVG = (
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="white" '
    'xmlns="http://www.w3.org/2000/svg">'
    '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 '
    "10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 "
    "4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 "
    "1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
    '"/></svg>'
)


def inject_css():
    st.markdown(CSS, unsafe_allow_html=True)


def topbar():
    st.markdown(
        f'<div class="fb-topbar">{FB_SVG}'
        f'<span class="title">Facebook Creative Uploader</span>'
        f'<span class="badge">소재 라이브러리 전용</span></div>',
        unsafe_allow_html=True,
    )


def section_header(icon_bg: str, icon_svg: str, title: str, subtitle: str, step: str | None = None):
    badge = f'<span class="step-badge">{step}</span>' if step else ""
    st.markdown(
        f'<div class="section-head">'
        f'<div class="section-icon" style="background:{icon_bg}">{icon_svg}</div>'
        f'<div><div class="section-title-text">{title}</div>'
        f'<div class="section-subtitle">{subtitle}</div></div>'
        f"{badge}</div>",
        unsafe_allow_html=True,
    )


def info_box(html: str):
    st.markdown(f'<div class="info-box">{html}</div>', unsafe_allow_html=True)


# Inline SVG icons used in section headers
ICON_DOLLAR = (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1877F2" '
    'stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/>'
    '<path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'
)
ICON_FOLDER = (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" '
    'stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 '
    '01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>'
)
ICON_MAP = (
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B59B6" '
    'stroke-width="2" stroke-linecap="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 '
    '20.5 2 22l1.5-5.5L17 3z"/></svg>'
)
ICON_LOCK = (
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1877F2" '
    'stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" '
    'rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>'
)


# ────────────────────────────────────────────────────────────────────────
# Config
# ────────────────────────────────────────────────────────────────────────

def load_ad_accounts():
    raw = st.secrets.get("ad_accounts", [])
    return [
        {"id": a["id"], "name": a.get("name", a["id"]), "icon": a.get("icon", "")}
        for a in raw
    ]


AD_ACCOUNTS = load_ad_accounts()
ACCOUNT_NAMES = {a["id"]: a["name"] for a in AD_ACCOUNTS}
APP_ICONS = {a["id"]: a["icon"] for a in AD_ACCOUNTS}


# ────────────────────────────────────────────────────────────────────────
# Auth
# ────────────────────────────────────────────────────────────────────────

def handle_oauth_callback():
    qp = st.query_params
    if "code" not in qp:
        return
    code = qp["code"]
    code_verifier = st.session_state.get("code_verifier")
    try:
        creds, email = exchange_code(code, code_verifier=code_verifier)
    except Exception as e:
        st.query_params.clear()
        st.session_state.pop("auth_url", None)
        st.session_state.pop("code_verifier", None)
        st.error(f"로그인 실패: {e}")
        return
    st.query_params.clear()
    st.session_state.pop("auth_url", None)
    st.session_state.pop("code_verifier", None)
    if not email.endswith(ALLOWED_DOMAIN):
        st.session_state["auth_error"] = email
        return
    st.session_state["credentials"] = credentials_to_dict(creds)
    st.session_state["email"] = email
    st.rerun()


def login_view():
    inject_css()
    topbar()

    if "auth_url" not in st.session_state:
        auth_url, code_verifier = get_auth_url()
        st.session_state["auth_url"] = auth_url
        st.session_state["code_verifier"] = code_verifier

    auth_error_email = None
    if "auth_error" in st.session_state:
        auth_error_email = st.session_state.pop("auth_error")

    # 가운데 정렬: 좌/우 빈 컬럼으로 카드 폭 제한
    _, mid, _ = st.columns([1, 1.2, 1])
    with mid:
        with st.container(border=True):
            st.markdown(f'<div class="lock-wrap">{ICON_LOCK}</div>', unsafe_allow_html=True)
            st.markdown(
                '<div class="login-title">Loadcomplete 계정으로 로그인</div>',
                unsafe_allow_html=True,
            )
            st.markdown(
                '<div class="login-sub">이 서비스는 <b>@loadcomplete.com</b> 임직원만 이용할 수 있습니다.</div>',
                unsafe_allow_html=True,
            )

            if auth_error_email:
                st.error(f"**{auth_error_email}** 계정은 접근이 제한되어 있습니다.")

            st.link_button(
                "Google 로그인",
                st.session_state["auth_url"],
                type="primary",
                use_container_width=True,
            )


# ────────────────────────────────────────────────────────────────────────
# Drive / FB helpers
# ────────────────────────────────────────────────────────────────────────

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
            time.sleep(0.3)

    progress.progress(1.0, text="완료")
    return results


def render_results(results, mode_label: str):
    if not results:
        st.info("업로드된 소재가 없습니다.")
        return

    df = pd.DataFrame(results)
    success = int((df["status"] == "성공").sum())
    failed = int((df["status"] == "실패").sum())

    with st.container(border=True):
        head = "✅ 업로드 완료!" if failed == 0 else "⚠️ 일부 업로드 실패"
        st.markdown(
            f'<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
            f'<div style="font-size:22px">{"✅" if failed == 0 else "⚠️"}</div>'
            f'<div><div style="font-weight:600;font-size:15px">{head}</div>'
            f'<div style="font-size:12px;color:#65676B">{mode_label} · 총 {len(df)}건 처리</div></div></div>',
            unsafe_allow_html=True,
        )

        c1, c2, c3 = st.columns(3)
        c1.metric("전체", len(df))
        c2.metric("성공", success)
        c3.metric("실패", failed)

        st.dataframe(
            df[["account", "file", "status", "error"]].rename(
                columns={"account": "광고 계정", "file": "파일명", "status": "결과", "error": "에러"}
            ),
            use_container_width=True,
            hide_index=True,
        )


# ────────────────────────────────────────────────────────────────────────
# Bulk tab
# ────────────────────────────────────────────────────────────────────────

def _account_grid(key_prefix: str) -> list[str]:
    """2-column checkbox grid with PNG avatars. Returns selected account ids."""
    selected = []
    cols = st.columns(2, gap="small")
    for i, acc in enumerate(AD_ACCOUNTS):
        with cols[i % 2]:
            st.markdown('<div class="account-row">', unsafe_allow_html=True)
            rc1, rc2 = st.columns([1, 5], gap="small", vertical_alignment="center")
            with rc1:
                icon_path = PUBLIC_DIR / acc["icon"] if acc["icon"] else None
                if icon_path and icon_path.exists():
                    st.image(str(icon_path), width=38)
            with rc2:
                if st.checkbox(acc["name"], key=f"{key_prefix}_{acc['id']}"):
                    selected.append(acc["id"])
            st.markdown("</div>", unsafe_allow_html=True)
    return selected


def _set_all_bulk(value: bool):
    for acc in AD_ACCOUNTS:
        st.session_state[f"bulk_acc_{acc['id']}"] = value


def bulk_tab():
    if not AD_ACCOUNTS:
        st.warning("등록된 광고 계정이 없습니다. `secrets.toml`의 `[[ad_accounts]]`를 확인하세요.")
        return

    # Side-by-side STEP 1 (계정) and STEP 2 (Drive 링크)
    left, right = st.columns([1.15, 1], gap="medium")

    with left:
        with st.container(border=True):
            section_header(
                "#E7F3FF", ICON_DOLLAR, "광고 계정 선택", "소재를 업로드할 계정을 선택하세요",
                step="STEP 1",
            )

            sel_cols = st.columns([1, 1, 4])
            with sel_cols[0]:
                st.button(
                    "전체 선택", key="bulk_sel_all",
                    on_click=_set_all_bulk, args=(True,),
                    use_container_width=True,
                )
            with sel_cols[1]:
                st.button(
                    "전체 해제", key="bulk_sel_none",
                    on_click=_set_all_bulk, args=(False,),
                    use_container_width=True,
                )

            selected = _account_grid("bulk_acc")

    with right:
        with st.container(border=True):
            section_header(
                "#FEF3E2", ICON_FOLDER, "Google Drive 링크 입력", "폴더 URL 또는 ID (여러 개 가능)",
                step="STEP 2",
            )

            links_text = st.text_area(
                "Drive 폴더 링크",
                height=160,
                placeholder="https://drive.google.com/drive/folders/...\n폴더ID\n폴더 URL 한 줄당 하나",
                key="bulk_links",
                label_visibility="collapsed",
            )

            info_box(
                "• https://drive.google.com/drive/folders/폴더ID<br>"
                "• 폴더 ID만 직접 입력 가능<br>"
                "• 선택한 <b>모든 계정</b>에 동일하게 업로드됩니다"
            )

    if st.button(
        "📤 소재 라이브러리에 업로드 시작",
        type="primary",
        key="bulk_submit",
        disabled=not selected,
        use_container_width=True,
    ):
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


# ────────────────────────────────────────────────────────────────────────
# Mapping tab
# ────────────────────────────────────────────────────────────────────────

def mapping_tab():
    if not AD_ACCOUNTS:
        st.warning("등록된 광고 계정이 없습니다.")
        return

    account_names = [a["name"] for a in AD_ACCOUNTS]
    name_to_id = {a["name"]: a["id"] for a in AD_ACCOUNTS}

    with st.container(border=True):
        section_header(
            "#F0E6FF", ICON_MAP, "광고 계정 ↔ Drive 링크 매핑", "계정별로 다른 소재 폴더를 지정하세요"
        )

        if "mapping_df" not in st.session_state:
            st.session_state["mapping_df"] = pd.DataFrame(
                {"광고 계정": pd.Series(dtype=str), "Drive 링크": pd.Series(dtype=str)}
            )

        edited = st.data_editor(
            st.session_state["mapping_df"],
            column_config={
                "광고 계정": st.column_config.SelectboxColumn("광고 계정", options=account_names),
                "Drive 링크": st.column_config.TextColumn("Drive 폴더 URL 또는 ID"),
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

        st.markdown(
            f'<div class="mapping-summary">유효한 매핑 <strong>{len(valid_rows)}건</strong></div>',
            unsafe_allow_html=True,
        )

        info_box(
            "<b>사용 예시</b><br>"
            "• Seed Test → 광고 소재 폴더 A<br>"
            "• Seed Test → 광고 소재 폴더 B<br>"
            "• MiniTales → 광고 소재 폴더 C<br>"
            "• Legend of Slime → 광고 소재 폴더 D"
        )

    if st.button(
        "📤 매핑 업로드 시작",
        type="primary",
        key="mapping_submit",
        disabled=not valid_rows,
        use_container_width=True,
    ):
        jobs = [(fid, acc) for acc, fid in valid_rows]
        with st.status(f"{len(valid_rows)}개 매핑 업로드 중...", expanded=True) as status:
            results = run_uploads(jobs, log_box=status)
            failed = sum(1 for r in results if r["status"] == "실패")
            status.update(
                label=("완료" if failed == 0 else f"완료 (실패 {failed}건)"),
                state=("complete" if failed == 0 else "error"),
            )
        render_results(results, "매핑 업로드")


# ────────────────────────────────────────────────────────────────────────
# Dashboard
# ────────────────────────────────────────────────────────────────────────

def dashboard():
    inject_css()
    topbar()

    with st.sidebar:
        st.markdown(f"**{st.session_state.get('email', '')}**")
        st.caption("Loadcomplete")
        if st.button("로그아웃", use_container_width=True):
            st.session_state.clear()
            st.rerun()

    tab_bulk, tab_map = st.tabs(["📦  벌크 업로드", "🔀  매핑 업로드"])
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

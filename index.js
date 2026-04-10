require("dotenv").config();
const express = require("express");
const path = require("path");
const { getAuthUrl, getToken, oauth2Client, listFilesInFolder, downloadFile } = require("./drive");
const { uploadImage, uploadVideo } = require("./facebook");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const AD_ACCOUNTS = process.env.FB_AD_ACCOUNTS
  ? process.env.FB_AD_ACCOUNTS.split(",").map(a => a.trim())
  : [];

const ACCOUNT_NAMES = {
  [AD_ACCOUNTS[0]]: "Seed Test",
  [AD_ACCOUNTS[1]]: "MiniTales",
  [AD_ACCOUNTS[2]]: "Oh Happy Dog : Merge Story",
  [AD_ACCOUNTS[3]]: "Legend of Slime: Idle RPG",
  [AD_ACCOUNTS[4]]: "My Purrfect Cat Tree",
};

const APP_ICONS = {
  [AD_ACCOUNTS[0]]: "/seed.png",
  [AD_ACCOUNTS[1]]: "/minitales.png",
  [AD_ACCOUNTS[2]]: "/ohappydog.png",
  [AD_ACCOUNTS[3]]: "/legendofslime.png",
  [AD_ACCOUNTS[4]]: "/meowtower.png",
};

const ALLOWED_DOMAIN = "@loadcomplete.com";

function extractFolderId(input) {
  input = input.trim();
  const patterns = [/\/folders\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
  for (const p of patterns) { const m = input.match(p); if (m) return m[1]; }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input;
  return null;
}

const FB_LOGO = `<svg width="22" height="22" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
</svg>`;

const HTML = (content) => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Facebook Creative Uploader</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --fb: #1877F2; --fb-dark: #0d6adb; --fb-light: #E7F3FF;
  --green: #42B72A; --red: #FA3E3E;
  --bg: #F0F2F5; --card: #FFFFFF; --border: #E4E6EB;
  --text: #1C1E21; --muted: #65676B; --radius: 12px;
}
body { font-family: 'DM Sans', -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.topbar { background: var(--fb); padding: 0 24px; height: 56px; display: flex; align-items: center; gap: 10px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(24,119,242,0.3); }
.topbar-title { color: white; font-size: 17px; font-weight: 600; letter-spacing: -0.3px; }
.topbar-badge { margin-left: auto; background: rgba(255,255,255,0.2); color: white; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 500; }
.layout { display: flex; min-height: calc(100vh - 56px); }
.main-col { flex: 1; padding: 24px 20px; max-width: 620px; margin: 0 auto; }
.main-col.full { max-width: 820px; }
.side-col { width: 340px; min-height: calc(100vh - 56px); background: white; border-left: 1px solid var(--border); padding: 22px; display: flex; flex-direction: column; flex-shrink: 0; }

/* 탭 */
.tabs { display: flex; gap: 4px; background: white; border: 1px solid var(--border); border-radius: 10px; padding: 4px; margin-bottom: 16px; }
.tab-btn { flex: 1; padding: 9px 12px; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; font-family: inherit; color: var(--muted); background: none; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px; }
.tab-btn.active { background: var(--fb); color: white; box-shadow: 0 2px 8px rgba(24,119,242,0.3); }
.tab-btn:not(.active):hover { background: var(--fb-light); color: var(--fb); }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--border); padding: 20px; margin-bottom: 14px; animation: fadeUp 0.3s ease both; }
@keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
.card-header { display:flex; align-items:center; gap:10px; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--border); }
.card-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.card-title { font-size:14px; font-weight:600; color:var(--text); }
.card-subtitle { font-size:12px; color:var(--muted); margin-top:1px; }
.step-badge { margin-left:auto; background:var(--fb-light); color:var(--fb); font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; }
input[type="text"] { width:100%; padding:9px 12px; border:1.5px solid var(--border); border-radius:8px; font-size:13px; font-family:inherit; color:var(--text); background:#F7F8FA; transition:all 0.15s; outline:none; }
input[type="text"]:focus { border-color:var(--fb); background:white; box-shadow:0 0 0 3px rgba(24,119,242,0.1); }
input[type="text"]::placeholder { color:#BCC0C4; }
.drive-row { display:flex; gap:8px; margin-bottom:8px; }
.drive-row input { flex:1; }
.btn-remove { width:36px; height:36px; border:1.5px solid var(--border); background:white; border-radius:8px; cursor:pointer; color:var(--muted); font-size:16px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.15s; }
.btn-remove:hover { border-color:var(--red); color:var(--red); background:#FFF0F0; }
.btn-add { display:flex; align-items:center; gap:6px; background:none; border:1.5px dashed var(--border); border-radius:8px; padding:8px 14px; font-size:13px; font-weight:500; color:var(--fb); cursor:pointer; width:100%; margin-top:4px; transition:all 0.15s; font-family:inherit; }
.btn-add:hover { background:var(--fb-light); border-color:var(--fb); }
.accounts-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.account-item { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1.5px solid var(--border); border-radius:10px; cursor:pointer; transition:all 0.2s; background:#F7F8FA; user-select:none; }
.account-item:hover { border-color:var(--fb); background:var(--fb-light); }
.account-item.selected { border-color:var(--fb); background:var(--fb-light); box-shadow:0 0 0 3px rgba(24,119,242,0.1); }
.account-item input[type="checkbox"] { display:none; }
.account-avatar { width:36px; height:36px; border-radius:9px; flex-shrink:0; overflow:hidden; }
.account-avatar img { width:100%; height:100%; object-fit:cover; display:block; border-radius:9px; }
.account-name { font-size:12px; font-weight:500; color:var(--text); line-height:1.3; }
.account-id { font-size:10px; color:var(--muted); margin-top:1px; }
.account-check { margin-left:auto; width:18px; height:18px; border-radius:50%; border:1.5px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.2s; }
.account-item.selected .account-check { background:var(--fb); border-color:var(--fb); }
.btn-submit { width:100%; padding:13px; background:var(--fb); color:white; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; margin-top:8px; box-shadow:0 2px 8px rgba(24,119,242,0.25); }
.btn-submit:hover { background:var(--fb-dark); transform:translateY(-1px); box-shadow:0 6px 16px rgba(24,119,242,0.35); }
.btn-submit:disabled { background:#BCC0C4; box-shadow:none; cursor:not-allowed; transform:none; }
.info-box { background:var(--fb-light); border:1px solid #C5D9F8; border-radius:8px; padding:11px 13px; font-size:12px; color:#1864C8; line-height:1.7; margin-top:12px; }
.select-all-row { display:flex; justify-content:flex-end; margin-bottom:8px; gap:8px; }
.btn-sel { font-size:12px; color:var(--fb); background:none; border:none; cursor:pointer; font-family:inherit; padding:2px 6px; }
.btn-sel:hover { text-decoration:underline; }

/* 매핑 테이블 */
.mapping-table { width:100%; border-collapse:collapse; }
.mapping-table th { text-align:left; font-size:11px; font-weight:600; color:var(--muted); padding:8px 10px; border-bottom:1px solid var(--border); text-transform:uppercase; letter-spacing:0.5px; }
.mapping-row { display:grid; grid-template-columns: 1fr 1fr 36px; gap:8px; align-items:center; padding:6px 0; border-bottom:1px solid #F0F2F5; animation:fadeUp 0.2s ease both; }
.mapping-row:last-child { border-bottom:none; }
.mapping-header { display:grid; grid-template-columns: 1fr 1fr 36px; gap:8px; padding:0 0 8px; border-bottom:1px solid var(--border); margin-bottom:4px; }
.mapping-label { font-size:11px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px; }
select.account-select { width:100%; padding:9px 12px; border:1.5px solid var(--border); border-radius:8px; font-size:12.5px; font-family:inherit; color:var(--text); background:#F7F8FA; outline:none; cursor:pointer; transition:all 0.15s; appearance:none; background-image:url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2365676B' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 10px center; padding-right:28px; }
select.account-select:focus { border-color:var(--fb); background-color:white; box-shadow:0 0 0 3px rgba(24,119,242,0.1); }
.mapping-count { font-size:12px; color:var(--muted); padding:8px 0; }
.mapping-count strong { color:var(--fb); }

/* 사이드 */
.side-title { font-size:14px; font-weight:600; color:var(--text); margin-bottom:14px; display:flex; align-items:center; gap:8px; }
.pulse-dot { width:8px; height:8px; border-radius:50%; background:#BCC0C4; }
.pulse-dot.active { background:var(--fb); animation:pulse 1.2s ease infinite; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(0.8);} }
.side-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:var(--muted); }
.side-empty-icon { font-size:36px; margin-bottom:12px; opacity:0.3; }
.side-empty-text { font-size:13px; line-height:1.7; }
.summary-box { background:var(--fb-light); border:1px solid #C5D9F8; border-radius:10px; padding:12px 14px; margin-bottom:12px; }
.summary-row { display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px; }
.summary-row:last-child { margin-bottom:0; }
.summary-label { color:var(--muted); }
.summary-val { font-weight:600; color:var(--text); }
.spinner-wrap { display:flex; align-items:center; gap:10px; padding:10px 0; }
.spinner { width:16px; height:16px; border:2px solid #E4E6EB; border-top-color:var(--fb); border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0; }
@keyframes spin { to { transform:rotate(360deg); } }
.spinner-text { font-size:12px; color:var(--muted); }
.log-area { flex:1; overflow-y:auto; max-height:360px; }
.log-item { font-size:11.5px; padding:5px 0; border-bottom:1px solid #F0F2F5; display:flex; gap:8px; align-items:flex-start; }
.log-item:last-child { border-bottom:none; }
.log-dot { width:6px; height:6px; border-radius:50%; margin-top:4px; flex-shrink:0; }
.log-dot.ok { background:var(--green); }
.log-dot.err { background:var(--red); }
.log-dot.ing { background:var(--fb); animation:pulse 1s ease infinite; }
.log-text { color:var(--text); line-height:1.5; flex:1; }
.log-time { color:var(--muted); font-size:10px; white-space:nowrap; padding-top:2px; }
.stats-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:16px; }
.stat-card { background:#F7F8FA; border-radius:10px; padding:14px; text-align:center; }
.stat-num { font-size:24px; font-weight:600; margin-bottom:4px; }
.stat-label { font-size:11px; color:var(--muted); }
.result-table { width:100%; border-collapse:collapse; }
.result-table th { text-align:left; font-size:11px; font-weight:600; color:var(--muted); padding:8px 10px; border-bottom:1px solid var(--border); text-transform:uppercase; letter-spacing:0.5px; }
.result-table td { padding:9px 10px; font-size:12.5px; border-bottom:1px solid var(--border); vertical-align:middle; }
.result-table tr:last-child td { border-bottom:none; }
.badge { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:20px; font-size:11px; font-weight:500; }
.badge.success { background:#E6F9E6; color:#1B7A1B; }
.badge.fail { background:#FDECEA; color:#C62828; }
.btn-back { display:inline-flex; align-items:center; gap:6px; background:none; border:1.5px solid var(--border); border-radius:8px; padding:10px 18px; font-size:13px; font-weight:500; color:var(--text); cursor:pointer; font-family:inherit; margin-top:16px; text-decoration:none; transition:all 0.15s; }
.btn-back:hover { border-color:var(--fb); color:var(--fb); }
@media (max-width:900px) { .side-col { display:none; } .main-col { max-width:720px; } }
@media (max-width:480px) { .accounts-grid { grid-template-columns:1fr; } .stats-row { grid-template-columns:1fr 1fr; } }
</style>
</head>
<body>
<div class="topbar">
  ${FB_LOGO}
  <span class="topbar-title">Facebook Creative Uploader</span>
  <span class="topbar-badge">소재 라이브러리 전용</span>
</div>
${content}
</body></html>`;

app.get("/", (req, res) => res.redirect("/auth"));
app.get("/auth", (req, res) => res.redirect(getAuthUrl()));

app.get("/auth/google/callback", async (req, res) => {
  try {
    const tokens = await getToken(req.query.code);
    oauth2Client.setCredentials(tokens);
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const email = ticket.getPayload().email;
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      return res.status(403).send(HTML(`
        <div class="layout"><div class="main-col" style="display:flex;align-items:center;justify-content:center;min-height:70vh">
          <div class="card" style="text-align:center;max-width:400px;padding:36px">
            <div style="font-size:52px;margin-bottom:16px">🔒</div>
            <div class="card-title" style="font-size:18px;margin-bottom:10px">접근 권한 없음</div>
            <div style="font-size:13px;color:#65676B;line-height:1.8;margin-bottom:24px">
              이 서비스는 Loadcomplete 임직원만 사용할 수 있습니다.<br>
              <strong style="color:#1C1E21">${email}</strong> 계정은<br>접근이 제한되어 있습니다.
            </div>
            <a href="/auth" style="display:inline-flex;align-items:center;gap:8px;background:#1877F2;color:white;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:13.5px;font-weight:500">다른 계정으로 로그인</a>
          </div>
        </div></div>
      `));
    }
    res.redirect("/dashboard");
  } catch (err) {
    res.status(500).send("로그인 실패: " + err.message);
  }
});

app.get("/dashboard", (req, res) => {
  const accountOptions = AD_ACCOUNTS.map((id, i) => {
    const name = ACCOUNT_NAMES[id] || `광고 계정 ${i+1}`;
    const iconPath = APP_ICONS[id];
    return `<label class="account-item" id="label_${i}" onclick="toggleAccount(${i})">
      <input type="checkbox" name="adAccountIds" value="${id}" id="acc_${i}">
      <div class="account-avatar"><img src="${iconPath}" alt="${name}"></div>
      <div style="flex:1;min-width:0">
        <div class="account-name">${name}</div>
        <div class="account-id">${id}</div>
      </div>
      <div class="account-check" id="check_${i}">
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><polyline points="2,6 5,9 10,3"/></svg>
      </div>
    </label>`;
  }).join("");

  // 매핑 모드용 계정 옵션
  const accountSelectOptions = AD_ACCOUNTS.map(id =>
    `<option value="${id}">${ACCOUNT_NAMES[id] || id}</option>`
  ).join("");

  const content = `
<div class="layout">
  <div class="main-col">
    <!-- 탭 -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('bulk', this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        벌크 업로드
      </button>
      <button class="tab-btn" onclick="switchTab('mapping', this)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        매핑 업로드
      </button>
    </div>

    <!-- 벌크 업로드 탭 -->
    <div id="tab-bulk" class="tab-panel active">
      <form method="POST" action="/upload" id="bulkForm">
        <input type="hidden" name="mode" value="bulk">
        <div class="card">
          <div class="card-header">
            <div class="card-icon" style="background:#E7F3FF">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1877F2" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            </div>
            <div><div class="card-title">광고 계정 선택</div><div class="card-subtitle">소재를 업로드할 계정을 선택하세요</div></div>
            <span class="step-badge">STEP 1</span>
          </div>
          <div class="select-all-row">
            <button type="button" class="btn-sel" onclick="selectAll()">전체 선택</button>
            <button type="button" class="btn-sel" onclick="deselectAll()">전체 해제</button>
          </div>
          <div class="accounts-grid">${accountOptions}</div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-icon" style="background:#FEF3E2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            </div>
            <div><div class="card-title">Google Drive 링크 입력</div><div class="card-subtitle">폴더 URL 또는 ID (여러 개 가능)</div></div>
            <span class="step-badge">STEP 2</span>
          </div>
          <div id="bulkDriveLinks">
            <div class="drive-row" style="margin-bottom:8px">
              <input type="text" name="driveLinks" placeholder="https://drive.google.com/drive/folders/... 또는 폴더 ID"/>
              <button type="button" class="btn-remove" onclick="removeRow(this)">×</button>
            </div>
          </div>
          <button type="button" class="btn-add" onclick="addBulkRow()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Drive 링크 추가
          </button>
          <div class="info-box">
            • https://drive.google.com/drive/folders/폴더ID<br>
            • 폴더 ID만 직접 입력 가능<br>
            • 선택한 <strong>모든 계정</strong>에 동일하게 업로드됩니다
          </div>
        </div>
        <button type="submit" class="btn-submit" id="bulkSubmitBtn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          소재 라이브러리에 업로드 시작
        </button>
      </form>
    </div>

    <!-- 매핑 업로드 탭 -->
    <div id="tab-mapping" class="tab-panel">
      <form method="POST" action="/upload" id="mappingForm">
        <input type="hidden" name="mode" value="mapping">
        <div class="card">
          <div class="card-header">
            <div class="card-icon" style="background:#F0E6FF">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9B59B6" stroke-width="2" stroke-linecap="round"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </div>
            <div>
              <div class="card-title">광고 계정 ↔ Drive 링크 매핑</div>
              <div class="card-subtitle">계정별로 다른 소재 폴더를 지정하세요</div>
            </div>
          </div>

          <div class="mapping-header">
            <div class="mapping-label">광고 계정</div>
            <div class="mapping-label">Drive 링크</div>
            <div></div>
          </div>

          <div id="mappingRows">
            <div class="mapping-row">
              <select class="account-select" name="mappingAccount">${accountSelectOptions}</select>
              <input type="text" name="mappingDrive" placeholder="Drive 폴더 URL 또는 ID"/>
              <button type="button" class="btn-remove" onclick="removeMappingRow(this)">×</button>
            </div>
          </div>

          <button type="button" class="btn-add" onclick="addMappingRow()" style="margin-top:10px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            매핑 행 추가
          </button>

          <div id="mappingCount" class="mapping-count" style="margin-top:10px"></div>

          <div class="info-box" style="margin-top:10px">
            <strong>사용 예시</strong><br>
            • Seed Test → 광고 소재 폴더 A<br>
            • Seed Test → 광고 소재 폴더 B<br>
            • MiniTales → 광고 소재 폴더 C<br>
            • Legend of Slime → 광고 소재 폴더 D
          </div>
        </div>

        <button type="submit" class="btn-submit" id="mappingSubmitBtn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          매핑 업로드 시작
        </button>
      </form>
    </div>
  </div>

  <!-- 사이드 패널 -->
  <div class="side-col">
    <div class="side-title"><div class="pulse-dot" id="pulseDot"></div>업로드 현황</div>
    <div class="side-empty" id="sideEmpty">
      <div class="side-empty-icon">📤</div>
      <div class="side-empty-text">업로드를 시작하면<br>진행 현황이 여기에 표시됩니다</div>
    </div>
    <div id="sideContent" style="display:none;flex:1;flex-direction:column">
      <div class="summary-box">
        <div class="summary-row"><span class="summary-label">모드</span><span class="summary-val" id="sumMode">-</span></div>
        <div class="summary-row"><span class="summary-label">업로드 수</span><span class="summary-val" id="sumCount">-</span></div>
        <div class="summary-row"><span class="summary-label">상태</span><span class="summary-val" id="sumStatus" style="color:#1877F2">-</span></div>
      </div>
      <div class="spinner-wrap"><div class="spinner"></div><span class="spinner-text" id="spinnerText">처리 중...</span></div>
      <div class="log-area" id="logArea"></div>
    </div>
  </div>
</div>

<script>
const ACCOUNT_NAMES = ${JSON.stringify(ACCOUNT_NAMES)};
const accountSelectHTML = \`<select class="account-select" name="mappingAccount">${accountSelectOptions}</select>\`;

function switchTab(tab, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  btn.classList.add('active');
}

// 벌크 탭
function toggleAccount(i){const cb=document.getElementById('acc_'+i);const label=document.getElementById('label_'+i);cb.checked=!cb.checked;label.classList.toggle('selected',cb.checked);}
function selectAll(){document.querySelectorAll('[id^=acc_]').forEach((cb,i)=>{cb.checked=true;document.getElementById('label_'+i).classList.add('selected');});}
function deselectAll(){document.querySelectorAll('[id^=acc_]').forEach((cb,i)=>{cb.checked=false;document.getElementById('label_'+i).classList.remove('selected');});}
function addBulkRow(){const div=document.createElement('div');div.className='drive-row';div.style.marginBottom='8px';div.innerHTML='<input type="text" name="driveLinks" placeholder="https://drive.google.com/drive/folders/... 또는 폴더 ID"/><button type="button" class="btn-remove" onclick="removeRow(this)">×</button>';document.getElementById('bulkDriveLinks').appendChild(div);}
function removeRow(btn){const rows=btn.closest('#bulkDriveLinks').querySelectorAll('.drive-row');if(rows.length>1)btn.closest('.drive-row').remove();}

// 매핑 탭
function addMappingRow(){
  const div=document.createElement('div');
  div.className='mapping-row';
  div.innerHTML=accountSelectHTML+'<input type="text" name="mappingDrive" placeholder="Drive 폴더 URL 또는 ID"/><button type="button" class="btn-remove" onclick="removeMappingRow(this)">×</button>';
  document.getElementById('mappingRows').appendChild(div);
  updateMappingCount();
}
function removeMappingRow(btn){
  const rows=document.querySelectorAll('.mapping-row');
  if(rows.length>1){btn.closest('.mapping-row').remove();updateMappingCount();}
}
function updateMappingCount(){
  const rows=document.querySelectorAll('.mapping-row');
  const count=document.getElementById('mappingCount');
  if(rows.length>0) count.innerHTML='총 <strong>'+rows.length+'개</strong> 매핑이 설정되어 있습니다.';
}
updateMappingCount();
document.getElementById('mappingRows').addEventListener('change', updateMappingCount);

// 공통 로그
function addLog(text,type){
  const area=document.getElementById('logArea');
  const now=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const item=document.createElement('div');
  item.className='log-item';
  item.innerHTML='<div class="log-dot '+type+'"></div><div class="log-text">'+text+'</div><div class="log-time">'+now+'</div>';
  area.appendChild(item);
  area.scrollTop=area.scrollHeight;
}
const LOG_STEPS=[
  {text:'Google Drive 폴더 스캔 중...',delay:600,type:'ing'},
  {text:'소재 파일 목록 조회 완료',delay:2000,type:'ok'},
  {text:'소재 다운로드 중...',delay:3200,type:'ing'},
  {text:'Facebook API 연결 중...',delay:5000,type:'ing'},
  {text:'광고 계정에 소재 업로드 중...',delay:7000,type:'ing'},
];

function startUploadUI(mode, count) {
  document.getElementById('sideEmpty').style.display='none';
  document.getElementById('sideContent').style.display='flex';
  document.getElementById('pulseDot').classList.add('active');
  document.getElementById('sumMode').textContent = mode;
  document.getElementById('sumCount').textContent = count;
  document.getElementById('sumStatus').textContent='업로드 진행 중...';
  addLog('업로드 요청을 시작합니다','ing');
  LOG_STEPS.forEach(s=>setTimeout(()=>{addLog(s.text,s.type);document.getElementById('spinnerText').textContent=s.text;},s.delay));
}

document.getElementById('bulkForm').addEventListener('submit',function(){
  const accounts=document.querySelectorAll('[id^=acc_]:checked');
  const links=document.querySelectorAll('#bulkDriveLinks [name=driveLinks]');
  startUploadUI('벌크 업로드', accounts.length+'개 계정 × '+links.length+'개 폴더');
  const btn=document.getElementById('bulkSubmitBtn');
  btn.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin 0.8s linear infinite"><polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/></svg> 업로드 중...';
  btn.disabled=true;
});

document.getElementById('mappingForm').addEventListener('submit',function(){
  const rows=document.querySelectorAll('.mapping-row');
  startUploadUI('매핑 업로드', rows.length+'개 매핑');
  const btn=document.getElementById('mappingSubmitBtn');
  btn.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin 0.8s linear infinite"><polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/></svg> 업로드 중...';
  btn.disabled=true;
});
</script>`;

  res.send(HTML(content));
});

app.post("/upload", async (req, res) => {
  const mode = req.body.mode || "bulk";
  const allResults = [];

  if (mode === "bulk") {
    let { driveLinks, adAccountIds } = req.body;
    if (!driveLinks) return res.redirect("/dashboard");
    if (!Array.isArray(driveLinks)) driveLinks = [driveLinks];
    if (!Array.isArray(adAccountIds)) adAccountIds = adAccountIds ? [adAccountIds] : [];
    const folderIds = driveLinks.map(l => extractFolderId(l)).filter(Boolean);

    for (const folderId of folderIds) {
      try {
        const files = await listFilesInFolder(folderId);
        for (const file of files) {
          const buffer = await downloadFile(file.id);
          for (const accountId of adAccountIds) {
            try {
              let result;
              if (file.mimeType.startsWith("image/")) result = await uploadImage(accountId, buffer, file.name);
              else if (file.mimeType.startsWith("video/")) result = await uploadVideo(accountId, buffer, file.name);
              else continue;
              allResults.push({ file: file.name, accountId, status: "success", folderId, mode: "bulk" });
            } catch (err) {
              allResults.push({ file: file.name, accountId, status: "failed", error: err.message, folderId, mode: "bulk" });
            }
          }
        }
      } catch (err) {
        allResults.push({ file: "폴더 스캔 실패", accountId: "-", status: "failed", error: err.message, folderId, mode: "bulk" });
      }
    }
  } else if (mode === "mapping") {
    let { mappingAccount, mappingDrive } = req.body;
    if (!Array.isArray(mappingAccount)) mappingAccount = [mappingAccount];
    if (!Array.isArray(mappingDrive)) mappingDrive = [mappingDrive];

    for (let i = 0; i < mappingAccount.length; i++) {
      const accountId = mappingAccount[i];
      const folderId = extractFolderId(mappingDrive[i] || "");
      if (!accountId || !folderId) continue;

      try {
        const files = await listFilesInFolder(folderId);
        for (const file of files) {
          const buffer = await downloadFile(file.id);
          try {
            let result;
            if (file.mimeType.startsWith("image/")) result = await uploadImage(accountId, buffer, file.name);
            else if (file.mimeType.startsWith("video/")) result = await uploadVideo(accountId, buffer, file.name);
            else continue;
            allResults.push({ file: file.name, accountId, status: "success", folderId, mode: "mapping" });
          } catch (err) {
            allResults.push({ file: file.name, accountId, status: "failed", error: err.message, folderId, mode: "mapping" });
          }
        }
      } catch (err) {
        allResults.push({ file: "폴더 스캔 실패", accountId, status: "failed", error: err.message, folderId, mode: "mapping" });
      }
    }
  }

  const success = allResults.filter(r => r.status === "success").length;
  const failed = allResults.filter(r => r.status === "failed").length;

  const rows = allResults.map(r => {
    const badge = r.status === "success" ? '<span class="badge success">✓ 성공</span>' : '<span class="badge fail">✗ 실패</span>';
    const name = ACCOUNT_NAMES[r.accountId] || r.accountId;
    const iconPath = APP_ICONS[r.accountId] || "";
    const fn = r.file.length > 26 ? r.file.slice(0,24)+"…" : r.file;
    const iconHtml = iconPath ? `<img src="${iconPath}" style="width:18px;height:18px;border-radius:4px;vertical-align:middle;margin-right:5px">` : "";
    return `<tr>
      <td style="font-family:monospace;font-size:11px;color:#65676B">${r.folderId?r.folderId.slice(0,10)+"…":"-"}</td>
      <td style="font-weight:500;font-size:12px">${fn}</td>
      <td style="font-size:12px">${iconHtml}${name}</td>
      <td>${badge}</td>
    </tr>`;
  }).join("");

  const modeLabel = mode === "mapping" ? "매핑 업로드" : "벌크 업로드";

  const content = `
<div class="layout">
  <div class="main-col full">
    <div class="card">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
        <div style="width:50px;height:50px;border-radius:50%;background:${failed===0?'#E6F9E6':'#FFF3E0'};display:flex;align-items:center;justify-content:center;font-size:22px">${failed===0?'✅':'⚠️'}</div>
        <div>
          <div class="card-title" style="font-size:16px">${failed===0?'업로드 완료!':'일부 업로드 실패'}</div>
          <div class="card-subtitle">${modeLabel} · 총 ${allResults.length}건 처리</div>
        </div>
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="stat-num" style="color:#1877F2">${allResults.length}</div><div class="stat-label">전체</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#42B72A">${success}</div><div class="stat-label">성공</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#FA3E3E">${failed}</div><div class="stat-label">실패</div></div>
      </div>
      <div style="overflow-x:auto">
        <table class="result-table">
          <thead><tr><th>폴더 ID</th><th>파일명</th><th>광고 계정</th><th>결과</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:#65676B;padding:20px">업로드된 소재가 없습니다</td></tr>'}</tbody>
        </table>
      </div>
      <a href="/dashboard" class="btn-back">← 새 업로드 시작</a>
    </div>
  </div>
</div>`;

  res.send(HTML(content));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n=== Facebook Creative Uploader 서버 시작 ===`);
  console.log(`서버 주소: http://localhost:${PORT}`);
  console.log(`\nGoogle 로그인: http://localhost:${PORT}/auth\n`);
});
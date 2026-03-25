require("dotenv").config();
const express = require("express");
const { getAuthUrl, getToken, oauth2Client } = require("./drive");
const { runPipeline } = require("./pipeline");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const AD_ACCOUNTS = process.env.FB_AD_ACCOUNTS
  ? process.env.FB_AD_ACCOUNTS.split(",").map(a => a.trim())
  : [];

const ACCOUNT_NAMES = {
  [AD_ACCOUNTS[0]]: "Seed Test",
  [AD_ACCOUNTS[1]]: "MiniTales",
  [AD_ACCOUNTS[2]]: "Oh Happy Dog : Merge Story",
  [AD_ACCOUNTS[3]]: "Legend of Slime: Idle RPG",
};

function extractFolderId(input) {
  input = input.trim();
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input;
  return null;
}

const HTML = (content) => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FB Creative Uploader</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --fb: #1877F2;
    --fb-dark: #0d6efd;
    --fb-light: #E7F3FF;
    --green: #42B72A;
    --red: #FA3E3E;
    --bg: #F0F2F5;
    --card: #FFFFFF;
    --border: #E4E6EB;
    --text: #1C1E21;
    --muted: #65676B;
    --radius: 12px;
  }
  body {
    font-family: 'DM Sans', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  .topbar {
    background: var(--fb);
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }
  .topbar-logo {
    width: 36px; height: 36px;
    background: white;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
  }
  .topbar-logo svg { width: 22px; height: 22px; }
  .topbar-title {
    color: white;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }
  .topbar-badge {
    margin-left: auto;
    background: rgba(255,255,255,0.2);
    color: white;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 20px;
    font-weight: 500;
  }
  .container {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 16px;
  }
  .card {
    background: var(--card);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    padding: 28px;
    margin-bottom: 16px;
    animation: fadeUp 0.4s ease both;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .card-icon {
    width: 36px; height: 36px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .card-subtitle {
    font-size: 13px;
    color: var(--muted);
    margin-top: 2px;
  }
  .step-badge {
    margin-left: auto;
    background: var(--fb-light);
    color: var(--fb);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 20px;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
    margin-bottom: 6px;
  }
  input[type="text"] {
    width: 100%;
    padding: 11px 14px;
    border: 1.5px solid var(--border);
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    color: var(--text);
    background: #F7F8FA;
    transition: all 0.15s;
    outline: none;
    margin-bottom: 10px;
  }
  input[type="text"]:focus {
    border-color: var(--fb);
    background: white;
    box-shadow: 0 0 0 3px rgba(24,119,242,0.1);
  }
  input[type="text"]::placeholder { color: #BCC0C4; }
  .drive-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    animation: fadeUp 0.3s ease both;
  }
  .drive-row input { margin-bottom: 0; flex: 1; }
  .btn-remove {
    width: 40px; height: 40px;
    border: 1.5px solid var(--border);
    background: white;
    border-radius: 8px;
    cursor: pointer;
    color: var(--muted);
    font-size: 18px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
  }
  .btn-remove:hover { border-color: var(--red); color: var(--red); background: #FFF0F0; }
  .btn-add {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1.5px dashed var(--border);
    border-radius: 8px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--fb);
    cursor: pointer;
    width: 100%;
    margin-top: 4px;
    transition: all 0.15s;
    font-family: inherit;
  }
  .btn-add:hover { background: var(--fb-light); border-color: var(--fb); }
  .accounts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .account-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1.5px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    background: #F7F8FA;
  }
  .account-item:hover { border-color: var(--fb); background: var(--fb-light); }
  .account-item.selected {
    border-color: var(--fb);
    background: var(--fb-light);
  }
  .account-item input[type="checkbox"] { display: none; }
  .account-avatar {
    width: 32px; height: 32px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-weight: 600; font-size: 13px;
    flex-shrink: 0;
    color: white;
  }
  .account-name { font-size: 13px; font-weight: 500; color: var(--text); }
  .account-id { font-size: 11px; color: var(--muted); margin-top: 1px; }
  .account-check {
    margin-left: auto;
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
  }
  .account-item.selected .account-check {
    background: var(--fb);
    border-color: var(--fb);
  }
  .btn-submit {
    width: 100%;
    padding: 14px;
    background: var(--fb);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: all 0.15s;
    margin-top: 8px;
  }
  .btn-submit:hover { background: #1666d3; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(24,119,242,0.3); }
  .btn-submit:active { transform: translateY(0); }
  .info-box {
    background: var(--fb-light);
    border: 1px solid #B8D4F8;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12.5px;
    color: #1864C8;
    line-height: 1.6;
    margin-top: 16px;
  }
  .login-center {
    text-align: center;
    padding: 60px 20px;
  }
  .login-icon {
    width: 72px; height: 72px;
    background: var(--fb);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
  }
  .login-title {
    font-size: 22px; font-weight: 600;
    margin-bottom: 8px;
  }
  .login-desc {
    font-size: 14px; color: var(--muted);
    margin-bottom: 28px; line-height: 1.6;
  }
  .btn-login {
    display: inline-flex;
    align-items: center; gap: 10px;
    background: var(--fb);
    color: white;
    padding: 13px 28px;
    border-radius: 10px;
    font-size: 15px; font-weight: 600;
    text-decoration: none;
    transition: all 0.15s;
  }
  .btn-login:hover { background: #1666d3; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(24,119,242,0.3); }
  .result-header {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 20px;
  }
  .result-icon {
    width: 48px; height: 48px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
  }
  .result-icon.success { background: #E6F9E6; }
  .result-icon.fail { background: #FDECEA; }
  .stats-row {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 10px; margin-bottom: 20px;
  }
  .stat-card {
    background: #F7F8FA;
    border-radius: 10px;
    padding: 14px;
    text-align: center;
  }
  .stat-num {
    font-size: 26px; font-weight: 600;
    margin-bottom: 4px;
  }
  .stat-label { font-size: 12px; color: var(--muted); }
  .result-table { width: 100%; border-collapse: collapse; }
  .result-table th {
    text-align: left;
    font-size: 12px; font-weight: 600;
    color: var(--muted);
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .result-table td {
    padding: 10px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .result-table tr:last-child td { border-bottom: none; }
  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px; border-radius: 20px;
    font-size: 12px; font-weight: 500;
  }
  .badge.success { background: #E6F9E6; color: #1B7A1B; }
  .badge.fail { background: #FDECEA; color: #C62828; }
  .btn-back {
    display: inline-flex; align-items: center; gap: 6px;
    background: none; border: 1.5px solid var(--border);
    border-radius: 8px; padding: 10px 18px;
    font-size: 13px; font-weight: 500;
    color: var(--text); cursor: pointer;
    font-family: inherit; margin-top: 16px;
    text-decoration: none; transition: all 0.15s;
  }
  .btn-back:hover { border-color: var(--fb); color: var(--fb); }
  .select-all-row {
    display: flex; justify-content: flex-end;
    margin-bottom: 10px; gap: 8px;
  }
  .btn-sel {
    font-size: 12px; color: var(--fb);
    background: none; border: none; cursor: pointer;
    font-family: inherit; padding: 2px 6px;
  }
  .btn-sel:hover { text-decoration: underline; }
  @media (max-width: 480px) {
    .accounts-grid { grid-template-columns: 1fr; }
    .stats-row { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-logo">
    <svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  </div>
  <span class="topbar-title">Creative Auto-Uploader</span>
  <span class="topbar-badge">소재 라이브러리 전용</span>
</div>
<div class="container">${content}</div>
</body></html>`;

// 메인 페이지 — 로그인 안 된 경우
app.get("/", (req, res) => {
  res.redirect("/auth");
});

// Google 로그인 페이지로 이동
app.get("/auth", (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// Google 로그인 콜백
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const tokens = await getToken(code);
    oauth2Client.setCredentials(tokens);
    res.redirect("/dashboard");
  } catch (err) {
    res.status(500).send(HTML(`<div class="card"><p style="color:red">로그인 실패: ${err.message}</p></div>`));
  }
});

// 대시보드 — 메인 업로드 페이지
app.get("/dashboard", (req, res) => {
  const accountOptions = AD_ACCOUNTS.map((id, i) => {
    const colors = ["#1877F2","#42B72A","#F5A623","#E1306C"];
    const name = ACCOUNT_NAMES[id] || `광고 계정 ${i+1}`;
    const initials = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
    return `
    <label class="account-item" id="label_${i}" onclick="toggleAccount(${i})">
      <input type="checkbox" name="adAccountIds" value="${id}" id="acc_${i}">
      <div class="account-avatar" style="background:${colors[i % colors.length]}">${initials}</div>
      <div>
        <div class="account-name">${name}</div>
        <div class="account-id">${id}</div>
      </div>
      <div class="account-check" id="check_${i}">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
      </div>
    </label>`;
  }).join("");

  const content = `
  <form method="POST" action="/upload" id="uploadForm">
    <div class="card" style="animation-delay:0.05s">
      <div class="card-header">
        <div class="card-icon" style="background:#E7F3FF">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1877F2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.12 1.22 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92"/></svg>
        </div>
        <div>
          <div class="card-title">광고 계정 선택</div>
          <div class="card-subtitle">소재를 업로드할 계정을 선택하세요</div>
        </div>
        <span class="step-badge">STEP 1</span>
      </div>
      <div class="select-all-row">
        <button type="button" class="btn-sel" onclick="selectAll()">전체 선택</button>
        <button type="button" class="btn-sel" onclick="deselectAll()">전체 해제</button>
      </div>
      <div class="accounts-grid">${accountOptions}</div>
    </div>

    <div class="card" style="animation-delay:0.1s">
      <div class="card-header">
        <div class="card-icon" style="background:#FEF3E2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
        </div>
        <div>
          <div class="card-title">Google Drive 링크 입력</div>
          <div class="card-subtitle">폴더 URL 또는 ID를 입력하세요 (여러 개 가능)</div>
        </div>
        <span class="step-badge">STEP 2</span>
      </div>
      <div id="driveLinks">
        <div class="drive-row">
          <input type="text" name="driveLinks" placeholder="https://drive.google.com/drive/folders/... 또는 폴더 ID"/>
          <button type="button" class="btn-remove" onclick="removeRow(this)">×</button>
        </div>
      </div>
      <button type="button" class="btn-add" onclick="addRow()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Drive 링크 추가
      </button>
      <div class="info-box">
        <strong>지원 형식</strong><br>
        • https://drive.google.com/drive/folders/폴더ID<br>
        • 폴더 ID만 직접 입력 가능 (예: 1epth0gS9q-Lx4wWYjbcu4x00yIwz-PEC)<br>
        • 캠페인이 아닌 <strong>소재 라이브러리에만</strong> 업로드됩니다
      </div>
    </div>

    <button type="submit" class="btn-submit">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      소재 라이브러리에 업로드 시작
    </button>
  </form>

  <script>
    function toggleAccount(i) {
      const cb = document.getElementById('acc_' + i);
      const label = document.getElementById('label_' + i);
      cb.checked = !cb.checked;
      label.classList.toggle('selected', cb.checked);
    }
    function selectAll() {
      document.querySelectorAll('[id^=acc_]').forEach((cb, i) => {
        cb.checked = true;
        document.getElementById('label_' + i).classList.add('selected');
      });
    }
    function deselectAll() {
      document.querySelectorAll('[id^=acc_]').forEach((cb, i) => {
        cb.checked = false;
        document.getElementById('label_' + i).classList.remove('selected');
      });
    }
    function addRow() {
      const div = document.createElement('div');
      div.className = 'drive-row';
      div.innerHTML = '<input type="text" name="driveLinks" placeholder="https://drive.google.com/drive/folders/... 또는 폴더 ID"/><button type="button" class="btn-remove" onclick="removeRow(this)">×</button>';
      document.getElementById('driveLinks').appendChild(div);
    }
    function removeRow(btn) {
      const rows = document.querySelectorAll('.drive-row');
      if (rows.length > 1) btn.closest('.drive-row').remove();
    }
    document.getElementById('uploadForm').addEventListener('submit', function(e) {
      const btn = this.querySelector('.btn-submit');
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite"><polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/></svg> 업로드 중...';
      btn.disabled = true;
    });
    document.querySelectorAll('[id^=acc_]').forEach((cb, i) => {
      document.getElementById('label_' + i).classList.toggle('selected', cb.checked);
    });
  </script>
  <style>@keyframes spin { to { transform: rotate(360deg); } }</style>`;

  res.send(HTML(content));
});

// 업로드 처리
app.post("/upload", async (req, res) => {
  let { driveLinks, adAccountIds } = req.body;

  if (!driveLinks) return res.redirect("/dashboard");
  if (!Array.isArray(driveLinks)) driveLinks = [driveLinks];
  if (!Array.isArray(adAccountIds)) adAccountIds = adAccountIds ? [adAccountIds] : [];

  const folderIds = driveLinks
    .map(link => ({ original: link.trim(), id: extractFolderId(link.trim()) }))
    .filter(f => f.id);

  if (folderIds.length === 0 || adAccountIds.length === 0) {
    return res.redirect("/dashboard");
  }

  const allResults = [];

  for (const folder of folderIds) {
    try {
      const results = await runPipeline({ folderId: folder.id, adAccountIds });
      results.forEach(r => allResults.push({ ...r, folderId: folder.id, folderOriginal: folder.original }));
    } catch (err) {
      allResults.push({ file: "전체 폴더", accountId: adAccountIds[0], status: "failed", error: err.message, folderId: folder.id });
    }
  }

  const success = allResults.filter(r => r.status === "success").length;
  const failed = allResults.filter(r => r.status === "failed").length;
  const total = allResults.length;

  const rows = allResults.map(r => {
    const badge = r.status === "success"
      ? `<span class="badge success">✓ 성공</span>`
      : `<span class="badge fail">✗ 실패</span>`;
    const accountName = ACCOUNT_NAMES[r.accountId] || r.accountId;
    const fileName = r.file.length > 30 ? r.file.slice(0, 28) + "…" : r.file;
    return `<tr>
      <td style="font-family:monospace;font-size:12px;color:#65676B">${r.folderId ? r.folderId.slice(0,12)+"…" : "-"}</td>
      <td style="font-weight:500">${fileName}</td>
      <td style="color:#65676B;font-size:12px">${accountName}</td>
      <td>${badge}</td>
    </tr>`;
  }).join("");

  const content = `
  <div class="card">
    <div class="result-header">
      <div class="result-icon ${failed === 0 ? 'success' : 'fail'}">
        ${failed === 0 ? '✅' : '⚠️'}
      </div>
      <div>
        <div class="card-title" style="font-size:18px">${failed === 0 ? '업로드 완료!' : '일부 업로드 실패'}</div>
        <div class="card-subtitle">${folderIds.length}개 폴더 × ${adAccountIds.length}개 계정 처리 완료</div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-num" style="color:#1877F2">${total}</div>
        <div class="stat-label">전체 업로드</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color:#42B72A">${success}</div>
        <div class="stat-label">성공</div>
      </div>
      <div class="stat-card">
        <div class="stat-num" style="color:#FA3E3E">${failed}</div>
        <div class="stat-label">실패</div>
      </div>
    </div>

    <div style="overflow-x:auto">
      <table class="result-table">
        <thead>
          <tr>
            <th>폴더 ID</th>
            <th>파일명</th>
            <th>광고 계정</th>
            <th>결과</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      <a href="/dashboard" class="btn-back">
        ← 새 업로드 시작
      </a>
    </div>
  </div>`;

  res.send(HTML(content));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n=== FB Creative Uploader 서버 시작 ===`);
  console.log(`서버 주소: http://localhost:${PORT}`);
  console.log(`\n[1단계] 브라우저에서 Google 로그인:`);
  console.log(`http://localhost:${PORT}/auth\n`);
});
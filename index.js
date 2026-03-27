require("dotenv").config();
const express = require("express");
const path = require("path");
const { getAuthUrl, getToken, oauth2Client, listFilesInFolder, downloadFile } = require("./drive");
const { uploadImage, uploadVideo } = require("./facebook");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ public 폴더에서 이미지 제공
app.use(express.static(path.join(__dirname, "public")));

const AD_ACCOUNTS = process.env.FB_AD_ACCOUNTS
  ? process.env.FB_AD_ACCOUNTS.split(",").map(a => a.trim())
  : [];

const ACCOUNT_NAMES = {
  [AD_ACCOUNTS[0]]: "Seed Test",
  [AD_ACCOUNTS[1]]: "MiniTales",
  [AD_ACCOUNTS[2]]: "Oh Happy Dog : Merge Story",
  [AD_ACCOUNTS[3]]: "Legend of Slime: Idle RPG",
};

// ✅ 직접 제공한 앱 아이콘 이미지 경로
const APP_ICONS = {
  [AD_ACCOUNTS[0]]: "/seed.png",
  [AD_ACCOUNTS[1]]: "/minitales.png",
  [AD_ACCOUNTS[2]]: "/ohappydog.png",
  [AD_ACCOUNTS[3]]: "/legendofslime.png",
};

const ICON_COLORS = ["#2E7D32","#E65100","#4A148C","#1565C0"];
const ALLOWED_DOMAIN = "@loadcomplete.com";

function extractFolderId(input) {
  input = input.trim();
  const patterns = [/\/folders\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/];
  for (const p of patterns) { const m = input.match(p); if (m) return m[1]; }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(input)) return input;
  return null;
}

const HTML = (content) => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meta Creative Uploader</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --fb: #0866FF; --fb-light: #E7F3FF;
  --green: #42B72A; --red: #FA3E3E;
  --bg: #F0F2F5; --card: #FFFFFF; --border: #E4E6EB;
  --text: #1C1E21; --muted: #65676B; --radius: 12px;
}
body { font-family: 'DM Sans', -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.topbar { background: linear-gradient(135deg,#0866FF 0%,#0052CC 100%); padding: 0 24px; height: 56px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(8,102,255,0.3); }
.topbar-logo { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
.topbar-logo img { width: 36px; height: 36px; object-fit: contain; filter: brightness(0) invert(1); }
.topbar-title { color: white; font-size: 17px; font-weight: 600; letter-spacing: -0.3px; }
.topbar-badge { margin-left: auto; background: rgba(255,255,255,0.2); color: white; font-size: 11px; padding: 4px 10px; border-radius: 20px; font-weight: 500; }
.layout { display: flex; min-height: calc(100vh - 56px); }
.main-col { flex: 1; padding: 28px 20px; max-width: 520px; margin: 0 auto; }
.main-col.full { max-width: 720px; }
.side-col { width: 360px; min-height: calc(100vh - 56px); background: white; border-left: 1px solid var(--border); padding: 24px; display: flex; flex-direction: column; flex-shrink: 0; }
.card { background: var(--card); border-radius: var(--radius); border: 1px solid var(--border); padding: 22px; margin-bottom: 14px; animation: fadeUp 0.35s ease both; }
@keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
.card-header { display:flex; align-items:center; gap:10px; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid var(--border); }
.card-icon { width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.card-title { font-size:15px; font-weight:600; color:var(--text); }
.card-subtitle { font-size:12px; color:var(--muted); margin-top:2px; }
.step-badge { margin-left:auto; background:var(--fb-light); color:var(--fb); font-size:11px; font-weight:600; padding:3px 9px; border-radius:20px; }
input[type="text"] { width:100%; padding:10px 13px; border:1.5px solid var(--border); border-radius:8px; font-size:13.5px; font-family:inherit; color:var(--text); background:#F7F8FA; transition:all 0.15s; outline:none; margin-bottom:8px; }
input[type="text"]:focus { border-color:var(--fb); background:white; box-shadow:0 0 0 3px rgba(8,102,255,0.1); }
input[type="text"]::placeholder { color:#BCC0C4; }
.drive-row { display:flex; gap:8px; margin-bottom:8px; animation:fadeUp 0.25s ease both; }
.drive-row input { margin-bottom:0; flex:1; }
.btn-remove { width:38px; height:38px; border:1.5px solid var(--border); background:white; border-radius:8px; cursor:pointer; color:var(--muted); font-size:17px; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.15s; }
.btn-remove:hover { border-color:var(--red); color:var(--red); background:#FFF0F0; }
.btn-add { display:flex; align-items:center; gap:6px; background:none; border:1.5px dashed var(--border); border-radius:8px; padding:9px 14px; font-size:13px; font-weight:500; color:var(--fb); cursor:pointer; width:100%; margin-top:4px; transition:all 0.15s; font-family:inherit; }
.btn-add:hover { background:var(--fb-light); border-color:var(--fb); }
.accounts-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.account-item { display:flex; align-items:center; gap:10px; padding:11px 13px; border:1.5px solid var(--border); border-radius:10px; cursor:pointer; transition:all 0.2s; background:#F7F8FA; user-select:none; }
.account-item:hover { border-color:var(--fb); background:var(--fb-light); }
.account-item.selected { border-color:var(--fb); background:var(--fb-light); box-shadow:0 0 0 3px rgba(8,102,255,0.1); }
.account-item input[type="checkbox"] { display:none; }
.account-avatar { width:40px; height:40px; border-radius:10px; flex-shrink:0; overflow:hidden; display:flex; align-items:center; justify-content:center; }
.account-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
.account-name { font-size:12.5px; font-weight:500; color:var(--text); line-height:1.3; }
.account-id { font-size:10px; color:var(--muted); margin-top:2px; }
.account-check { margin-left:auto; width:18px; height:18px; border-radius:50%; border:1.5px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.2s; }
.account-item.selected .account-check { background:var(--fb); border-color:var(--fb); }
.btn-submit { width:100%; padding:13px; background:linear-gradient(135deg,#0866FF,#0052CC); color:white; border:none; border-radius:10px; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s; margin-top:8px; box-shadow:0 2px 8px rgba(8,102,255,0.25); }
.btn-submit:hover { transform:translateY(-1px); box-shadow:0 6px 16px rgba(8,102,255,0.35); }
.btn-submit:disabled { background:#BCC0C4; box-shadow:none; cursor:not-allowed; transform:none; }
.info-box { background:var(--fb-light); border:1px solid #C5D9F8; border-radius:8px; padding:12px 14px; font-size:12px; color:#1864C8; line-height:1.7; margin-top:14px; }
.select-all-row { display:flex; justify-content:flex-end; margin-bottom:10px; gap:8px; }
.btn-sel { font-size:12px; color:var(--fb); background:none; border:none; cursor:pointer; font-family:inherit; padding:2px 6px; }
.btn-sel:hover { text-decoration:underline; }
.side-title { font-size:14px; font-weight:600; color:var(--text); margin-bottom:16px; display:flex; align-items:center; gap:8px; }
.pulse-dot { width:8px; height:8px; border-radius:50%; background:#BCC0C4; }
.pulse-dot.active { background:var(--fb); animation: pulse 1.2s ease infinite; }
@keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(0.8);} }
.side-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color:var(--muted); }
.side-empty-icon { font-size:40px; margin-bottom:14px; opacity:0.3; }
.side-empty-text { font-size:13px; line-height:1.7; }
.summary-box { background:linear-gradient(135deg,#E7F3FF,#F0F7FF); border:1px solid #C5D9F8; border-radius:10px; padding:14px; margin-bottom:14px; }
.summary-row { display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px; }
.summary-row:last-child { margin-bottom:0; }
.summary-label { color:var(--muted); }
.summary-val { font-weight:600; color:var(--text); }
.spinner-wrap { display:flex; align-items:center; gap:10px; padding:12px 0; }
.spinner { width:18px; height:18px; border:2.5px solid #E4E6EB; border-top-color:var(--fb); border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0; }
@keyframes spin { to { transform:rotate(360deg); } }
.spinner-text { font-size:12.5px; color:var(--muted); }
.log-area { flex:1; overflow-y:auto; max-height:380px; }
.log-item { font-size:12px; padding:6px 0; border-bottom:1px solid #F0F2F5; display:flex; gap:8px; align-items:flex-start; }
.log-item:last-child { border-bottom:none; }
.log-dot { width:7px; height:7px; border-radius:50%; margin-top:4px; flex-shrink:0; }
.log-dot.ok { background:var(--green); }
.log-dot.err { background:var(--red); }
.log-dot.ing { background:var(--fb); animation:pulse 1s ease infinite; }
.log-text { color:var(--text); line-height:1.5; flex:1; }
.log-time { color:var(--muted); font-size:10px; white-space:nowrap; padding-top:2px; }
.stats-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:18px; }
.stat-card { background:#F7F8FA; border-radius:10px; padding:14px; text-align:center; }
.stat-num { font-size:26px; font-weight:600; margin-bottom:4px; }
.stat-label { font-size:11px; color:var(--muted); }
.result-table { width:100%; border-collapse:collapse; }
.result-table th { text-align:left; font-size:11px; font-weight:600; color:var(--muted); padding:8px 10px; border-bottom:1px solid var(--border); text-transform:uppercase; letter-spacing:0.5px; }
.result-table td { padding:10px; font-size:12.5px; border-bottom:1px solid var(--border); vertical-align:middle; }
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
  <div class="topbar-logo">
  <img src="/meta.png" alt="Meta" style="width:32px;height:32px;object-fit:contain;">
  </div>
  <span class="topbar-title">Meta Creative Uploader</span>
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
        <div class="layout">
          <div class="main-col" style="display:flex;align-items:center;justify-content:center;min-height:70vh">
            <div class="card" style="text-align:center;max-width:400px;padding:36px">
              <div style="font-size:52px;margin-bottom:16px">🔒</div>
              <div class="card-title" style="font-size:18px;margin-bottom:10px">접근 권한 없음</div>
              <div style="font-size:13px;color:#65676B;line-height:1.8;margin-bottom:24px">
                이 서비스는 Loadcomplete 임직원만 사용할 수 있습니다.<br>
                <strong style="color:#1C1E21">${email}</strong> 계정은<br>접근이 제한되어 있습니다.
              </div>
              <a href="/auth" style="display:inline-flex;align-items:center;gap:8px;background:#0866FF;color:white;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:13.5px;font-weight:500">
                다른 계정으로 로그인
              </a>
            </div>
          </div>
        </div>
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
      <div class="account-avatar">
        <img src="${iconPath}" alt="${name}" style="border-radius:10px">
      </div>
      <div style="flex:1;min-width:0">
        <div class="account-name">${name}</div>
        <div class="account-id">${id}</div>
      </div>
      <div class="account-check" id="check_${i}">
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><polyline points="2,6 5,9 10,3"/></svg>
      </div>
    </label>`;
  }).join("");

  const content = `
<div class="layout">
  <div class="main-col">
    <form method="POST" action="/upload" id="uploadForm">
      <div class="card">
        <div class="card-header">
          <div class="card-icon" style="background:#E7F3FF">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0866FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
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
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F5A623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          </div>
          <div><div class="card-title">Google Drive 링크 입력</div><div class="card-subtitle">폴더 URL 또는 ID 입력 (여러 개 가능)</div></div>
          <span class="step-badge">STEP 2</span>
        </div>
        <div id="driveLinks">
          <div class="drive-row">
            <input type="text" name="driveLinks" placeholder="https://drive.google.com/drive/folders/... 또는 폴더 ID"/>
            <button type="button" class="btn-remove" onclick="removeRow(this)">×</button>
          </div>
        </div>
        <button type="button" class="btn-add" onclick="addRow()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Drive 링크 추가
        </button>
        <div class="info-box">
          <strong>지원 형식</strong><br>
          • https://drive.google.com/drive/folders/폴더ID<br>
          • 폴더 ID만 직접 입력 가능<br>
          • 캠페인이 아닌 <strong>소재 라이브러리에만</strong> 업로드됩니다
        </div>
      </div>

      <button type="submit" class="btn-submit" id="submitBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        소재 라이브러리에 업로드 시작
      </button>
    </form>
  </div>

  <div class="side-col">
    <div class="side-title">
      <div class="pulse-dot" id="pulseDot"></div>
      업로드 현황
    </div>
    <div class="side-empty" id="sideEmpty">
      <div class="side-empty-icon">📤</div>
      <div class="side-empty-text">업로드를 시작하면<br>진행 현황이 여기에 표시됩니다</div>
    </div>
    <div id="sideContent" style="display:none;flex:1;flex-direction:column">
      <div class="summary-box">
        <div class="summary-row"><span class="summary-label">대상 계정</span><span class="summary-val" id="sumAccounts">-</span></div>
        <div class="summary-row"><span class="summary-label">Drive 폴더</span><span class="summary-val" id="sumFolders">-</span></div>
        <div class="summary-row"><span class="summary-label">상태</span><span class="summary-val" id="sumStatus" style="color:#0866FF">-</span></div>
      </div>
      <div class="spinner-wrap" id="spinnerWrap">
        <div class="spinner"></div>
        <span class="spinner-text" id="spinnerText">처리 중...</span>
      </div>
      <div class="log-area" id="logArea"></div>
    </div>
  </div>
</div>

<script>
function toggleAccount(i){const cb=document.getElementById('acc_'+i);const label=document.getElementById('label_'+i);cb.checked=!cb.checked;label.classList.toggle('selected',cb.checked);}
function selectAll(){document.querySelectorAll('[id^=acc_]').forEach((cb,i)=>{cb.checked=true;document.getElementById('label_'+i).classList.add('selected');});}
function deselectAll(){document.querySelectorAll('[id^=acc_]').forEach((cb,i)=>{cb.checked=false;document.getElementById('label_'+i).classList.remove('selected');});}
function addRow(){const div=document.createElement('div');div.className='drive-row';div.innerHTML='<input type="text" name="driveLinks" placeholder="https://drive.google.com/drive/folders/... 또는 폴더 ID"/><button type="button" class="btn-remove" onclick="removeRow(this)">×</button>';document.getElementById('driveLinks').appendChild(div);}
function removeRow(btn){const rows=document.querySelectorAll('.drive-row');if(rows.length>1)btn.closest('.drive-row').remove();}
function addLog(text,type){const area=document.getElementById('logArea');const now=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});const item=document.createElement('div');item.className='log-item';item.innerHTML='<div class="log-dot '+type+'"></div><div class="log-text">'+text+'</div><div class="log-time">'+now+'</div>';area.appendChild(item);area.scrollTop=area.scrollHeight;}
const LOG_STEPS=[
  {text:'Google Drive 폴더 스캔 중...',delay:600,type:'ing'},
  {text:'소재 파일 목록 조회 완료',delay:2000,type:'ok'},
  {text:'소재 다운로드 중...',delay:3200,type:'ing'},
  {text:'Facebook API 연결 중...',delay:5000,type:'ing'},
  {text:'광고 계정에 소재 업로드 중...',delay:7000,type:'ing'},
];
document.getElementById('uploadForm').addEventListener('submit',function(e){
  const accounts=document.querySelectorAll('[id^=acc_]:checked');
  const links=document.querySelectorAll('[name=driveLinks]');
  document.getElementById('sideEmpty').style.display='none';
  document.getElementById('sideContent').style.display='flex';
  document.getElementById('pulseDot').classList.add('active');
  document.getElementById('sumAccounts').textContent=accounts.length+'개';
  document.getElementById('sumFolders').textContent=links.length+'개';
  document.getElementById('sumStatus').textContent='업로드 진행 중...';
  addLog('업로드 요청을 시작합니다','ing');
  LOG_STEPS.forEach(s=>setTimeout(()=>{addLog(s.text,s.type);document.getElementById('spinnerText').textContent=s.text;},s.delay));
  const btn=document.getElementById('submitBtn');
  btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation:spin 0.8s linear infinite"><polyline points="23,4 23,11 16,11"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 11"/></svg> 업로드 중...';
  btn.disabled=true;
});
</script>`;

  res.send(HTML(content));
});

app.post("/upload", async (req, res) => {
  let { driveLinks, adAccountIds } = req.body;
  if (!driveLinks) return res.redirect("/dashboard");
  if (!Array.isArray(driveLinks)) driveLinks = [driveLinks];
  if (!Array.isArray(adAccountIds)) adAccountIds = adAccountIds ? [adAccountIds] : [];

  const folderIds = driveLinks.map(link => ({ original: link.trim(), id: extractFolderId(link.trim()) })).filter(f => f.id);
  if (folderIds.length === 0 || adAccountIds.length === 0) return res.redirect("/dashboard");

  const allResults = [];
  for (const folder of folderIds) {
    try {
      const files = await listFilesInFolder(folder.id);
      for (const file of files) {
        const buffer = await downloadFile(file.id);
        for (const accountId of adAccountIds) {
          try {
            let result;
            if (file.mimeType.startsWith("image/")) result = await uploadImage(accountId, buffer, file.name);
            else if (file.mimeType.startsWith("video/")) result = await uploadVideo(accountId, buffer, file.name);
            else continue;
            allResults.push({ file: file.name, accountId, status: "success", result, folderId: folder.id });
          } catch (err) {
            allResults.push({ file: file.name, accountId, status: "failed", error: err.message, folderId: folder.id });
          }
        }
      }
    } catch (err) {
      allResults.push({ file: "폴더 스캔 실패", accountId: "-", status: "failed", error: err.message, folderId: folder.id });
    }
  }

  const success = allResults.filter(r => r.status === "success").length;
  const failed = allResults.filter(r => r.status === "failed").length;

  const rows = allResults.map(r => {
    const badge = r.status === "success" ? '<span class="badge success">✓ 성공</span>' : '<span class="badge fail">✗ 실패</span>';
    const name = ACCOUNT_NAMES[r.accountId] || r.accountId;
    const iconPath = APP_ICONS[r.accountId] || "";
    const fn = r.file.length > 28 ? r.file.slice(0,26)+"…" : r.file;
    const iconHtml = iconPath ? `<img src="${iconPath}" style="width:20px;height:20px;border-radius:5px;vertical-align:middle;margin-right:6px">` : "";
    return `<tr>
      <td style="font-family:monospace;font-size:11px;color:#65676B">${r.folderId?r.folderId.slice(0,10)+"…":"-"}</td>
      <td style="font-weight:500">${fn}</td>
      <td style="color:#65676B;font-size:12px">${iconHtml}${name}</td>
      <td>${badge}</td>
    </tr>`;
  }).join("");

  const content = `
<div class="layout">
  <div class="main-col full">
    <div class="card">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div style="width:52px;height:52px;border-radius:50%;background:${failed===0?'#E6F9E6':'#FFF3E0'};display:flex;align-items:center;justify-content:center;font-size:24px">${failed===0?'✅':'⚠️'}</div>
        <div>
          <div class="card-title" style="font-size:17px">${failed===0?'업로드 완료!':'일부 업로드 실패'}</div>
          <div class="card-subtitle">${folderIds.length}개 폴더 × ${adAccountIds.length}개 계정 처리 완료</div>
        </div>
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="stat-num" style="color:#0866FF">${allResults.length}</div><div class="stat-label">전체</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#42B72A">${success}</div><div class="stat-label">성공</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#FA3E3E">${failed}</div><div class="stat-label">실패</div></div>
      </div>
      <div style="overflow-x:auto">
        <table class="result-table">
          <thead><tr><th>폴더 ID</th><th>파일명</th><th>광고 계정</th><th>결과</th></tr></thead>
          <tbody>${rows}</tbody>
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
  console.log(`\n=== Meta Creative Uploader 서버 시작 ===`);
  console.log(`서버 주소: http://localhost:${PORT}`);
  console.log(`\nGoogle 로그인: http://localhost:${PORT}/auth\n`);
});
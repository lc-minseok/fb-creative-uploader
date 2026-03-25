require("dotenv").config();
const express = require("express");
const { getAuthUrl, getToken, oauth2Client } = require("./drive");
const { runPipeline } = require("./pipeline");

const app = express();
app.use(express.json());

// 1) Google 로그인 페이지로 이동
app.get("/auth", (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// 2) Google 로그인 후 자동으로 돌아오는 주소
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;

  try {
    const tokens = await getToken(code);
    oauth2Client.setCredentials(tokens);
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
res.send(`
  <h2>✅ Google 로그인 성공!</h2>
  <p>이제 아래 주소로 업로드를 실행할 수 있습니다.</p>
  <pre>POST ${baseUrl}/upload</pre>
  <br>
  <form method="POST" action="${baseUrl}/upload" 
        style="font-family:sans-serif; padding:20px;">
    <label>Drive 폴더 ID:</label><br>
    <input name="folderId" style="width:400px; padding:8px; margin:8px 0;" 
           placeholder="Google Drive 폴더 ID 입력"/><br>
    <button type="submit" 
            style="background:#1877F2; color:white; padding:10px 24px; 
                   border:none; border-radius:6px; cursor:pointer; font-size:14px;">
      소재 라이브러리에 업로드
    </button>
  </form>
`);
  } catch (err) {
    res.status(500).send("로그인 실패: " + err.message);
  }
});

// 3) 업로드 실행 API
app.post("/upload", async (req, res) => {
  const { folderId, adAccountIds } = req.body;

  if (!folderId || !adAccountIds || adAccountIds.length === 0) {
    return res.status(400).json({
      error: "folderId 와 adAccountIds 는 필수입니다.",
    });
  }

  try {
    console.log("업로드 요청 수신:", { folderId, adAccountIds });
    const results = await runPipeline({ folderId, adAccountIds });
    res.json({ success: true, results });
  } catch (err) {
    console.error("업로드 오류:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4) 서버 시작
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n=== FB Creative Uploader 서버 시작 ===`);
  console.log(`서버 주소: http://localhost:${PORT}`);
  console.log(`\n[1단계] 브라우저에서 아래 주소로 Google 로그인 해주세요:`);
  console.log(`http://localhost:${PORT}/auth\n`);
});
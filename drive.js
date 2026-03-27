require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");

const TOKEN_PATH = "token.json";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// 저장된 토큰 자동 로드
if (fs.existsSync(TOKEN_PATH)) {
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oauth2Client.setCredentials(token);
  console.log("저장된 토큰 로드 완료");
}

function getAuthUrl() {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.readonly", "openid", "email"],
    prompt: "consent",
  });
  return url;
}

async function getToken(code) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  // 토큰을 파일로 저장
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log("토큰 저장 완료:", TOKEN_PATH);
  return tokens;
}

async function listFilesInFolder(folderId) {
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false and (
          mimeType contains 'image/' or
          mimeType contains 'video/'
        )`,
    fields: "files(id, name, mimeType, size, createdTime)",
    supportsAllDrives: true,        // ← 추가
    includeItemsFromAllDrives: true, // ← 추가
  });

  console.log("스캔 결과:", JSON.stringify(res.data.files, null, 2));
  return res.data.files;
}

async function downloadFile(fileId) {
  const drive = google.drive({ version: "v3", auth: oauth2Client });

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(res.data);
}

module.exports = { getAuthUrl, getToken, listFilesInFolder, downloadFile, oauth2Client };
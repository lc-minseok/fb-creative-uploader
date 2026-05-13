require("dotenv").config();
const { listFilesInFolder, downloadFile, oauth2Client } = require("./drive");
const { uploadImage, uploadVideoByUrl } = require("./facebook");

// 잠깐 대기 (메모리 안정화)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runPipeline({ folderId, adAccountIds }) {
  console.log("=== 파이프라인 시작 ===");
  console.log(`드라이브 폴더 ID: ${folderId}`);
  console.log(`대상 광고 계정: ${adAccountIds.join(", ")}`);

  let files;
  try {
    files = await listFilesInFolder(folderId);
    console.log(`→ ${files.length}개 소재 감지`);
  } catch (err) {
    console.error("폴더 스캔 실패:", err.message);
    return [{ file: "폴더 스캔 실패", accountId: "-", status: "failed", error: err.message }];
  }

  if (files.length === 0) {
    console.log("업로드할 소재가 없습니다.");
    return [];
  }

  const results = [];

  for (const file of files) {
    console.log(`\n처리 중: ${file.name} (${file.mimeType})`);

    for (const accountId of adAccountIds) {
      console.log(`업로드 중 → [${accountId}]`);
      try {
        let result;

        if (file.mimeType.startsWith("image/")) {
          // 이미지: Buffer 다운로드 후 업로드
          let buffer = await downloadFile(file.id);
          result = await uploadImage(accountId, buffer, file.name);
          // 즉시 메모리 해제
          buffer = null;

        } else if (file.mimeType.startsWith("video/")) {
          // 동영상: URL 직접 전달 (서버 메모리 사용 없음)
          const token = oauth2Client.credentials.access_token;
          const fileUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&access_token=${token}`;
          result = await uploadVideoByUrl(accountId, fileUrl, file.name);

        } else {
          console.log(`→ 지원하지 않는 형식: ${file.mimeType}`);
          continue;
        }

        results.push({
          file: file.name,
          accountId,
          status: "success",
          result,
        });
        console.log(`→ 완료 ✅`);

      } catch (err) {
        console.error(`→ 실패 ❌: ${err.message}`);
        results.push({
          file: file.name,
          accountId,
          status: "failed",
          error: err.message,
        });
      }

      // 각 업로드 사이 0.5초 대기 (메모리 안정화)
      await sleep(500);
    }
  }

  const success = results.filter(r => r.status === "success").length;
  const failed = results.filter(r => r.status === "failed").length;
  console.log(`\n=== 결과: 성공 ${success}건 / 실패 ${failed}건 ===`);

  return results;
}

module.exports = { runPipeline };

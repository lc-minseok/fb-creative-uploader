require("dotenv").config();
const { listFilesInFolder, downloadFile } = require("./drive");
const { uploadImage, uploadVideo } = require("./facebook");

async function runPipeline({ folderId, adAccountIds }) {
  console.log("=== 파이프라인 시작 ===");
  console.log(`드라이브 폴더 ID: ${folderId}`);

  const files = await listFilesInFolder(folderId);
  console.log(`→ ${files.length}개 소재 감지`);

  if (files.length === 0) return [];

  const results = [];

  for (const file of files) {
    console.log(`\n다운로드 중: ${file.name}`);

    let buffer;
    try {
      buffer = await downloadFile(file.id);
      console.log(`→ 다운로드 완료 (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err) {
      console.error(`→ 다운로드 실패: ${err.message}`);
      for (const accountId of adAccountIds) {
        results.push({ file: file.name, accountId, status: "failed", error: err.message });
      }
      continue;
    }

    for (const accountId of adAccountIds) {
      console.log(`업로드 중 → [${accountId}] ${file.name}`);
      try {
        let result;
        if (file.mimeType.startsWith("image/")) {
          result = await uploadImage(accountId, buffer, file.name);
        } else if (file.mimeType.startsWith("video/")) {
          result = await uploadVideo(accountId, buffer, file.name);
        } else {
          continue;
        }
        results.push({ file: file.name, accountId, status: "success", result });
        console.log(`→ 완료 ✅`);
      } catch (err) {
        console.error(`→ 실패 ❌: ${err.message}`);
        results.push({ file: file.name, accountId, status: "failed", error: err.message });
      }
    }

    // ✅ 파일 처리 후 메모리 즉시 해제
    buffer = null;
    if (global.gc) global.gc();
  }

  const success = results.filter(r => r.status === "success").length;
  const failed = results.filter(r => r.status === "failed").length;
  console.log(`\n=== 결과: 성공 ${success}건 / 실패 ${failed}건 ===`);

  return results;
}

module.exports = { runPipeline };
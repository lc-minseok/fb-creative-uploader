require("dotenv").config();
const { listFilesInFolder, downloadFile } = require("./drive");
const { uploadImage, uploadVideo } = require("./facebook");

async function runPipeline({ folderId, adAccountIds }) {
  console.log("=== 파이프라인 시작 ===");
  console.log(`드라이브 폴더 ID: ${folderId}`);
  console.log(`대상 광고 계정: ${adAccountIds.join(", ")}`);

  // 1) Google Drive 폴더 스캔
  console.log("\n1. Google Drive 폴더 스캔 중...");
  const files = await listFilesInFolder(folderId);
  console.log(`   → ${files.length}개 소재 감지`);

  if (files.length === 0) {
    console.log("업로드할 소재가 없습니다.");
    return [];
  }

  const results = [];

  // 2) 각 소재를 각 광고 계정에 업로드
  for (const file of files) {
    console.log(`\n2. 다운로드 중: ${file.name} (${file.mimeType})`);
    const buffer = await downloadFile(file.id);
    console.log(`   → 다운로드 완료 (${buffer.length} bytes)`);

    for (const accountId of adAccountIds) {
      console.log(`3. 업로드 중 → [${accountId}] ${file.name}`);

      try {
        let result;

        if (file.mimeType.startsWith("image/")) {
          result = await uploadImage(accountId, buffer, file.name);
        } else if (file.mimeType.startsWith("video/")) {
          result = await uploadVideo(accountId, buffer, file.name);
        } else {
          console.log(`   → 지원하지 않는 형식: ${file.mimeType}`);
          continue;
        }

        results.push({
          file: file.name,
          accountId,
          status: "success",
          result,
        });
        console.log(`   → 업로드 완료 ✅`);

      } catch (err) {
        console.error(`   → 업로드 실패 ❌:`, err.message);
        results.push({
          file: file.name,
          accountId,
          status: "failed",
          error: err.message,
        });
      }
    }
  }

  // 3) 결과 요약
  console.log("\n=== 업로드 결과 요약 ===");
  const success = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`성공: ${success}건 / 실패: ${failed}건`);

  return results;
}

module.exports = { runPipeline };
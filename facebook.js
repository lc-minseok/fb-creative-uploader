require("dotenv").config();
const axios = require("axios");
const FormData = require("form-data");

const FB_API = "https://graph.facebook.com/v20.0";
const TOKEN = process.env.FB_ACCESS_TOKEN;

// 1) 이미지 → 소재 라이브러리 업로드
async function uploadImage(adAccountId, fileBuffer, fileName) {
  const form = new FormData();
  form.append("filename", fileBuffer, { filename: fileName });
  form.append("access_token", TOKEN);

  const res = await axios.post(
    `${FB_API}/${adAccountId}/adimages`,
    form,
    { headers: form.getHeaders() }
  );

  const images = res.data.images;
  const imageData = images[Object.keys(images)[0]];
  console.log(`이미지 업로드 완료 [${adAccountId}]:`, imageData.hash);
  return imageData;
}

// 2) 동영상 → 소재 라이브러리 업로드 (Resumable)
async function uploadVideo(adAccountId, fileBuffer, fileName) {
  // Phase 1: 업로드 세션 시작
  const startRes = await axios.post(`${FB_API}/${adAccountId}/advideos`, {
    upload_phase: "start",
    file_size: fileBuffer.length,
    access_token: TOKEN,
  });

  const { upload_session_id, video_id, start_offset, end_offset } =
    startRes.data;

  // Phase 2: 청크 단위 전송 (4MB씩)
  let currentStart = parseInt(start_offset);
  let currentEnd = parseInt(end_offset);

  while (currentStart < fileBuffer.length) {
    const chunk = fileBuffer.slice(currentStart, currentEnd);
    const form = new FormData();
    form.append("upload_phase", "transfer");
    form.append("upload_session_id", upload_session_id);
    form.append("start_offset", currentStart);
    form.append("video_file_chunk", chunk, { filename: fileName });
    form.append("access_token", TOKEN);

    const transferRes = await axios.post(
      `${FB_API}/${adAccountId}/advideos`,
      form,
      { headers: form.getHeaders() }
    );

    currentStart = parseInt(transferRes.data.start_offset);
    currentEnd = parseInt(transferRes.data.end_offset);
  }

  // Phase 3: 업로드 완료
  await axios.post(`${FB_API}/${adAccountId}/advideos`, {
    upload_phase: "finish",
    upload_session_id,
    title: fileName,
    access_token: TOKEN,
  });

  console.log(`동영상 업로드 완료 [${adAccountId}]:`, video_id);
  return { video_id };
}

module.exports = { uploadImage, uploadVideo };
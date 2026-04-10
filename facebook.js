require("dotenv").config();
const axios = require("axios");
const FormData = require("form-data");

const FB_API = "https://graph.facebook.com/v20.0";
const TOKEN = process.env.FB_ACCESS_TOKEN;

// 이미지 업로드 (Buffer)
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

// 동영상 URL로 직접 업로드 (메모리 사용 없음)
async function uploadVideoByUrl(adAccountId, fileUrl, fileName) {
  const res = await axios.post(`${FB_API}/${adAccountId}/advideos`, {
    file_url: fileUrl,
    title: fileName,
    access_token: TOKEN,
  });

  console.log(`동영상 URL 업로드 완료 [${adAccountId}]:`, res.data.id);
  return { video_id: res.data.id };
}

// 동영상 Buffer 업로드 (fallback용)
async function uploadVideo(adAccountId, fileBuffer, fileName) {
  const startRes = await axios.post(`${FB_API}/${adAccountId}/advideos`, {
    upload_phase: "start",
    file_size: fileBuffer.length,
    access_token: TOKEN,
  });

  const { upload_session_id, video_id, start_offset, end_offset } = startRes.data;
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

  await axios.post(`${FB_API}/${adAccountId}/advideos`, {
    upload_phase: "finish",
    upload_session_id,
    title: fileName,
    access_token: TOKEN,
  });

  console.log(`동영상 업로드 완료 [${adAccountId}]:`, video_id);
  return { video_id };
}

module.exports = { uploadImage, uploadVideo, uploadVideoByUrl };

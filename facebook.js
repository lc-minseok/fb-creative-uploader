require("dotenv").config();
const axios = require("axios");
const FormData = require("form-data");

const FB_API = "https://graph.facebook.com/v20.0";
const TOKEN = process.env.FB_ACCESS_TOKEN;

// 이미지 업로드 (Buffer 방식 - 이미지는 용량 작아서 문제 없음)
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

// 동영상 업로드 (URL 방식 - 서버 메모리 사용 없음)
async function uploadVideoByUrl(adAccountId, fileUrl, fileName) {
  const res = await axios.post(
    `${FB_API}/${adAccountId}/advideos`,
    {
      file_url: fileUrl,
      title: fileName,
      access_token: TOKEN,
    },
    { timeout: 300000 } // 5분 타임아웃
  );

  console.log(`동영상 URL 업로드 완료 [${adAccountId}]:`, res.data.id);
  return { video_id: res.data.id };
}

module.exports = { uploadImage, uploadVideoByUrl };

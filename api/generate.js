export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { apiKey, operation, payload } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "Missing API Key." });
  }

  const AIML_URL = "https://api.aimlapi.com/v1/images/generations/";

  // تنظيف base64
  function cleanBase64(str) {
    if (!str) return null;

    return String(str)
      .replace(/(\r\n|\n|\r)/gm, "") // إزالة الأسطر الجديدة
      .replace(/ /g, "");            // إزالة المسافات
    // نترك prefix كما هو (data:image/png;base64,...) حسب ما قاله فريق AIMLAPI
  }

  // تحميل صورة من URL وتحويلها إلى data:image/...;base64,...
  async function fetchImageAsDataUrl(url) {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error("Failed to download image from URL.");
    }

    const contentType = resp.headers.get("content-type") || "image/png";
    const arrayBuffer = await resp.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  }

  // --- اختبار الاتصال ---
  if (operation === "test") {
    try {
      const test = await fetch(AIML_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "flux/schnell",
          prompt: "test connection"
        }),
      });

      const data = await test.json().catch(() => ({}));

      if (!test.ok) {
        throw new Error(data.error?.message || "Invalid API Key");
      }

      return res.status(200).json({
        status: "ok",
        message: "Connection successful"
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // --- تجهيز payload حسب العملية ---
  let finalPayload;

  // 1) Text to Image
  if (operation === "text-to-image") {
    finalPayload = {
      model: payload.model,
      prompt: payload.prompt
    };
  }

  // 2) Remove Background (نرسل base64 مباشرة من المتصفح)
  if (operation === "remove-bg") {
    finalPayload = {
      model: payload.model,
      prompt: "remove background",
      image: cleanBase64(payload.image)
    };
  }

  // 3) Edit Image / تصميم المنتج
  if (operation === "edit-image") {
    let img = payload.image;

    // إذا كانت الصورة URL (ناتجة من خطوة إزالة الخلفية)
    // نحولها إلى base64 قبل إرسالها لـ AIMLAPI
    if (img && img.startsWith("http")) {
      img = await fetchImageAsDataUrl(img);
    }

    finalPayload = {
      model: payload.model,
      prompt: payload.prompt,      // الوصف الجديد
      image: cleanBase64(img)      // الآن دائماً base64
      // لا نضيف mask لأن وثائق AIMLAPI التي عندك لا تطلبه
    };
  }

  // --- إرسال الطلب لـ AIMLAPI ---
  try {
    const response = await fetch(AIML_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(finalPayload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("AIML Error:", data);
      // نُعيد رسالة الخطأ كاملة عشان لو استمر المشكلة تشوف السبب الحقيقي
      return res.status(500).json({
        error: data.error?.message || JSON.stringify(data) || "AIML API request failed"
      });
    }

    // استخراج رابط الصورة من الرد
    const url =
      data?.data?.[0]?.url ||
      data?.image_url ||
      data?.image ||
      null;

    if (!url) {
      return res.status(500).json({
        error: "Image URL not found in AIML API response."
      });
    }

    // نرجّع النتيجة حسب العملية
    if (operation === "text-to-image") {
      return res.status(200).json({ imageUrl: url });
    }

    if (operation === "remove-bg") {
      return res.status(200).json({ productImageUrl: url });
    }

    if (operation === "edit-image") {
      return res.status(200).json({ finalImageUrl: url });
    }

    return res.status(400).json({ error: "Unknown operation." });

  } catch (err) {
    console.error("Backend Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

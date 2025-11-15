export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { apiKey, operation, payload } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "Missing API Key." });
  }

  // تنظيف base64
  function cleanBase64(str) {
    if (!str) return null;

    return String(str)
      .replace(/(\r\n|\n|\r)/gm, "")
      .replace(/ /g, "")
      .replace(/^data:image\/[^;]+;base64,/, match => match); // الحفاظ على النوع
  }

  const AIML_URL = "https://api.aimlapi.com/v1/images/generations/";

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

      if (!test.ok) {
        const err = await test.json();
        throw new Error(err.error?.message || "Invalid API Key");
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
  let finalPayload = {};

  // 1. Text to Image
  if (operation === "text-to-image") {
    finalPayload = {
      model: payload.model,
      prompt: payload.prompt,
    };
  }

  // 2. Remove Background
  if (operation === "remove-bg") {
    finalPayload = {
      model: payload.model,
      prompt: "remove background",
      image: cleanBase64(payload.image)
    };
  }

  // 3. Edit Image (تصميم المنتج)
  if (operation === "edit-image") {
    finalPayload = {
      model: payload.model,
      prompt: payload.prompt,
      image: cleanBase64(payload.image),
      mask: null  // 🔥 أهم نقطة — الحل النهائي للمشكلة
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

    const data = await response.json();

    if (!response.ok) {
      console.error("AIML Error:", data);
      return res.status(500).json({
        error: data.error?.message || "AIML API request failed"
      });
    }

    // استخراج رابط الصورة
    const url =
      data.data?.[0]?.url ||
      data.image_url ||
      data.image ||
      null;

    if (!url) {
      return res.status(500).json({
        error: "Image URL not found in AIML API response."
      });
    }

    // إرسال النتيجة للواجهة حسب العملية
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

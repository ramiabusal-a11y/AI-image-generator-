export default async function handler(req, res) {
  // السماح فقط بطلبات POST
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { apiKey, operation, payload } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "Missing API Key." });
  }

  // تنظيف الـ Base64 ومنع الأخطاء
  function cleanBase64(str) {
    if (!str) return null;

    return String(str)
      .replace(/(\r\n|\n|\r)/gm, "")   // حذف الأسطر الجديدة
      .replace(/ /g, "")               // حذف الفراغات
      .replace(/^data:image\/[^;]+;base64,/, "data:image/png;base64,"); // توحيد الصيغة
  }

  const AIML_URL = "https://api.aimlapi.com/v1/images/generations/";

  // 🔹 اختبار الاتصال
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

  // 🔹 تجهيز Payload النهائي بناءً على العملية
  let finalPayload = {};

  if (operation === "text-to-image") {
    finalPayload = {
      model: payload.model,
      prompt: payload.prompt
    };
  }

  if (operation === "remove-bg") {
    finalPayload = {
      model: payload.model,
      prompt: "remove background",
      image: cleanBase64(payload.image)
    };
  }

  if (operation === "edit-image") {
    finalPayload = {
      model: payload.model,
      prompt: payload.prompt,
      image: cleanBase64(payload.image)
    };
  }

  // 🔹 إرسال الطلب إلى AIMLAPI
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
      return res.status(500).json({ error: "Image URL not found in response." });
    }

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

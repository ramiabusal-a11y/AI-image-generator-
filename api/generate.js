export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const { apiKey, operation, payload } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "Missing API Key." });
  }

  // نفس endpoint القديم للتوليد / إزالة الخلفية
  const AIML_GENERATE_URL = "https://api.aimlapi.com/v1/images/generations/";
  // endpoint جديد للتحرير
  const AIML_EDIT_URL = "https://api.aimlapi.com/v1/images/edits";

  // تنظيف الـ base64 من الأسطر والمسافات
  function cleanBase64(str) {
    if (!str) return null;
    return String(str)
      .replace(/(\r\n|\n|\r)/gm, "")
      .replace(/ /g, "");
  }

  // استخراج الـ mime والبيانات من data URL
  function parseDataUrl(dataUrl) {
    if (!dataUrl) return { mime: "image/png", data: null };

    const match = String(dataUrl).match(/^data:(.+);base64,(.*)$/);
    if (match) {
      return { mime: match[1], data: match[2] };
    }
    // لو جاءنا Base64 بدون data:... نعامله كـ PNG
    return { mime: "image/png", data: dataUrl };
  }

  // ================================
  //  (1) اختبار الاتصال
  // ================================
  if (operation === "test") {
    try {
      const test = await fetch(AIML_GENERATE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "flux/schnell",
          prompt: "test connection",
        }),
      });

      if (!test.ok) {
        const err = await test.json();
        throw new Error(err.error?.message || "Invalid API Key");
      }

      return res
        .status(200)
        .json({ status: "ok", message: "Connection successful" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ================================
  //  (2) عملية خاصة بالتحرير edit-image
  //     (هنا نريد استخدام صورة المنتج فعلياً)
  // ================================
  if (operation === "edit-image") {
    try {
      if (!payload || !payload.image) {
        return res.status(400).json({ error: "Missing product image." });
      }

      // نحول data URL إلى bytes
      const cleaned = cleanBase64(payload.image);
      const { mime, data } = parseDataUrl(cleaned);

      if (!data) {
        return res.status(400).json({ error: "Invalid image data." });
      }

      const buffer = Buffer.from(data, "base64");
      const blob = new Blob([buffer], { type: mime || "image/png" });

      const formData = new FormData();
      // نُجبِر الموديل على gpt-image-1 حتى لو المستخدم كتب شيئاً آخر في الإعدادات
      formData.append("model", "openai/gpt-image-1");
      formData.append(
        "prompt",
        payload.prompt ||
          "Place this product in a clean, professional marketing scene."
      );
      // اسم افتراضي للملف
      const ext = (mime && mime.split("/")[1]) || "png";
      formData.append("image", blob, `product.${ext}`);

      const response = await fetch(AIML_EDIT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // لا نضع Content-Type هنا، fetch يضبطه تلقائياً مع boundary
        },
        body: formData,
      });

      const dataResp = await response.json();

      if (!response.ok) {
        console.error("AIML Edit Error:", dataResp);
        return res.status(500).json({
          error:
            dataResp.error?.message || "AIML API edit request failed (step 3).",
        });
      }

      const url =
        dataResp.data?.[0]?.url ||
        dataResp.image_url ||
        dataResp.image ||
        null;

      if (!url) {
        return res.status(500).json({
          error: "Image URL not found in AIML API edit response.",
        });
      }

      return res.status(200).json({ finalImageUrl: url });
    } catch (err) {
      console.error("Backend Edit Error:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ================================
  //  (3) باقي العمليات (Text-to-Image + Remove BG)
  //      عبر /images/generations كما كانت
  // ================================
  let finalPayload = {};

  // --- Text → Image ---
  if (operation === "text-to-image") {
    finalPayload = {
      model: payload.model, // flux/schnell من الإعدادات
      prompt: payload.prompt,
    };
  }

  // --- Remove Background (Qwen يعمل هنا) ---
  if (operation === "remove-bg") {
    finalPayload = {
      model: payload.model, // alibaba/qwen-image-edit من الإعدادات
      prompt: "remove background",
      image: cleanBase64(payload.image),
    };
  }

  if (!operation || !finalPayload.model) {
    return res.status(400).json({ error: "Invalid operation or model." });
  }

  try {
    const response = await fetch(AIML_GENERATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(finalPayload),
    });

    const dataResp = await response.json();

    if (!response.ok) {
      console.error("AIML Generate Error:", dataResp);
      return res.status(500).json({
        error: dataResp.error?.message || "AIML API request failed.",
      });
    }

    const url =
      dataResp.data?.[0]?.url ||
      dataResp.image_url ||
      dataResp.image ||
      null;

    if (!url) {
      return res.status(500).json({
        error: "Image URL not found in AIML API response.",
      });
    }

    if (operation === "text-to-image") {
      return res.status(200).json({ imageUrl: url });
    }

    if (operation === "remove-bg") {
      return res.status(200).json({ productImageUrl: url });
    }

    return res.status(400).json({ error: "Unknown operation." });
  } catch (err) {
    console.error("Backend Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

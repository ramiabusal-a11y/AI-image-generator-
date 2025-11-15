// هذا الملف يجب أن يكون باسم: api/generate.js
// (تحديث: قمنا بتنظيف base64 + تحسين رسائل الخطأ لتظهر في الواجهة)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    const { apiKey, operation, payload } = req.body;

    if (!apiKey) {
        return res.status(400).json({ error: 'مفتاح API مفقود.' });
    }

    // 1. عملية اختبار الاتصال
    if (operation === 'test') {
        try {
             const testResponse = await fetch('https://api.aimlapi.com/v1/images/generations/', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ model: 'flux/schnell', prompt: 'test' }), 
             });

            if (!testResponse.ok) {
                 // --- ( ( ( التعديل هنا ) ) ) ---
                 // إظهار الخطأ الحقيقي
                 const errorData = await testResponse.json();
                 const errorMessage = errorData.error?.message || 'فشل الاتصال - مفتاح غير صالح';
                 throw new Error(errorMessage);
                 // --- ( ( ( نهاية التعديل ) ) ) ---
            }
            
            return res.status(200).json({ status: 'ok', message: 'تم الاتصال بنجاح (حقيقي)' });

        } catch (error) {
            console.error('Test connection error:', error);
            return res.status(500).json({ error: error.message });
        }
    }

    // 2. عمليات توليد الصور
    const AIML_API_URL = 'https://api.aimlapi.com/v1/images/generations/';

    try {
        if (payload.image && payload.image.startsWith('data:image/')) {
            payload.image = payload.image.split(',')[1];
        }

        const response = await fetch(AIML_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload), 
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('AIML API Error:', errorData);
            
            // --- ( ( ( التعديل هنا ) ) ) ---
            // إظهار الخطأ الحقيقي للمستخدم
            // مثال: "Model not found" أو "Invalid prompt"
            const detailedError = errorData.error?.message || 'فشل الطلب من AIML API';
            throw new Error(detailedError);
            // --- ( ( ( نهاية التعديل ) ) ) ---
        }

        const data = await response.json();

        const imageUrl = data.data?.[0]?.url || data.image_url || data.image; 

        if (!imageUrl) {
            console.error('Invalid response structure from AIML API:', data);
            throw new Error('لم يتم العثور على رابط الصورة في الرد.');
        }

        // إعادة تنسيق الرد
        if (operation === 'text-to-image') {
            return res.status(200).json({ imageUrl: imageUrl });
        }
        if (operation === 'remove-bg') {
            return res.status(200).json({ productImageUrl: imageUrl });
        }
        if (operation === 'edit-image') {
            return res.status(200).json({ finalImageUrl: imageUrl });
        }

        return res.status(400).json({ error: 'عملية غير معروفة' });

    } catch (error) {
        console.error('Backend error:', error);
        // إرسال الخطأ الحقيقي للواجهة
        return res.status(500).json({ error: error.message });
    }
}

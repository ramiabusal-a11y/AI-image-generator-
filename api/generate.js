// هذا الملف يجب أن يكون باسم: api/generate.js
// (تحديث: قمنا بإضافة كود لتنظيف بيانات base64 قبل إرسالها)

export default async function handler(req, res) {
    // السماح فقط بطلبات POST
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
                body: JSON.stringify({ model: 'flux/schnell', prompt: 'test' }), // طلب اختبار بسيط
             });

            if (!testResponse.ok) {
                 const errorData = await testResponse.json();
                 throw new Error(errorData.error?.message || 'فشل الاتصال - مفتاح غير صالح');
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
        // --- ( ( ( التعديل هنا ) ) ) ---
        // التحقق إذا كان الطلب يحتوي على صورة (لإزالة الخلفية أو التعديل)
        if (payload.image && payload.image.startsWith('data:image/')) {
            // AIML API قد يتوقع بيانات base64 "خام" بدون المقدمة
            // سنقوم بإزالة المقدمة (مثل "data:image/png;base64,")
            payload.image = payload.image.split(',')[1];
        }
        // --- ( ( ( نهاية التعديل ) ) ) ---

        const response = await fetch(AIML_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload), // إرسال الحمولة (payload) بعد تعديلها
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('AIML API Error:', errorData);
            // هذه هي الرسالة التي رأيتها في التطبيق
            throw new Error(errorData.error?.message || 'فشل الطلب من AIML API');
        }

        const data = await response.json();

        // افتراض أن الصورة المرجعة موجودة في هذا المسار
        // قد تحتاج لتعديل هذا المسار بناءً على الرد الفعلي من AIMLAPI
        const imageUrl = data.data?.[0]?.url || data.image_url || data.image; 

        if (!imageUrl) {
            console.error('Invalid response structure from AIML API:', data);
            throw new Error('لم يتم العثور على رابط الصورة في الرد.');
        }

        // إعادة تنسيق الرد ليتناسب مع ما تتوقعه الواجهة الأمامية
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
        return res.status(500).json({ error: error.message });
    }
}

import admin from 'firebase-admin';

// Инициализируем Firebase Admin, если он еще не запущен
if (!admin.apps.length) {
    try {
        // Мы берем ключ из переменной окружения Vercel
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Ошибка инициализации:", e);
    }
}

const db = admin.firestore();

export default async function handler(req, res) {
    // 1. Разрешаем только POST запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 2. Проверка секретного ключа (чтобы никто чужой не спамил в базу)
    if (req.headers['x-api-key'] !== process.env.API_SECRET_KEY) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const { gameID, nickName, status, logText, moderationStatus } = req.body;

        if (!gameID || !nickName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // 3. Записываем данные в Firestore
        // Код использует projectId из твоего JSON-ключа автоматически
        await db.collection('appeals').doc(String(gameID)).set({
            nickName: nickName,
            status: status || "NotSubmitted",
            logText: logText || null,
            moderationStatus: moderationStatus || "New",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Firestore Error:", error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

import admin from 'firebase-admin';

// Инициализация Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

export default async function handler(req, res) {
    // 1. Общая защита
    if (req.headers['x-api-key'] !== process.env.API_SECRET_KEY) {
        return res.status(403).json({ error: 'Unauthorized: Invalid API Key' });
    }

    const { method } = req;

    // 2. GET: Проверка статуса (для скрипта при заходе игрока)
    if (method === 'GET') {
        const userId = req.headers['x-player-id'];
        if (!userId) return res.status(400).json({ error: 'Missing x-player-id' });
        
        const doc = await db.collection('appeals').doc(String(userId)).get();
        return res.status(200).json(doc.exists ? doc.data() : { status: "unbanned" });
    }

// --- ЛОГИКА POST (Подача апелляции) ---
    if (method === 'POST') {
        // Добавляем проверку: если body пустой, возвращаем ошибку, а не падаем
        if (!req.body) return res.status(400).json({ error: 'Body is missing' });
        
        const { userId, nickName, logText } = req.body;
        
        if (!userId || !nickName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await db.collection('appeals').doc(String(userId)).set({
            nickName: nickName,
            logText: logText || "No logs provided",
            moderationStatus: "New",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

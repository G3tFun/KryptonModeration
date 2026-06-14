import admin from 'firebase-admin';

// Инициализация Firebase Admin
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (e) {
        console.error("Ошибка инициализации Firebase:", e);
    }
}

const db = admin.firestore();

export default async function handler(req, res) {
    // 1. Защита API
    const API_SECRET = req.headers['x-api-key'];
    if (API_SECRET !== process.env.API_SECRET_KEY) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { method } = req;

    // 2. GET: Проверка статуса игрока
    // Ожидаемые заголовки: x-game-id, x-player-id
    if (method === 'GET') {
        const gameID = req.headers['x-game-id'];
        const userId = req.headers['x-player-id'];

        if (!gameID || !userId) {
            return res.status(400).json({ error: 'Missing x-game-id or x-player-id' });
        }

        try {
            const doc = await db.collection('appeals')
                .doc(String(gameID))
                .collection('players')
                .doc(String(userId))
                .get();

            return res.status(200).json(doc.exists ? doc.data() : { status: "unbanned" });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // 3. POST: Создание/Обновление апелляции
    // Ожидаемый JSON Body: { "gameID": "...", "userId": "...", "nickName": "...", "logText": "..." }
    if (method === 'POST') {
        const { gameID, userId, nickName, logText } = req.body;

        if (!gameID || !userId || !nickName) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        try {
            await db.collection('appeals')
                .doc(String(gameID))
                .collection('players')
                .doc(String(userId))
                .set({
                    nickName: nickName,
                    logText: logText || "",
                    moderationStatus: "New",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

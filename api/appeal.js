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
    const { method } = req;
    const API_KEY = req.headers['x-api-key'];
    const ADMIN_KEY = req.headers['x-admin-key'];

    // 1. ПРОВЕРКА ДОСТУПА
    // Для Roblox используем API_KEY, для сайта-админки ADMIN_KEY
    if (API_KEY !== process.env.API_SECRET_KEY && ADMIN_KEY !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // 2. GET: Проверка статуса (для Roblox) ИЛИ Получение всех заявок (для Админки)
    if (method === 'GET') {
        const gameID = req.headers['x-game-id'];
        
        // Если передан x-admin-key — отдаем список всех игроков для админки
        if (ADMIN_KEY === process.env.ADMIN_SECRET) {
            if (!gameID) return res.status(400).json({ error: 'Missing x-game-id' });
            
            const snapshot = await db.collection('appeals').doc(String(gameID)).collection('players').get();
            const players = snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() }));
            return res.status(200).json(players);
        }

        // Если обычный запрос от Roblox
        const userId = req.headers['x-player-id'];
        if (!gameID || !userId) return res.status(400).json({ error: 'Missing identifiers' });

        const doc = await db.collection('appeals').doc(String(gameID)).collection('players').doc(String(userId)).get();
        return res.status(200).json(doc.exists ? doc.data() : { moderationStatus: "unbanned" });
    }

    // 3. POST: Создание апелляции (Roblox) ИЛИ Обновление статуса (Админка)
    if (method === 'POST') {
        const { gameID, userId, nickName, logText, moderationStatus } = req.body;

        if (!gameID || !userId) return res.status(400).json({ error: 'Missing gameID or userId' });

        const playerRef = db.collection('appeals').doc(String(gameID)).collection('players').doc(String(userId));

        // Если админ обновляет статус
        if (ADMIN_KEY === process.env.ADMIN_SECRET && moderationStatus) {
            await playerRef.update({ moderationStatus: moderationStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(200).json({ success: true });
        }

        // Если игрок подает апелляцию
        await playerRef.set({
            nickName: nickName,
            logText: logText || "",
            moderationStatus: "InModeration", // Автоматически ставим статус "На проверке"
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

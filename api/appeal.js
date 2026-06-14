import admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (e) { console.error("Firebase init error:", e); }
}

const db = admin.firestore();

export default async function handler(req, res) {
    // Разрешаем запросы с любого сайта (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'x-api-key, x-admin-key, x-game-id, x-player-id, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;
    const API_KEY = req.headers['x-api-key'];
    const ADMIN_KEY = req.headers['x-admin-key'];
    const gameID = req.headers['x-game-id'];

    // 1. АДМИН-ПАНЕЛЬ (Список всех игр и игроков)
    if (ADMIN_KEY === process.env.ADMIN_SECRET) {
        if (method === 'GET') {
            if (!gameID) {
                // Возвращаем список всех ID игр
                const snapshot = await db.collection('appeals').listDocuments();
                return res.status(200).json(snapshot.map(doc => doc.id));
            } else {
                // Возвращаем всех игроков конкретной игры
                const snapshot = await db.collection('appeals').doc(String(gameID)).collection('players').get();
                return res.status(200).json(snapshot.docs.map(doc => ({ userId: doc.id, ...doc.data() })));
            }
        }
        if (method === 'POST') {
            const { userId, moderationStatus } = req.body;
            await db.collection('appeals').doc(String(gameID)).collection('players').doc(String(userId))
                .update({ moderationStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(200).json({ success: true });
        }
    }

    // 2. ROBLOX (Обычная работа)
    if (API_KEY !== process.env.API_SECRET_KEY) return res.status(403).json({ error: 'Unauthorized' });

    if (method === 'GET') {
        const userId = req.headers['x-player-id'];
        if (!gameID || !userId) return res.status(400).json({ error: 'Missing IDs' });
        const doc = await db.collection('appeals').doc(String(gameID)).collection('players').doc(String(userId)).get();
        return res.status(200).json(doc.exists ? doc.data() : { moderationStatus: "unbanned" });
    }

    if (method === 'POST') {
        const { userId, nickName, logText } = req.body;
        await db.collection('appeals').doc(String(gameID)).collection('players').doc(String(userId)).set({
            nickName, logText: logText || "", moderationStatus: "InModeration",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

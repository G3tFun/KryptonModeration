import admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (e) { console.error("Firebase init error:", e); }
}

const db = admin.firestore();

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'x-api-key, x-admin-key, x-game-id, x-player-id, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { method } = req;
    const API_KEY = req.headers['x-api-key'];
    const ADMIN_KEY = req.headers['x-admin-key'];
    const gameID = req.headers['x-game-id'];

    // 1. АДМИН-ПАНЕЛЬ
    if (ADMIN_KEY === process.env.ADMIN_KEY) {
        if (method === 'GET') {
            if (!gameID) {
                // Возвращаем список всех ID игр (документов в коллекции 'games')
                const snapshot = await db.collection('games').listDocuments();
                return res.status(200).json(snapshot.map(doc => doc.id));
            } else {
                // Извлекаем данные из всех подколлекций в параллельном режиме
                const gameRef = db.collection('games').doc(String(gameID));
                const collections = ['ban', 'appeal', 'warn', 'warnAppeal'];
                
                const fetchPromises = collections.map(col => 
                    gameRef.collection(col).get().then(snap => 
                        snap.docs.map(doc => ({ userId: doc.id, ...doc.data() }))
                    )
                );
                
                const results = await Promise.all(fetchPromises);
                const mergedPlayers = results.flat(); // Объединяем все документы в один плоский массив
                return res.status(200).json(mergedPlayers);
            }
        }
        if (method === 'POST') {
            const { userId, type, status } = req.body;
            if (!gameID || !userId || !type) return res.status(400).json({ error: 'Missing parameters' });
            
            // Админ обновляет статус апелляции (обычной или варна)
            const collectionName = type.toLowerCase(); // 'appeal' или 'warnappeal'
            await db.collection('games').doc(String(gameID)).collection(collectionName).doc(String(userId))
                .update({ status: status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                
            return res.status(200).json({ success: true });
        }
    }

    // 2. ROBLOX INTEGRATION
    if (API_KEY !== process.env.API_SECRET_KEY) return res.status(403).json({ error: 'Unauthorized' });

    if (method === 'GET') {
        const userId = req.headers['x-player-id'];
        if (!gameID || !userId) return res.status(400).json({ error: 'Missing IDs' });
        
        const gameRef = db.collection('games').doc(String(gameID));
        
        // Сначала ищем в апелляциях (высший приоритет)
        const appealDoc = await gameRef.collection('appeal').doc(String(userId)).get();
        if (appealDoc.exists) {
            return res.status(200).json(appealDoc.data());
        }
        
        // Если апелляции нет, проверяем активный бан
        const banDoc = await gameRef.collection('ban').doc(String(userId)).get();
        if (banDoc.exists) {
            return res.status(200).json(banDoc.data());
        }
        
        // Проверяем наличие варнов
        const warnDoc = await gameRef.collection('warn').doc(String(userId)).get();
        if (warnDoc.exists) {
            return res.status(200).json(warnDoc.data());
        }

        // Проверяем наличие апелляции на варны
        const warnAppealDoc = await gameRef.collection('warnAppeal').doc(String(userId)).get();
        if (warnAppealDoc.exists) {
            return res.status(200).json(warnAppealDoc.data());
        }
        
        return res.status(200).json({ status: "unbanned" });
    }

    if (method === 'POST') {
        const { userId, nickName, type, logText, warnPoints, whenLastGavePoint, firstWarnLogs, secondWarnLogs } = req.body;
        if (!gameID || !userId || !type) return res.status(400).json({ error: 'Missing IDs or Type' });

        const gameRef = db.collection('games').doc(String(gameID));

        // Логика записи в зависимости от типа сущности
        if (type === 'Ban') {
            await gameRef.collection('ban').doc(String(userId)).set({
                nickName,
                type: 'Ban',
                logText: logText || "No logs provided",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } 
        
        else if (type === 'Appeal') {
            // Подтягиваем оригинальный лог бана из коллекции "ban", чтобы роблокс его не передавал
            const banDoc = await gameRef.collection('ban').doc(String(userId)).get();
            const originalLog = banDoc.exists ? (banDoc.data().logText || "No logs found in Ban record") : "No ban record found";
            
            await gameRef.collection('appeal').doc(String(userId)).set({
                nickName,
                type: 'Appeal',
                status: 'New',
                logText: originalLog,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } 
        
        else if (type === 'Warn') {
            await gameRef.collection('warn').doc(String(userId)).set({
                nickName,
                type: 'Warn',
                warnPoints: Number(warnPoints) || 0,
                whenLastGavePoint: whenLastGavePoint || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } 
        
        else if (type === 'WarnAppeal') {
            await gameRef.collection('warnAppeal').doc(String(userId)).set({
                nickName,
                type: 'WarnAppeal',
                status: 'New',
                warnPoints: Number(warnPoints) || 0,
                firstWarnLogs: firstWarnLogs || "No logs",
                secondWarnLogs: secondWarnLogs || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}

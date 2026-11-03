const { createClient } = require('@libsql/client/web');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
    // Habilitar CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Mètode no permès' });

    try {
        // 1. Comprovar la identitat de l'usuari (Token)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autoritzat' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user_id = decoded.id;

        // 2. Agafar les dades del xat actual
        const { id, mode, chat_history, calendar, games } = req.body;
        if (!id || !mode) return res.status(400).json({ error: 'Falten dades importants de la sessió' });

        const client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });

        // 3. Guardar o Actualitzar a Turso (UPSERT)
        await client.execute({
            sql: `INSERT INTO sessions (id, user_id, mode, chat_history, calendar, games, updated_at) 
                  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(id) DO UPDATE SET 
                  chat_history = excluded.chat_history,
                  calendar = excluded.calendar,
                  games = excluded.games,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [
                id, 
                user_id, 
                mode, 
                JSON.stringify(chat_history || []), 
                JSON.stringify(calendar || []), 
                JSON.stringify(games || {})
            ]
        });

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al guardar la sessió: ' + error.message });
    }
}

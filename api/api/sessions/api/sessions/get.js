const { createClient } = require('@libsql/client');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
    // Habilitar CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Mètode no permès' });

    try {
        // 1. Identificar a l'usuari
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autoritzat' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user_id = decoded.id;

        const client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });

        // 2. Buscar totes les seves sessions ordenades de més nova a més vella
        const result = await client.execute({
            sql: 'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC',
            args: [user_id]
        });

        // 3. Formatejar-ho per al Frontend
        const sessions = result.rows.map(row => ({
            id: row.id,
            mode: row.mode,
            history: JSON.parse(row.chat_history || '[]'),
            calendar: JSON.parse(row.calendar || '[]'),
            games: JSON.parse(row.games || '{}'),
            date: new Date(row.updated_at).getTime()
        }));

        return res.status(200).json({ success: true, sessions });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al carregar les sessions: ' + error.message });
    }
}

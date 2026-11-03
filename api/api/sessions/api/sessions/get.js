const { createClient } = require('@libsql/client/web');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No autoritzat' });
        
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);

        const client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });

        const result = await client.execute({
            sql: 'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC',
            args: [decoded.id]
        });

        const sessions = result.rows.map(row => ({
            id: row.id,
            mode: row.mode,
            title: row.title || (row.mode === 'study' ? "📚 Pla d'Estudis" : "💬 XatBot lliure"),
            history: JSON.parse(row.chat_history || '[]'),
            calendar: JSON.parse(row.calendar || '[]'),
            games: JSON.parse(row.games || '{}'),
            html: row.html || '',
            date: new Date(row.updated_at).getTime()
        }));

        return res.status(200).json({ success: true, sessions });
    } catch (error) {
        return res.status(500).json({ error: 'Error: ' + error.message });
    }
}

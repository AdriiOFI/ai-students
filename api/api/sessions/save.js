const { createClient } = require('@libsql/client/web');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No autoritzat' });
        
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const { id, mode, title, chat_history, calendar, games, html, context, pdf_text } = req.body;

        const client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });

        await client.execute({
            sql: `INSERT INTO sessions (id, user_id, mode, title, chat_history, calendar, games, html, context, pdf_text, updated_at) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(id) DO UPDATE SET 
                  title = excluded.title,
                  chat_history = excluded.chat_history,
                  calendar = excluded.calendar,
                  games = excluded.games,
                  html = excluded.html,
                  context = excluded.context,
                  pdf_text = excluded.pdf_text,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [
                id, decoded.id, mode, 
                title || 'Nova Conversa',
                JSON.stringify(chat_history || []), 
                JSON.stringify(calendar || []), 
                JSON.stringify(games || {}),
                html || '',
                context || '',
                pdf_text || ''
            ]
        });
        return res.status(200).json({ success: true });
    } catch (error) { return res.status(500).json({ error: 'Error: ' + error.message }); }
}

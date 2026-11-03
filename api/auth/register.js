const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
    // Habilitar CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Mètode no permès' });

    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email i contrasenya obligatoris' });

        const client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });

        // Comprovar si l'usuari ja existeix
        const existingUser = await client.execute({
            sql: 'SELECT * FROM users WHERE email = ?',
            args: [email]
        });

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Aquest usuari ja està registrat' });
        }

        // Crear nou usuari amb contrasenya encriptada
        const id = 'usr_' + Date.now();
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        await client.execute({
            sql: 'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
            args: [id, email, password_hash]
        });

        return res.status(200).json({ success: true, message: 'Usuari registrat correctament' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error intern del servidor: ' + error.message });
    }
}

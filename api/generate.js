module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { chatHistory } = req.body;

        // Prompt de personalitat general per a l'assistent
        const masterSystemPrompt = {
            role: "system",
            content: "Ets AIStudents, un tutor d'intel·ligència artificial. El teu to és empàtic, clar i pedagògic. Ajudes a l'alumne a entendre conceptes, fas resums i respon a dubtes basant-te en la informació que t'hagi passat a l'historial."
        };

        // Muntem l'array de missatges combinant el mestre amb l'historial del client
        const messagesToSend = [masterSystemPrompt, ...chatHistory];

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-20b",
                messages: messagesToSend
            })
        });

        if (!response.ok) {
            const errorDeGroq = await response.text();
            return res.status(200).json({ error: `Falla a Groq: ${errorDeGroq}` });
        }

        const data = await response.json();
        
        // Retornem directament el text de la resposta al xat
        return res.status(200).json({ reply: data.choices[0].message.content });

    } catch (error) {
        return res.status(200).json({ error: `Error intern del servidor: ${error.message}` });
    }
}

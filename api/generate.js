module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { action, pdfText, instructions, chatHistory } = req.body;

        // ACCIÓ 1: GENERAR EL TEST DE 5 PREGUNTES
        if (action === 'quiz') {
            const systemPrompt = `Ets un professor universitari estricte però just. Genera un test de diagnòstic de 5 preguntes tipus test basat ÚNICAMENT en el següent temari. 
            Han de ser preguntes que avaluïn realment si l'alumne entén el tema.
            
            Temari/Apunts: ${pdfText || 'Temari general sobre: ' + instructions}
            Instruccions addicionals: ${instructions}
            
            RETORNA ÚNICAMENT UN OBJECTE JSON PUR. SENSE MARKDOWN. FORMAT EXACTE:
            {
              "preguntes": [
                {
                  "pregunta": "Text de la pregunta?",
                  "opcions": ["A) opció", "B) opció", "C) opció", "D) opció"],
                  "resposta_correcta": "A) opció"
                }
              ]
            }`;

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: [ { role: "system", content: systemPrompt } ],
                    response_format: { type: "json_object" } // Forzem que torni JSON per poder llegir les preguntes
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Falla a Groq (Quiz): ${errText}` });
            }

            const data = await response.json();
            const result = JSON.parse(data.choices[0].message.content);
            return res.status(200).json(result);
        }

        // ACCIÓ 2: XAT CONTINU AMB LA IA
        if (action === 'chat') {
            const masterSystemPrompt = {
                role: "system",
                content: "Ets AIStudents, un tutor d'intel·ligència artificial. El teu to és empàtic, clar i pedagògic. Tens accés als apunts i a la nota del test inicial de l'alumne (que estan en els missatges anteriors d'aquest xat). Adapta la teva explicació al seu nivell demostrat."
            };

            const messagesToSend = [masterSystemPrompt, ...chatHistory];

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.1-70b-versatile",
                    messages: messagesToSend
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Falla a Groq (Xat): ${errText}` });
            }

            const data = await response.json();
            return res.status(200).json({ reply: data.choices[0].message.content });
        }

        return res.status(200).json({ error: 'Acció no reconeguda.' });

    } catch (error) {
        return res.status(200).json({ error: `Error intern del servidor: ${error.message}` });
    }
}

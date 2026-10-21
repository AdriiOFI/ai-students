module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { action, pdfText, instructions, chatHistory, daysLeft } = req.body;

        // ACCIÓ 1: GENERAR EL CALENDARI I EL TEST ALHORA
        if (action === 'prepare_study') {
            const systemPrompt = `Ets un tutor d'estudi. La teva missió és doble:
            1. Crear un calendari d'estudi per l'alumne basant-te en els dies que li queden (${daysLeft} dies).
            2. Crear un test de diagnòstic de 5 preguntes tipus test basat en el temari per saber el seu nivell inicial.
            
            Temari/Apunts: ${pdfText || 'Temari general sobre: ' + instructions}
            
            RETORNA ÚNICAMENT UN OBJECTE JSON PUR. SENSE MARKDOWN EXTERIOR. FORMAT EXACTE:
            {
              "calendari_estudi": "El pla d'estudi dia a dia o setmana a setmana resumit (en format markdown interior amb negretes i llistes).",
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
                    model: "llama-3.1-70b-versatile",
                    messages: [ { role: "system", content: systemPrompt } ],
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Falla a Groq (Prepare): ${errText}` });
            }

            const data = await response.json();
            const result = JSON.parse(data.choices[0].message.content);
            return res.status(200).json(result);
        }

        // ACCIÓ 2: XAT CONTINU AMB LA IA
        if (action === 'chat') {
            const masterSystemPrompt = {
                role: "system",
                content: `Ets AIStudents, un tutor d'intel·ligència artificial avançat. 
                
                DIRECTRIUS IMPORTANTS:
                1. Context: En el teu primer "system prompt" amagat t'han donat el calendari d'estudi de l'alumne, els seus apunts i la nota inicial del test. Usa aquesta memòria. Adapta't a la seva nota (si és baixa, explica a poc a poc; si és alta, aprofundeix).
                2. Interacció: Fes preguntes per posar a prova l'alumne.
                3. Visual: Utilitza blocs de codi (\`\`\`) per fer esquemes visuals o arbres conceptuals basats en text.
                4. Kahoot: Si l'alumne demana jugar, inicia un joc de preguntes estil "Kahoot" amb opcions A, B, C, D donant-li punts per encert.
                
                El teu to ha de ser empàtic, encoratjador i interactiu.`
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

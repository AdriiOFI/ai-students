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
            
            RETORNA ÚNICAMENT UN OBJECTE JSON PUR. SENSE CAP TEXT ABANS NI DESPRÉS. FORMAT EXACTE:
            {
              "calendari_estudi": "Pla d'estudi dia a dia.\\nDia 1: Tema 1.\\nDia 2: Repàs.",
              "preguntes": [
                {
                  "pregunta": "Text de la pregunta?",
                  "opcions": ["A) opció 1", "B) opció 2", "C) opció 3", "D) opció 4"],
                  "resposta_correcta": "A) opció 1"
                }
              ]
            }`;

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: [ { role: "system", content: systemPrompt } ]
                    // HEM ELIMINAT EL response_format ESTRICTE
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Falla a Groq (Prepare): ${errText}` });
            }

            const data = await response.json();
            let rawContent = data.choices[0].message.content;
            
            // EL NOSTRE PROPI VALIDADOR: Busquem on comença i acaba el JSON per ignorar text extra
            try {
                const jsonStart = rawContent.indexOf('{');
                const jsonEnd = rawContent.lastIndexOf('}');
                
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    rawContent = rawContent.substring(jsonStart, jsonEnd + 1);
                }
                
                const result = JSON.parse(rawContent);
                return res.status(200).json(result);
            } catch (parseError) {
                return res.status(200).json({ error: `La IA no ha generat un format vàlid. Això és el que ha dit: ${rawContent.substring(0, 100)}...` });
            }
        }

        // ACCIÓ 2: XAT CONTINU AMB LA IA
        if (action === 'chat') {
            const masterSystemPrompt = {
                role: "system",
                content: `Ets AIStudents, un tutor d'intel·ligència artificial avançat. 
                
                DIRECTRIUS IMPORTANTS:
                1. Context: Usa la teva memòria (calendari d'estudi, apunts i nota inicial del test). Adapta't a la nota de l'alumne.
                2. Interacció: Fes preguntes per posar a prova l'alumne.
                3. Visual: Utilitza blocs de codi (\`\`\`) per fer esquemes visuals o arbres conceptuals.
                4. Kahoot: Si l'alumne demana jugar, inicia un joc de preguntes estil "Kahoot" amb opcions A, B, C, D donant-li punts.
                
                El teu to ha de ser empàtic, encoratjador i interactiu.`
            };

            const messagesToSend = [masterSystemPrompt, ...chatHistory];

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
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

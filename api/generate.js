module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { action, pdfText, instructions, chatHistory, daysLeft, currentDate } = req.body;

        // ACCIÓ 1: GENERAR EL CALENDARI I EL TEST
        if (action === 'prepare_study') {
            const systemPrompt = `Ets un tutor d'estudi. La teva missió és doble:
            1. Crear un calendari d'estudi resumit per l'alumne basant-te en els dies que li queden (${daysLeft} dies). Avui és ${currentDate}.
            2. Crear un test de diagnòstic de 5 preguntes tipus test basat en el temari.
            
            Temari/Apunts: ${pdfText || 'Temari general sobre: ' + instructions}
            
            RETORNA ÚNICAMENT UN OBJECTE JSON. Utilitza SEMPRE cometes dobles (") per les claus i valors. Els salts de línia s'han d'escriure com \\n.
            
            FORMAT EXACTE I ESPERAT:
            {
              "calendari_estudi": [
                { "dia": 1, "tema": "Títol del que toca estudiar aquest dia" },
                { "dia": 2, "tema": "Títol del dia 2..." }
              ],
              "preguntes": [
                {
                  "pregunta": "Quina és la capital?",
                  "opcions": ["A) Roma", "B) París", "C) Madrid", "D) Londres"],
                  "resposta_correcta": "A) Roma"
                }
              ]
            }`;

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: [ { role: "system", content: systemPrompt } ],
                    temperature: 0.2,
                    max_tokens: 3000
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Falla a l'API (Prepare): ${errText}` });
            }

            const data = await response.json();
            let rawContent = data.choices?.[0]?.message?.content || "";
            
            try {
                if (!rawContent) throw new Error("La resposta està buida.");
                let cleanedContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
                const jsonStart = cleanedContent.indexOf('{');
                const jsonEnd = cleanedContent.lastIndexOf('}');
                
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
                }

                let result;
                try {
                    result = JSON.parse(cleanedContent);
                } catch (strictError) {
                    let safeJS = cleanedContent.replace(/\n/g, "\\n").replace(/\r/g, "");
                    result = new Function("return " + safeJS)();
                }
                
                return res.status(200).json(result);
            } catch (parseError) {
                return res.status(200).json({ 
                    error: `El format de la IA no és compatible. <br>Error de lectura: ${parseError.message}<br><br><pre style="text-align:left; white-space:pre-wrap; background:#1e293b; padding:10px; border-radius:8px; margin-top:10px; font-size:10px;">${rawContent}</pre>` 
                });
            }
        }

        // ACCIÓ 2: XAT CONTINU AMB LA IA
        if (action === 'chat') {
            const masterSystemPrompt = {
                role: "system",
                content: `Ets AIStudents, un tutor d'intel·ligència artificial. 
                
                DIRECTRIUS:
                1. Tens la memòria de l'alumne als missatges anteriors. Adapta la dificultat.
                2. Utilitza blocs de codi (\`\`\`) per fer esquemes visuals.
                3. JOC KAHOOT: Si l'alumne et demana un joc Kahoot o preguntes ràpides, HAS DE FORMATAR LA PREGUNTA EXACTAMENT AIXÍ perquè el sistema dibuixi els botons:
                
                \`\`\`kahoot
                {
                  "pregunta": "Escriu aquí la pregunta",
                  "opcions": ["Opció 1", "Opció 2", "Opció 3", "Opció 4"],
                  "correcta": 0
                }
                \`\`\`
                (El camp 'correcta' és l'índex de la resposta bona, de 0 a 3). Pots afegir text normal abans o després del bloc kahoot.`
            };

            const messagesToSend = [masterSystemPrompt, ...chatHistory];

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: messagesToSend,
                    max_tokens: 2000
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Falla a l'API (Xat): ${errText}` });
            }

            const data = await response.json();
            return res.status(200).json({ reply: data.choices[0].message.content });
        }

        return res.status(200).json({ error: 'Acció no reconeguda.' });

    } catch (error) {
        return res.status(200).json({ error: `Error intern: ${error.message}` });
    }
}

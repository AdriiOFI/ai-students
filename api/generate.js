module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const groqApiKey = process.env.GROQ_API_KEY;
        const hfApiKey = process.env.HF_API_KEY;

        if (!groqApiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { action, pdfText, instructions, chatHistory, totalSessionsToGenerate, studentContext, prompt } = req.body;

        module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const groqApiKey = process.env.GROQ_API_KEY;
        
        if (!groqApiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { action, pdfText, instructions, chatHistory, totalSessionsToGenerate, studentContext, prompt } = req.body;

        // ACCIÓ 1: GENERAR LA IMATGE AMB TOGETHER AI (FLUX)
        if (action === 'image') {
            const togetherKey = process.env.TOGETHER_API_KEY;
            if (!togetherKey) return res.status(200).json({ error: "Falta configurar TOGETHER_API_KEY a Vercel." });
            
            try {
                const togetherRes = await fetch("https://api.together.xyz/v1/images/generations", {
                    method: "POST",
                    headers: { 
                        "Authorization": `Bearer ${togetherKey.trim()}`, 
                        "Content-Type": "application/json" 
                    },
                    body: JSON.stringify({ 
                        model: "black-forest-labs/FLUX.1-schnell-Free", 
                        prompt: "clean minimalist educational diagram, " + prompt + ", white background, high quality, vector style",
                        width: 1024,
                        height: 768,
                        steps: 4,
                        n: 1,
                        response_format: "b64_json"
                    })
                });
                
                const data = await togetherRes.json();
                
                if (togetherRes.ok && data.data && data.data[0]) {
                    const base64 = data.data[0].b64_json;
                    return res.status(200).json({ image: `data:image/jpeg;base64,${base64}` });
                } else {
                    return res.status(200).json({ error: `Rebutjat per Together AI: ${JSON.stringify(data)}` });
                }
            } catch (e) {
                return res.status(200).json({ error: `Error de xarxa: ${e.message}` });
            }
        }

        // ACCIÓ 2: GENERAR EL CALENDARI I EL TEST
        if (action === 'prepare_study') {
            const systemPrompt = `Ets un tutor d'estudi. T'han pujat apunts.
            La teva missió és doble:
            1. Crear un pla d'estudi de EXACTAMENT ${totalSessionsToGenerate} sessions. ELS ÚLTIMS TEMES han de ser EXCLUSIVAMENT "Repàs General".
            2. Crear un test de diagnòstic de 5 preguntes tipus test.
            
            Apunts: ${pdfText || 'Temari general'}
            
            REGLA CRÍTICA: RETORNA ÚNICAMENT UN OBJECTE JSON VÀLID. Utilitza SEMPRE cometes dobles (").
            
            FORMAT EXACTE OBLIGATORI:
            {
              "calendari_estudi": [
                { "tema": "Fonaments i introducció" }
              ],
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
                headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: [ { role: "system", content: systemPrompt } ],
                    temperature: 0.1, 
                    max_tokens: 2500
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Error de la API: ${errText}` });
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
                    error: `Error d'estructura de la IA. Motiu: ${parseError.message}` 
                });
            }
        }

        // ACCIÓ 3: XAT CONTINU AMB LA IA
        if (action === 'chat') {
            const masterSystemPrompt = {
                role: "system",
                content: `Ets AIStudents, un tutor d'estudi avançat.
                
                MEMÒRIA ACTUAL DE L'ALUMNE:
                ${studentContext}
                
                APUNTS/TEMARI:
                ${pdfText ? pdfText.substring(0, 3000) : "Sense apunts."}
                
                MÈTODE D'ENSENYAMENT (ESTRUCTURA OBLIGATÒRIA):
                1. TEORIA RICA I DECORADA: Explica el tema actual del calendari basant-te ESTRICTAMENT en els apunts. Fes servir emojis, llistes amb pics i negretes.
                2. MNEMOTÈCNIA: Integra un truc de memòria naturalment en l'explicació.
                3. IMATGES: Afegeix SEMPRE la petició d'imatge així: [IMG: "clean educational diagram about [topic in english], white background"]
                4. ATURADA: Acaba la teva explicació amb l'etiqueta [BOTON_ENTENDIDO] i NO posis cap joc encara.
                
                ACTIVACIÓ DEL JOC (ALERTA MÀXIMA):
                Si l'alumne et diu "Ho he entès perfectament. Fes-me el mini-joc interactiu...", tens PROHIBIT dir res més de teoria. RESPON OBLIGATÒRIAMENT amb el bloc de codi d'un d'aquests dos jocs. Pots dir una frase curta d'ànim abans del codi.
                REGLA CRÍTICA: Has d'obrir el bloc obligatòriament amb \`\`\`kahoot o \`\`\`schema EXACTAMENT.

                OPCIÓ A (Esquema conceptual):
                \`\`\`schema
                {
                  "titol": "Completa el diagrama",
                  "buits": [
                    { "context": "Pista principal", "resposta": "paraula" },
                    { "context": "Pista secundària", "resposta": "paraula" }
                  ]
                }
                \`\`\`

                OPCIÓ B (Kahoot clàssic):
                \`\`\`kahoot
                {
                  "pregunta": "Pregunta sobre el que acabem de veure:",
                  "opcions": ["Opció 1", "Opció 2", "Opció 3", "Opció 4"],
                  "correcta": 0
                }
                \`\`\``
            };

            let safeHistory = [];
            let lastRole = "";
            for (let msg of chatHistory) {
                if (msg.role !== lastRole) {
                    safeHistory.push({ role: msg.role, content: msg.content });
                    lastRole = msg.role;
                } else {
                    safeHistory[safeHistory.length - 1].content += "\n\n" + msg.content;
                }
            }

            const messagesToSend = [masterSystemPrompt, ...safeHistory];

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: messagesToSend,
                    temperature: 0.4,
                    max_tokens: 2500
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
        return res.status(200).json({ error: `Error intern del servidor: ${error.message}` });
    }
}
}

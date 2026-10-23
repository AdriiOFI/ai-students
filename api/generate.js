module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { action, pdfText, instructions, chatHistory, totalSessionsToGenerate, studentContext } = req.body;

        // ACCIÓ 1: GENERAR EL CALENDARI I EL TEST
        if (action === 'prepare_study') {
            const systemPrompt = `Ets un tutor d'estudi. T'han pujat apunts.
            La teva missió és doble:
            1. Crear un pla d'estudi de EXACTAMENT ${totalSessionsToGenerate} sessions. ELS ÚLTIMS TEMES han de ser EXCLUSIVAMENT "Repàs General".
            2. Crear un test de diagnòstic de 5 preguntes tipus test.
            
            Apunts: ${pdfText || 'Temari sobre: ' + instructions}
            
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
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
                    error: `Error d'estructura de la IA. <br>Motiu: ${parseError.message}<br><br><pre style="text-align:left; font-size:11px; white-space:pre-wrap;">${rawContent}</pre>` 
                });
            }
        }

        // ACCIÓ 2: XAT CONTINU AMB LA IA
        if (action === 'chat') {
            const masterSystemPrompt = {
                role: "system",
                content: `Ets AIStudents, un tutor d'estudi avançat d'intel·ligència artificial.
                
                MEMÒRIA ACTUAL DE L'ALUMNE:
                ${studentContext}
                
                APUNTS/TEMARI (Fes-los servir per treure la teoria):
                ${pdfText ? pdfText.substring(0, 3000) : "Sense apunts."}
                
                MÈTODE D'ENSENYAMENT (MOLT IMPORTANT):
                1. POC A POC: Explica només UN concepte petit cada vegada.
                2. NATURALITAT: Tens PROHIBIT dir "Aquí tens un truc mnemotècnic" o frases robòtiques similars. Integra el truc de memòria directament i de forma natural en la teva explicació.
                3. IMATGES: Per il·lustrar conceptes, pots generar diagrames visuals utilitzant AQUEST CODI Markdown:
                   ![Esquema](https://image.pollinations.ai/prompt/clean-educational-diagram-of-[tema-en-angles]-white-background?width=800&height=400&nologo=true)
                4. ESPERA: Quan acabis d'explicar, atura't. NO facis jocs fins que l'alumne et digui "ho he entès", "vale", o t'ho demani.
                
                JOCS INTERACTIUS (NOMÉS QUAN L'ALUMNE HO ENTENGUI O HO DEMANI):
                Quan toqui comprovar si ho ha après, INSEREIX UN D'AQUESTS DOS BLOCS perquè el sistema creï la interfície interactiva:

                OPCIÓ A (Joc d'Esquema amb buits per omplir):
                \`\`\`schema
                {
                  "titol": "Títol de l'esquema",
                  "buits": [
                    { "context": "Concepte anterior", "resposta": "paraula a endevinar" },
                    { "context": "Deriva d'això...", "resposta": "una altra paraula" }
                  ]
                }
                \`\`\`

                OPCIÓ B (Kahoot clàssic amb 4 opcions):
                \`\`\`kahoot
                {
                  "pregunta": "Pregunta ràpida:",
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
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b",
                    messages: messagesToSend,
                    temperature: 0.5,
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
        return res.status(200).json({ error: `Error intern: ${error.message}` });
    }
}

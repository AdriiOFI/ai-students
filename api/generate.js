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
                    error: `Error d'estructura de la IA. <br>Motiu: ${parseError.message}<br><br><pre style="text-align:left; font-size:11px; white-space:pre-wrap;">${rawContent}</pre>` 
                });
            }
        }

        // ACCIÓ 2: XAT CONTINU AMB LA IA
        if (action === 'chat') {
            const masterSystemPrompt = {
                role: "system",
                content: `Ets AIStudents, un tutor d'estudi avançat.
                
                MEMÒRIA ACTUAL DE L'ALUMNE:
                ${studentContext}
                
                APUNTS/TEMARI:
                ${pdfText ? pdfText.substring(0, 3000) : "Sense apunts."}
                
                MÈTODE D'ENSENYAMENT (MICRO-LEARNING):
                1. POC A POC: Explica només UN concepte curt cada vegada.
                2. NATURALITAT I TRUCS: Explica els trucs mnemotècnics (regles per memoritzar) de forma natural integrats al text, SENSE dir frases com "Aquí tens un truc mnemotècnic".
                3. IMATGES: Per il·lustrar conceptes, pots generar esquemes visuals demanant-ho EXACTAMENT amb aquest format, i jo m'encarrego de dibuixar-ho:
                   [IMG: "clean educational diagram about [topic in english], white background, minimal"]
                4. ESPERA: Després d'explicar el concepte i posar el joc, CALLA. No avancis temari fins que l'alumne resolgui el joc o t'ho demani.
                
                JOCS INTERACTIUS (OBLIGATORI POSAR-NE UN AL FINAL DE CADA EXPLICACIÓ):
                Insereix un d'aquests blocs perquè el sistema creï la interfície interactiva. L'alumne no pot avançar sense contestar-los.

                OPCIÓ A (Esquema conceptual de caixes i fletxes):
                \`\`\`schema
                {
                  "titol": "Completa el diagrama",
                  "buits": [
                    { "context": "Node principal", "resposta": "paraula" },
                    { "context": "Node secundari", "resposta": "paraula" }
                  ]
                }
                \`\`\`

                OPCIÓ B (Kahoot clàssic amb 4 opcions):
                \`\`\`kahoot
                {
                  "pregunta": "Pregunta de repàs:",
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
            let replyText = data.choices[0].message.content;

            // PROCESSADOR D'IMATGES VIA HUGGING FACE FLUX
            const imgRegex = /\[IMG:\s*"(.*?)"\]/gi;
            let match;
            
            while ((match = imgRegex.exec(replyText)) !== null) {
                const imgPrompt = match[1];
                
                if (hfApiKey) {
                    try {
                        const hfRes = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
                            headers: { "Authorization": `Bearer ${hfApiKey}`, "Content-Type": "application/json" },
                            method: "POST",
                            body: JSON.stringify({ inputs: imgPrompt })
                        });
                        
                        if (hfRes.ok) {
                            const arrayBuffer = await hfRes.arrayBuffer();
                            const base64 = Buffer.from(arrayBuffer).toString('base64');
                            const mimeType = hfRes.headers.get('content-type') || 'image/jpeg';
                            const imgMarkdown = `\n\n![Esquema visual](data:${mimeType};base64,${base64})\n\n`;
                            replyText = replyText.replace(match[0], imgMarkdown);
                        } else {
                            replyText = replyText.replace(match[0], "\n*(Error generant imatge: El servidor gràfic està ocupat)*\n");
                        }
                    } catch (e) {
                        replyText = replyText.replace(match[0], "\n*(Error carregant la imatge)*\n");
                    }
                } else {
                    replyText = replyText.replace(match[0], "\n*(Falta configurar HF_API_KEY)*\n");
                }
            }

            return res.status(200).json({ reply: replyText });
        }

        return res.status(200).json({ error: 'Acció no reconeguda.' });

    } catch (error) {
        return res.status(200).json({ error: `Error intern: ${error.message}` });
    }
}

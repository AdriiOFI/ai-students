module.exports = async function handler(req, res) {
    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const { action, pdfText, instructions, chatHistory, daysLeft, currentDate, availableDays, studentContext } = req.body;

        // ACCIÓ 1: GENERAR EL CALENDARI I EL TEST
        if (action === 'prepare_study') {
            const systemPrompt = `Ets un tutor d'estudi avançat. T'han pujat apunts. Avui és ${currentDate}. L'alumne té disponibilitat per estudiar els següents dies de la setmana: ${availableDays}. Faltan ${daysLeft} dies per l'examen.
            La teva missió és doble:
            1. Crear un calendari d'estudi assignant dates reals que encaixin dins dels dies disponibles. Posa un títol curt al tema de cada dia.
            2. Crear un test de diagnòstic de 5 preguntes tipus test basat en el temari.
            
            Apunts: ${pdfText || 'Temari sobre: ' + instructions}
            
            REGLA CRÍTICA: RETORNA ÚNICAMENT UN OBJECTE JSON VÀLID. Utilitza SEMPRE cometes dobles (").
            
            FORMAT EXACTE OBLIGATORI:
            {
              "calendari_estudi": [
                { "dia_real": "Dilluns 26 d'Octubre", "tema": "Fonaments i introducció" }
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
                    max_tokens: 3000
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: `Error de la API: ${errText}` });
            }

            const data = await response.json();
            let rawContent = data.choices?.[0]?.message?.content || "";
            
            try {
                if (!rawContent) throw new Error("La resposta de la IA està buida.");
                
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
            // El prompt mestre concentra tota la memòria en un sol missatge de sistema per evitar crashejos
            const masterSystemPrompt = {
                role: "system",
                content: `Ets AIStudents, un tutor d'estudi d'intel·ligència artificial.
                
                MEMÒRIA ACTUAL DE L'ALUMNE:
                ${studentContext}
                APUNTS/TEMARI:
                ${pdfText ? pdfText.substring(0, 3000) : "Sense apunts físics, guia't per les instruccions generals."}
                
                ESTIL D'ENSENYAMENT (MOLT IMPORTANT):
                1. Mnemotècnia: Quan expliquis conceptes teòrics, xifres o noms complexos, INVENTA regles mnemotècniques o trucs divertits (ex: SMTP = Send Mail To People, port 25 perquè és l'edat d'un adult).
                2. Imatges Visuals: Pots generar imatges per ajudar-lo a recordar. Per inserir una imatge utilitza EXCLUSIVAMENT aquest codi Markdown:
                   ![Descripció](https://image.pollinations.ai/prompt/descripcio-en-angles-separada-per-guions?width=800&height=400&nologo=true)
                   (Substitueix la URL pel prompt de la imatge que vulguis, sempre en anglès i amb guions).
                3. Guia pel calendari: Segueix l'ordre del calendari d'estudi. No expliquis tot el temari de cop.
                
                JOC KAHOOT: 
                Quan l'alumne et demani "Jugar a Kahoot" o vulguis posar-lo a prova, INSEREIX AQUEST BLOC EXACTE:
                \`\`\`kahoot
                {
                  "pregunta": "Escriu la pregunta aquí",
                  "opcions": ["Opció 1", "Opció 2", "Opció 3", "Opció 4"],
                  "correcta": 0
                }
                \`\`\`
                (La 'correcta' és l'índex de la resposta vàlida: 0, 1, 2 o 3).`
            };

            const messagesToSend = [masterSystemPrompt, ...chatHistory];

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
        return res.status(200).json({ error: `Error intern del servidor: ${error.message}` });
    }
}

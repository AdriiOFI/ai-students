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
            1. Crear un calendari d'estudi resumit per l'alumne basant-te en els dies que li queden (${daysLeft} dies).
            2. Crear un test de diagnòstic de 5 preguntes tipus test basat en el temari.
            
            Temari/Apunts: ${pdfText || 'Temari general sobre: ' + instructions}
            
            RETORNA ÚNICAMENT UN OBJECTE JSON. REGLA: Utilitza SEMPRE cometes dobles (") per les claus i valors, MAI cometes simples ('). Els salts de línia s'han d'escriure com \\n.
            
            FORMAT ESPERAT:
            {
              "calendari_estudi": "Dia 1: Tema 1.\\nDia 2: Repàs.",
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
                    temperature: 0.2, // Baixem la temperatura perquè obeeixi millor el format
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

                // Netejar markdown i localitzar les claus
                let cleanedContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
                const jsonStart = cleanedContent.indexOf('{');
                const jsonEnd = cleanedContent.lastIndexOf('}');
                
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
                }

                let result;
                try {
                    // 1. Intent normal de parsejar JSON estricte
                    result = JSON.parse(cleanedContent);
                } catch (strictError) {
                    // 2. TENTATIVA RELAXADA: Si la IA ha usat cometes simples o salts de línia trencats
                    // Substituïm els salts de línia reals per la seqüència segura \n per no trencar l'evaluació
                    let safeJS = cleanedContent.replace(/\n/g, "\\n").replace(/\r/g, "");
                    // Utilitzem el constructor de funcions per llegir l'objecte com si fos JavaScript pur
                    result = new Function("return " + safeJS)();
                }
                
                // Si arribem aquí, ha funcionat
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
                content: `Ets AIStudents, un tutor d'intel·ligència artificial avançat. 
                
                DIRECTRIUS:
                1. Tens la memòria de l'alumne als missatges anteriors (test, calendari, apunts). Usa-ho.
                2. Fes preguntes interactives, no donis només sermons llargs.
                3. Utilitza blocs de codi (\`\`\`) per fer esquemes visuals quan calgui resumir.
                4. Si l'alumne demana jugar, fes un joc tipus Kahoot (A, B, C, D) anomenant els punts.`
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

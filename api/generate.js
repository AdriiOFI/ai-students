module.exports = async function handler(req, res) {
    // Habilitem CORS per evitar bloquejos del navegador
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Mètode no permès.' });
        }

        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
            return res.status(200).json({ error: 'Falta la clau GROQ_API_KEY a Vercel.' });
        }

        const body = req.body || {};
        const action = body.action;
        const pdfText = body.pdfText || "";
        const instructions = body.instructions || "";
        const chatHistory = body.chatHistory || [];
        const totalSessionsToGenerate = body.totalSessionsToGenerate || 5;
        const studentContext = body.studentContext || "";
        const prompt = body.prompt || "";

        // ACCIÓ 1: GENERAR LA IMATGE AMB TOGETHER AI
        if (action === 'image') {
            const togetherKey = process.env.TOGETHER_API_KEY;
            if (!togetherKey) return res.status(200).json({ error: "Falta configurar TOGETHER_API_KEY a Vercel." });

            const togetherRes = await fetch("https://api.together.xyz/v1/images/generations", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + togetherKey.trim(),
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
                return res.status(200).json({ image: "data:image/jpeg;base64," + data.data[0].b64_json });
            } else {
                return res.status(200).json({ error: "Rebutjat per Together AI: " + JSON.stringify(data) });
            }
        }

        // ACCIÓ 2: PREPARAR ESTUDI I TEST
        if (action === 'prepare_study') {
            const systemPrompt = "Ets un tutor d'estudi. T'han pujat apunts.\n" +
            "La teva missió és doble:\n" +
            "1. Crear un pla d'estudi de EXACTAMENT " + totalSessionsToGenerate + " sessions. ELS ÚLTIMS TEMES han de ser EXCLUSIVAMENT 'Repàs General'.\n" +
            "2. Crear un test de diagnòstic de 5 preguntes tipus test.\n\n" +
            "Apunts: " + (pdfText || "Temari general") + "\n\n" +
            "REGLA CRÍTICA: RETORNA ÚNICAMENT UN OBJECTE JSON VÀLID. Utilitza SEMPRE cometes dobles (\").\n\n" +
            "FORMAT EXACTE OBLIGATORI:\n" +
            "{\n" +
            "  \"calendari_estudi\": [ { \"tema\": \"Fonaments i introducció\" } ],\n" +
            "  \"preguntes\": [ { \"pregunta\": \"Text?\", \"opcions\": [\"A) 1\", \"B) 2\", \"C) 3\", \"D) 4\"], \"resposta_correcta\": \"A) 1\" } ]\n" +
            "}";

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": "Bearer " + groqApiKey.trim(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b", 
                    messages: [ { role: "system", content: systemPrompt } ],
                    temperature: 0.1,
                    max_tokens: 2500,
                    response_format: { type: "json_object" }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: "Error de la API: " + errText });
            }

            const data = await response.json();
            let rawContent = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";

            try {
                if (!rawContent) throw new Error("La resposta està buida.");
                let cleanedContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();
                const jsonStart = cleanedContent.indexOf('{');
                const jsonEnd = cleanedContent.lastIndexOf('}');
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    cleanedContent = cleanedContent.substring(jsonStart, jsonEnd + 1);
                }
                let result = JSON.parse(cleanedContent);
                return res.status(200).json(result);
            } catch (parseError) {
                return res.status(200).json({ error: "Error d'estructura de la IA. Motiu: " + parseError.message });
            }
        }

        // ACCIÓ 3: XAT CONTINU I JOCS INTERACTIUS
        if (action === 'chat') {
            const systemPromptChat = "Ets AIStudents, un tutor d'estudi avançat.\n\n" +
            "MEMÒRIA ACTUAL DE L'ALUMNE:\n" + studentContext + "\n\n" +
            "APUNTS/TEMARI:\n" + (pdfText ? pdfText.substring(0, 3000) : "Sense apunts.") + "\n\n" +
            "MÈTODE D'ENSENYAMENT (ESTRUCTURA OBLIGATÒRIA):\n" +
            "1. TEORIA RICA I DECORADA: Explica el tema actual del calendari basant-te ESTRICTAMENT en els apunts. Fes servir emojis, llistes amb pics i negretes.\n" +
            "2. MNEMOTÈCNIA: Integra un truc de memòria naturalment en l'explicació.\n" +
            "3. IMATGES: Afegeix SEMPRE la petició d'imatge així: [IMG: \"clean educational diagram about [topic in english], white background\"]\n" +
            "4. ATURADA: Acaba la teva explicació amb l'etiqueta [BOTON_ENTENDIDO] i NO posis cap joc encara.\n\n" +
            "ACTIVACIÓ DEL JOC (ALERTA MÀXIMA):\n" +
            "Si l'alumne et diu 'Ho he entès perfectament. Fes-me el mini-joc interactiu...', tens PROHIBIT dir res més de teoria. RESPON OBLIGATÒRIAMENT amb el bloc de codi d'un d'aquests dos jocs.\n" +
            "REGLA CRÍTICA: Has d'obrir el bloc obligatòriament amb ```kahoot o ```schema EXACTAMENT.\n\n" +
            "OPCIÓ A (Esquema conceptual):\n" +
            "```schema\n" +
            "{\n" +
            "  \"titol\": \"Completa el diagrama\",\n" +
            "  \"buits\": [\n" +
            "    { \"context\": \"Pista principal\", \"resposta\": \"paraula\" },\n" +
            "    { \"context\": \"Pista secundària\", \"resposta\": \"paraula\" }\n" +
            "  ]\n" +
            "}\n" +
            "```\n\n" +
            "OPCIÓ B (Kahoot clàssic):\n" +
            "```kahoot\n" +
            "{\n" +
            "  \"pregunta\": \"Pregunta sobre el que acabem de veure:\",\n" +
            "  \"opcions\": [\"Opció 1\", \"Opció 2\", \"Opció 3\", \"Opció 4\"],\n" +
            "  \"correcta\": 0\n" +
            "}\n" +
            "```";

            let safeHistory = [];
            let lastRole = "";
            for (let msg of chatHistory) {
                if (msg.role !== lastRole) {
                    safeHistory.push({ role: msg.role, content: msg.content });
                    lastRole = msg.role;
                } else {
                    if (safeHistory.length > 0) {
                        safeHistory[safeHistory.length - 1].content += "\n\n" + msg.content;
                    }
                }
            }

            const messagesToSend = [ { role: "system", content: systemPromptChat }, ...safeHistory ];

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": "Bearer " + groqApiKey.trim(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-oss-20b", 
                    messages: messagesToSend,
                    temperature: 0.4,
                    max_tokens: 2500
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: "Falla a l'API (Xat): " + errText });
            }

            const data = await response.json();
            return res.status(200).json({ reply: data.choices[0].message.content });
        }

        return res.status(200).json({ error: 'Acció no reconeguda.' });

    } catch (error) {
        console.error(error);
        return res.status(200).json({ error: "Error intern del servidor: " + error.message });
    }
}

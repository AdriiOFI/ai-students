export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Mètode no permès' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Error intern: La clau de la IA no està configurada al servidor.' });
    }

    const { action, prompt, title, subjectCategory, comments, chatHistory } = req.body;

    let messages = [];

    if (action === 'chat') {
        // Mode Xat continu estil Gemini
        const systemPrompt = `Ets AIStudents, un tutor d'intel·ligència artificial especialitzat en l'acompanyament escolar i tècnic (especialment en SMX, ciències i humanitats). 
        El teu objectiu és ajudar a estudiar, explicar conceptes de manera clara, fer preguntes de repàs i resoldre dubtes sobre els apunts o PDFs. 
        Manté un estil proper, clar, pedagògic i adaptat a qualsevol edat. Mai donis només les respostes fetes; fomenta que l'estudiant raoni.`;

        messages = [
            { role: "system", content: systemPrompt },
            ...(chatHistory || []),
            { role: "user", content: prompt }
        ];

    } else if (action === 'quiz') {
        // Generació del test inicial de 5 preguntes
        const systemPrompt = `Ets el tutor d'AIStudents. Genera un test de diagnòstic inicial de 5 preguntes clau d'avaluació de nivell per al temari "${title}" (${subjectCategory}).
        Respon ÚNICAMENT en format JSON pur (sense blocs de codi markdown \`\`\`json) amb aquesta estructura:
        {
          "preguntes": [
            {
              "id": 1,
              "pregunta": "Text de la pregunta 1...",
              "opcions": ["A) opcio 1", "B) opcio 2", "C) opcio 3", "D) opcio 4"],
              "resposta_correcta": "A"
            }
          ]
        }`;

        messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Prepara les 5 preguntes basant-te en aquests apunts/comentaris: ${comments || title}` }
        ];

    } else if (action === 'bug') {
        // Mode Glitch Sandbox
        const systemPrompt = `Ets el motor d'AIBugLab. Genera un cas pràctic tècnic de ${subjectCategory || 'SMX'} introduint UN error o bug deliberat i greu.
        Respon ÚNICAMENT en format JSON pur amb aquesta estructura:
        {
          "titol": "Títol del repte",
          "enunciat": "Descripció del problema on la IA ha fallat",
          "codi_o_configuracio": "El text o comanda amb l'error",
          "solucio_correcta": "La comanda o text exacte per solucionar-ho",
          "mermaid_code": "graph TD; A[Client] -->|Error IP| B[Router];"
        }`;

        messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Genera un nou repte tècnic aleatori amb un bug de configuració." }
        ];
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: messages,
                response_format: (action === 'quiz' || action === 'bug') ? { type: "json_object" } : undefined
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Error a la IA');

        if (action === 'chat') {
            return res.status(200).json({ reply: data.choices[0].message.content });
        } else {
            const result = JSON.parse(data.choices[0].message.content);
            return res.status(200).json(result);
        }

    } catch (error) {
        console.error("Error al backend:", error);
        return res.status(500).json({ error: "Error en processar la petició amb la IA." });
    }
}

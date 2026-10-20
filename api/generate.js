export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Mètode no permès' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'La clau GROQ_API_KEY no està configurada a Vercel.' });
    }

    const { action, prompt, title, subjectCategory, comments, pdfContent, chatHistory } = req.body;

    let messages = [];

    if (action === 'chat') {
        const systemPrompt = `Ets AIStudents, un tutor d'intel·ligència artificial especialitzat en l'acompanyament escolar i tècnic. 
        El teu objectiu és ajudar a estudiar, explicar conceptes de manera clara i resoldre dubtes sobre els apunts. Manté un estil proper, clar i pedagògic.`;

        messages = [
            { role: "system", content: systemPrompt },
            ...(chatHistory || []),
            { role: "user", content: prompt }
        ];

    } else if (action === 'quiz') {
        const systemPrompt = `Ets el tutor d'AIStudents. Genera un test de diagnòstic inicial de 5 preguntes clau d'avaluació de nivell per al temari "${title}" (${subjectCategory}).
        Respon ÚNICAMENT en format JSON pur (sense blocs de codi markdown \`\`\`json) amb aquesta estructura exactament:
        {
          "preguntes": [
            {
              "id": 1,
              "pregunta": "Text de la pregunta 1...",
              "opcions": ["A) opció 1", "B) opció 2", "C) opció 3", "D) opció 4"],
              "resposta_correcta": "A"
            }
          ]
        }`;

        // Limitem el contingut del PDF a uns 3000 caràcters per evitar superar límits
        const contextText = (pdfContent || comments || title).substring(0, 3000);

        messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Prepara el test de 5 preguntes basant-te en aquest temari/PDF: ${contextText}` }
        ];

    } else if (action === 'bug') {
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

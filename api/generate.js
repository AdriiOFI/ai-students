// api/generate.js

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Mètode no permès' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'La clau GROQ_API_KEY no està configurada a Vercel.' });
    }

    const { mode, subjectCategory, title, comments } = req.body;

    let systemPrompt = "";
    let userPrompt = "";

    if (mode === 'quiz') {
        systemPrompt = `Ets el tutor d'intel·ligència artificial d'AIStudents. L'estudiant està preparant l'examen de "${title}" (${subjectCategory}).
        Has de generar 5 preguntes clau d'avaluació de nivell sobre aquest tema.
        Respon NOMÉS en format JSON pur (sense markdown) amb aquesta estructura:
        {
          "preguntes": [
            {
              "id": 1,
              "pregunta": "Text de la pregunta 1...",
              "opcions": ["A) ...", "B) ...", "C) ...", "D) ..."],
              "resposta_correcta": "A"
            }
          ]
        }`;
        userPrompt = `Genera un test de 5 preguntes de nivell basat en aquests comentaris/temari: ${comments || title}`;
    } else {
        systemPrompt = `Ets el motor d'AIBugLab. La teva feina és generar un cas pràctic tècnic de ${subjectCategory || 'SMX'} introduint UN error o bug deliberat i greu.
        Respon NOMÉS en format JSON pur amb aquesta estructura:
        {
          "titol": "Títol del repte",
          "enunciat": "Descripció del problema on la IA ha fallat",
          "codi_o_configuracio": "El text, script o configuració amb l'error",
          "solucio_correcta": "La comanda o text exacte per solucionar-ho",
          "mermaid_code": "graph TD; A[Client] -->|Error IP| B[Router];"
        }`;
        userPrompt = "Genera un nou repte tècnic aleatori amb un bug de configuració o xarxa.";
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
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Error a Groq');

        const result = JSON.parse(data.choices[0].message.content);
        return res.status(200).json(result);

    } catch (error) {
        console.error("Error al backend:", error);
        return res.status(500).json({ error: "Error intern en generar la resposta amb la IA" });
    }
}

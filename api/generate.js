module.exports = async function handler(req, res) {
    try {
        // 1. Verificar si es un POST
        if (req.method !== 'POST') {
            return res.status(200).json({ error: 'Vercel diu: Has de fer un POST, no un GET.' });
        }

        // 2. Verificar la API Key
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            return res.status(200).json({ error: 'Vercel diu: No detecto la variable GROQ_API_KEY. Segur que està a l\'entorn de Production?' });
        }

        const { action, userPrompt, targetConcept } = req.body;
        let systemPrompt = "";
        let userMessage = "";

        if (action === 'glitch') {
            systemPrompt = `Ets AIStudents Lab. Genera un repte de Linux on s'ha comès un ERROR greu.
            Retorna ÚNICAMENT JSON:
            {
              "titol": "Títol breu",
              "context": "El que s'intentava fer",
              "codi_amb_error": "La comanda errònia",
              "solucio_comanda": "La comanda correcta"
            }`;
            userMessage = "Genera un bug de Linux.";
        } else if (action === 'radar') {
            systemPrompt = `Genera 3 afirmacions tècniques sobre Linux. 2 REALS, 1 AL·LUCINACIÓ.
            Retorna ÚNICAMENT JSON:
            {
              "afirmacions": [
                {"id": 1, "text": "...", "es_falsa": false},
                {"id": 2, "text": "...", "es_falsa": true},
                {"id": 3, "text": "...", "es_falsa": false}
              ],
              "explicacio_falsa": "Explicació"
            }`;
            userMessage = "Genera Radar.";
        } else if (action === 'reverse') {
            systemPrompt = `Avalua el prompt de l'usuari. Resultat esperat: "${targetConcept}". Prompt: "${userPrompt}".
            Retorna ÚNICAMENT JSON:
            {
              "puntuacio": 8,
              "feedback": "Anàlisi curta",
              "prompt_ideal": "El prompt ideal"
            }`;
            userMessage = "Avalua el prompt.";
        }

        // 3. Llamada a Groq
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                response_format: { type: "json_object" } 
            })
        });

        // 4. Capturar errores internos de Groq
        if (!response.ok) {
            const errorDeGroq = await response.text();
            return res.status(200).json({ error: `La API de Groq ha fallat (Codi ${response.status}): ${errorDeGroq}` });
        }

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        
        // Retornar éxito
        return res.status(200).json(result);

    } catch (error) {
        // 5. Capturar errores de servidor interno (Node.js)
        return res.status(200).json({ error: `El Backend de Vercel ha crashejat: ${error.message}` });
    }
}

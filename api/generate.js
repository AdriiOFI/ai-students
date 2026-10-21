module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Mètode no permès' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'La clau API no està configurada.' });
    }

    const { action, userPrompt, targetConcept } = req.body;

    let systemPrompt = "";
    let userMessage = "";

    // Configuración del System Prompt según la mecánica elegida
    if (action === 'glitch') {
        systemPrompt = `Ets el motor d'AIStudents Lab. Genera un repte pràctic de Linux (ex: permisos, usuaris, directoris) on s'ha comès un ERROR de sintaxi o concepte greu.
        Has de retornar ÚNICAMENT un objecte JSON amb aquesta estructura, sense markdown extra:
        {
          "titol": "Títol de la fallada",
          "context": "Breu explicació del que l'usuari intentava fer (ex: Crear un usuari amb shell nul·la)",
          "codi_amb_error": "La comanda de terminal que conté l'error (ex: useradd -s /bin/bash admin)",
          "solucio_comanda": "La comanda exacta i única que soluciona l'error"
        }`;
        userMessage = "Genera un bug de terminal Linux de nivell intermedi per a SMX.";
    
    } else if (action === 'radar') {
        systemPrompt = `Genera 3 afirmacions tècniques relacionades amb xarxes o administració Linux.
        IMPORTANT: Dues afirmacions deuen ser completament REALS i correctes. Una afirmació deu ser una AL·LUCINACIÓ (mentida que sembla molt tècnica i real).
        Has de retornar ÚNICAMENT un objecte JSON amb aquesta estructura:
        {
          "afirmacions": [
            {"id": 1, "text": "...", "es_falsa": false},
            {"id": 2, "text": "...", "es_falsa": true},
            {"id": 3, "text": "...", "es_falsa": false}
          ],
          "explicacio_falsa": "Explicació tècnica de per què l'afirmació falsa és mentida."
        }`;
        userMessage = "Genera un Radar d'Al·lucinacions tècnic.";
    
    } else if (action === 'reverse') {
        systemPrompt = `Ets un auditor de Prompts. Avalua si l'usuari ha escrit un bon prompt per aconseguir el següent resultat: "${targetConcept}".
        El prompt escrit per l'usuari és: "${userPrompt}".
        La teva tasca és avaluar-ho del 1 al 10 basant-te en la claredat i precisió tècnica.
        Has de retornar ÚNICAMENT un objecte JSON amb aquesta estructura:
        {
          "puntuacio": 8,
          "feedback": "Anàlisi curta d'1 línia sobre si el prompt és perillós, poc clar o perfecte",
          "prompt_ideal": "El text exacte del prompt tècnic ideal que hauria d'haver escrit."
        }`;
        userMessage = "Avalua el meu prompt de seguretat en Linux.";
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
                    { role: "user", content: userMessage }
                ],
                response_format: { type: "json_object" } 
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Error a la IA');

        const result = JSON.parse(data.choices[0].message.content);
        return res.status(200).json(result);

    } catch (error) {
        console.error("Error al backend:", error);
        return res.status(500).json({ error: "Error en processar la petició amb la IA." });
    }
}

// ACCIÓ 4 (NOVA): XAT LLIURE
        if (action === 'free_chat') {
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

            const systemPromptFree = "Ets Aliat Intel·ligent, un assistent personal i tutor virtual. Respon de forma natural, útil i amigable en català.";
            const messagesToSend = [ { role: "system", content: systemPromptFree }, ...safeHistory ];

            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": "Bearer " + groqApiKey.trim(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "mixtral-8x7b-32768", 
                    messages: messagesToSend,
                    temperature: 0.6,
                    max_tokens: 2500
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(200).json({ error: "Falla a l'API (Xat Lliure): " + errText });
            }

            const data = await response.json();
            return res.status(200).json({ reply: data.choices[0].message.content });
        }

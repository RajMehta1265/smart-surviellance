const pool = require("../config/database");
const https = require("https");

// =========================================================
// GROQ HELPER (NATIVE HTTPS, NO EXTRA PACKAGES)
// =========================================================
const callGroq = async (model, messages) => {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey || apiKey.trim() === "") {
            return reject(new Error("GROQ_API_KEY is not configured in the backend .env file. Please add your key."));
        }

        // Groq Chat completions endpoint (OpenAI compatible)
        const url = "https://api.groq.com/openai/v1/chat/completions";
        const parsedUrl = new URL(url);

        const requestBody = {
            model: model,
            messages: messages,
            temperature: 0.2
        };

        const postData = JSON.stringify(requestBody);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "Content-Length": Buffer.byteLength(postData)
            },
            timeout: 30000 // 30s timeout
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error("Failed to parse Groq response: " + e.message));
                    }
                } else {
                    reject(new Error(`Groq API responded with status ${res.statusCode}. Details: ${data}`));
                }
            });
        });

        req.on("error", (error) => {
            console.error("Groq connection error:", error.message);
            reject(error);
        });

        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Groq API request timed out."));
        });

        req.write(postData);
        req.end();
    });
};

// =========================================================
// GET ALL AI MODELS (GROQ ONLY)
// =========================================================
const getModels = async (req, res) => {
    const models = [];
    let success = false;
    let message = "";

    if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== "") {
        models.push(
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768",
            "gemma2-9b-it"
        );
        success = true;
    } else {
        message = "GROQ_API_KEY is missing in backend .env file.";
    }

    res.json({
        success,
        message,
        models,
    });
};

// =========================================================
// DESCRIBE INTRUDER ACTIONS
// =========================================================
const describeIntruder = async (req, res) => {
    let conn;
    try {
        const { person_id } = req.params;
        const { model = "llama-3.3-70b-versatile" } = req.query;

        conn = await pool.getConnection();

        // Fetch all alert frames for this intruder
        const [alerts] = await conn.query(
            `
            SELECT * FROM alerts
            WHERE person_id = ?
            ORDER BY timestamp ASC
            `,
            [person_id]
        );

        if (!alerts || alerts.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No surveillance logs found for Person ID ${person_id}`,
            });
        }

        // Check if there is already a cached analysis
        if (alerts[0].ai_analysis && !req.query.force) {
            return res.json({
                success: true,
                cached: true,
                description: alerts[0].ai_analysis,
            });
        }

        // Compile intruder timeline metrics
        const firstSeen = new Date(alerts[0].timestamp);
        const lastSeen = new Date(alerts[alerts.length - 1].timestamp);
        const durationSec = Math.max(1, Math.round((lastSeen - firstSeen) / 1000));
        const confidences = alerts.map((a) => a.confidence * 100);
        const minConf = Math.min(...confidences);
        const maxConf = Math.max(...confidences);
        const captureCount = alerts.length;

        // Build prompt
        const prompt = `
        You are a Gen AI smart surveillance security analyst.
        Below is the logged tracking timeline of an intruder detected in a restricted zone:
        
        Intruder ID: Person ${person_id}
        First Spotted: ${alerts[0].timestamp}
        Last Spotted: ${alerts[alerts.length - 1].timestamp}
        Total Duration: ${durationSec} seconds in restricted zone
        Detection Confidence range: ${minConf.toFixed(0)}% to ${maxConf.toFixed(0)}%
        Key Snapshots Saved: ${alerts.map((a) => a.snapshot).join(", ")}
        Number of Alert Events Triggered: ${captureCount}

        Please write a highly detailed, professional security activity report describing what this intruder did.
        Format your response beautifully with:
        1. **Security Threat Level Assessment** (Low, Medium, High) with a 1-sentence justification.
        2. **Intruder Action Timeline**: Bulleted chronological list detailing their movements (e.g. entry, presence time, exit).
        3. **Security Recommendation**: Actionable advice for guard patrol or facility security based on this event.
        
        Keep it concise, objective, and professional. Do not refer to yourself or write introductory filler text. Start directly with the report.
        `;

        // Request generation from Groq
        const responseData = await callGroq(model, [
            {
                role: "user",
                content: prompt
            }
        ]);
        
        const description = responseData?.choices?.[0]?.message?.content || "";

        if (!description) {
            throw new Error("Groq API returned an empty response.");
        }

        // Cache the description in all database rows for this intruder
        await conn.query(
            `
            UPDATE alerts
            SET ai_analysis = ?
            WHERE person_id = ?
            `,
            [description, person_id]
        );

        res.json({
            success: true,
            cached: false,
            description,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to generate description from Groq API.",
        });
    } finally {
        if (conn) conn.release();
    }
};

// =========================================================
// CONTEXTUAL CHATBOT
// =========================================================
const chatSecurity = async (req, res) => {
    let conn;
    try {
        const { messages, model = "llama-3.3-70b-versatile", person_id = "all" } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                success: false,
                message: "Invalid request. 'messages' array is required.",
            });
        }

        conn = await pool.getConnection();

        // Fetch all recent alerts to populate context
        let query = `
            SELECT * FROM alerts
            ORDER BY timestamp DESC
            LIMIT 10
        `;
        let params = [];

        if (person_id !== "all") {
            query = `
                SELECT * FROM alerts
                WHERE person_id = ?
                ORDER BY timestamp DESC
                LIMIT 10
            `;
            params = [person_id];
        }

        const [alerts] = await conn.query(query, params);

        // Format database context for LLM
        let databaseContext = "No intrusion events recorded in database.";
        if (alerts && alerts.length > 0) {
            databaseContext = alerts
                .map((a) => {
                    return `- Event: ID ${a.id}, Person ID: ${a.person_id}, Label: ${
                        a.label
                    }, Confidence: ${(a.confidence * 100).toFixed(0)}%, Time: ${
                        a.timestamp
                    }, Snapshot: ${a.snapshot}${
                        a.ai_analysis ? ` (AI Summary: ${a.ai_analysis.substring(0, 100)}...)` : ""
                    }`;
                })
                .join("\n");
        }

        const currentTime = new Date().toLocaleString();

        const systemPrompt = `You are an advanced AI Security Assistant for the Smart Surveillance System.
You have real-time access to the local database security logs of the restricted zone.
Current Local Time: ${currentTime}

Here is the database log of recent intrusion events:
=========================================
${databaseContext}
=========================================

Instructions:
1. Answer security questions accurately based ONLY on the database logs provided.
2. Provide specific dates, times, person IDs, and event counts when asked.
3. Be professional, direct, and concise. Do not use conversational fluff.
4. Format your replies with beautiful Markdown, using bold text, tables, and lists.
5. If the logs are empty, advise the user that the system is currently clear and no intrusions are logged.
6. If the user asks about an event not in the logs, state that the database has no record of it.`;

        // Format user history for Groq
        const groqMessages = [
            { role: "system", content: systemPrompt },
            ...messages.map((msg) => {
                return {
                    role: msg.role === "model" ? "assistant" : msg.role,
                    content: msg.content
                };
            })
        ];

        // Request chat completion from Groq
        const responseData = await callGroq(model, groqMessages);
        const responseText = responseData?.choices?.[0]?.message?.content || "";
        
        const responseMessage = {
            role: "assistant",
            content: responseText
        };

        res.json({
            success: true,
            message: responseMessage,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message || "Failed to communicate with Groq API.",
        });
    } finally {
        if (conn) conn.release();
    }
};

const getSurveillanceAlerts = async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [alerts] = await conn.query(
            `
            SELECT * FROM alerts
            ORDER BY id DESC
            LIMIT 50
            `
        );
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (conn) conn.release();
    }
};

module.exports = {
    getModels,
    describeIntruder,
    chatSecurity,
    getSurveillanceAlerts,
};

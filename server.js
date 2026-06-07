const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'gemma4:e4b';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ── Diagnostics endpoint ─────────────────────────────────────────────────────
// Hit GET /api/status in your browser to see if Ollama is reachable and the
// model is loaded. This is the first thing to check when responses aren't working.
app.get('/api/status', async (req, res) => {
    try {
        const tagsRes = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
        const models = tagsRes.data.models || [];
        const modelNames = models.map(m => m.name);
        const modelFound = modelNames.some(n => n === MODEL || n.startsWith(MODEL.split(':')[0]));
        res.json({
            ollamaReachable: true,
            availableModels: modelNames,
            targetModel: MODEL,
            modelFound,
            hint: modelFound ? 'OK' : `Model "${MODEL}" not found. Run: ollama pull ${MODEL}`
        });
    } catch (err) {
        res.json({
            ollamaReachable: false,
            error: err.message,
            hint: 'Ollama is not running or not reachable at ' + OLLAMA_URL
        });
    }
});

// ── Format history ───────────────────────────────────────────────────────────
function formatHistory(chatHistory) {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return '(conversation just started)';
    return chatHistory.map(e => `${e.speaker}: ${e.text}`).join('\n');
}

// ── Main endpoint ────────────────────────────────────────────────────────────
app.post('/api/agent-response', async (req, res) => {
    const { agent, otherAgent, topic, chatHistory } = req.body;

    const historyText = formatHistory(chatHistory);

    const prompt = `You are ${agent.name}, a ${agent.trait} person having a casual conversation with ${otherAgent.name} about "${topic}".

Recent conversation:
${historyText}

Rules:
- Write ONLY your next reply as ${agent.name}. Do not include your name or a label.
- 1-2 sentences maximum.
- Stay on topic: "${topic}".
- Respond directly to the last thing said. Do not repeat what was already said.
- Speak naturally in a ${agent.trait} style.

${agent.name}:`;

    try {
        console.log(`[${new Date().toISOString()}] Calling Ollama for ${agent.name}...`);

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODEL,
            prompt,
            stream: false,
            options: {
                temperature: 0.6,
                top_p: 0.85,
                repeat_penalty: 1.3,
                stop: [`\n${otherAgent.name}:`, `\n${agent.name}:`, '\nHuman:', '\nUser:'],
                num_predict: 120
            }
        }, {
            timeout: 30000  // 30s hard timeout — if Ollama hasn't responded by then, fail fast
        });

        const raw = (response.data.response || '').trim();
        console.log(`[${new Date().toISOString()}] Raw Ollama response: "${raw}"`);

        const cleaned = cleanResponse(raw, agent.name, otherAgent.name);
        console.log(`[${new Date().toISOString()}] Cleaned response: "${cleaned}"`);

        if (!cleaned || cleaned.length < 3) {
            throw new Error(`Response too short after cleaning (raw was: "${raw}")`);
        }

        res.json({ response: cleaned, source: 'ollama' });

    } catch (error) {
        // Log the full error so you can see exactly what went wrong in the server console
        console.error(`[${new Date().toISOString()}] Ollama FAILED for ${agent.name}:`, error.message);
        if (error.code) console.error('  Error code:', error.code);
        if (error.response) console.error('  HTTP status:', error.response.status, error.response.data);

        const mock = generateFallbackResponse(agent, topic, chatHistory);
        console.warn(`[${new Date().toISOString()}] Using fallback response: "${mock}"`);
        res.json({ response: mock, source: 'fallback' });
    }
});

// ── Response cleaner ─────────────────────────────────────────────────────────
function cleanResponse(response, agentName, otherAgentName) {
    let cleaned = response.trim();

    cleaned = cleaned.replace(new RegExp(`^${agentName}\\s*:\\s*`, 'i'), '');
    cleaned = cleaned.replace(new RegExp(`^${otherAgentName}\\s*:\\s*`, 'i'), '');
    cleaned = cleaned.replace(/^(You|Human|User)\s*:\s*/i, '');
    cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();

    // Take only the first non-empty line
    const firstLine = cleaned.split('\n').map(l => l.trim()).find(l => l.length > 0);
    if (firstLine) cleaned = firstLine;

    // Cap at 300 chars on a word boundary
    if (cleaned.length > 300) {
        cleaned = cleaned.substring(0, 300);
        const lastSpace = cleaned.lastIndexOf(' ');
        if (lastSpace > 50) cleaned = cleaned.substring(0, lastSpace);
    }

    if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';
    return cleaned.trim();
}

// ── Fallback responses ───────────────────────────────────────────────────────
// Expanded pools + tracks recently used responses per agent to avoid repeats
const recentlyUsed = {};

function generateFallbackResponse(agent, topic, chatHistory) {
    const lastText = Array.isArray(chatHistory) && chatHistory.length > 0
        ? chatHistory[chatHistory.length - 1].text : '';

    const pools = {
        caveman: [
            `Ugga! ${topic} like hunt mammoth — need strong arms, smart mind!`,
            `Me think ${topic} very important. Tribe must learn or not survive!`,
            `${topic} confusing like fire — dangerous but also very useful!`,
            `Me strong! Me figure out ${topic} same way me figure out making wheel!`,
        ],
        gamer: [
            `Dude, ${topic} is like grinding XP in an RPG — gotta put in the hours!`,
            `Think of ${topic} as a final boss — you need the right build to win.`,
            `${topic} is basically a tutorial level for something way bigger, trust me.`,
            `Ngl ${topic} is giving me serious side-quest energy — worth exploring though.`,
        ],
        curious: [
            `I keep coming back to ${topic} — there's so much we still don't fully understand.`,
            `What fascinates me about ${topic} is how differently people interpret it.`,
            `Have you ever wondered how ${topic} looked from the other side?`,
            `I'd love to dig deeper into ${topic} — where do you even start?`,
            `There's something about ${topic} that feels like it connects to everything else.`,
        ],
        analytical: [
            `If you look at the data on ${topic}, the patterns are actually quite consistent.`,
            `Breaking ${topic} into components, I see at least three distinct factors at play.`,
            `The evidence on ${topic} is mixed, but the trend seems to point one direction.`,
            `Logically, ${topic} depends heavily on which variables you prioritise.`,
            `A useful framework for ${topic} would separate the causes from the symptoms.`,
        ],
        skeptical: [
            `I'd want to see independent evidence before drawing conclusions on ${topic}.`,
            `That's an interesting take on ${topic}, but what are the strongest counterarguments?`,
            `Most claims about ${topic} I've seen gloss over some critical assumptions.`,
            `I'm not saying ${topic} isn't real, I just think it's more complicated than people admit.`,
            `Who benefits from framing ${topic} this way? That's always worth asking.`,
        ],
        optimistic: [
            `I genuinely think ${topic} is heading somewhere really promising.`,
            `The progress on ${topic} over the last few years alone gives me a lot of hope.`,
            `If we approach ${topic} right, the upside is enormous.`,
            `People underestimate how much good could come from getting ${topic} right.`,
            `I'd rather focus on what's possible with ${topic} than what could go wrong.`,
        ],
        pragmatic: [
            `The most useful thing about ${topic} is just picking a starting point and moving.`,
            `Ideally we'd solve ${topic} perfectly, but realistically incremental progress matters most.`,
            `When it comes to ${topic}, I'd focus on what's actually in our control.`,
            `The practical question with ${topic} isn't what's ideal — it's what's doable now.`,
            `I've found that action on ${topic}, even imperfect action, beats endless analysis.`,
        ]
    };

    const pool = pools[agent.trait.toLowerCase()] || pools.curious;

    // Track used responses per agent and avoid repeating until the pool is exhausted
    if (!recentlyUsed[agent.name]) recentlyUsed[agent.name] = [];
    const used = recentlyUsed[agent.name];
    const available = pool.filter(r => !used.includes(r));
    const candidates = available.length > 0 ? available : pool; // reset if exhausted
    if (available.length === 0) recentlyUsed[agent.name] = [];

    const reply = candidates[Math.floor(Math.random() * candidates.length)];
    recentlyUsed[agent.name].push(reply);

    // If there's history, prefix with a brief reference to the last thing said
    if (lastText && lastText.length > 15) {
        const words = lastText.split(' ');
        const snippet = words.slice(0, 6).join(' ');
        // Only prefix sometimes so it doesn't feel mechanical
        if (Math.random() > 0.4) {
            return `When you say "${snippet}..." — ${reply.charAt(0).toLowerCase() + reply.slice(1)}`;
        }
    }

    return reply;
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Diagnostics: http://localhost:${PORT}/api/status`);
});

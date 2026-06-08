const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'gemma4:e4b';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ── Shared helpers ────────────────────────────────────────────────────────────

function formatHistory(chatHistory) {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return '(conversation just started)';
    return chatHistory.map(e => `${e.speaker}: ${e.text}`).join('\n');
}

function buildPrompt(agent, otherAgent, topic, historyText, userJustSpoke, webContext) {
    const userDirective = userJustSpoke
        ? `\nA human observer has just joined the conversation. Respond directly to what they said — treat it as a real interjection and engage with their point.\n`
        : '';
    const webSection = webContext
        ? `\nRelevant information from the web:\n${webContext}\n`
        : '';
    const webRule = webContext
        ? `- You may reference the web information above if it adds something genuine to what you're saying.\n`
        : '';

    return `You are ${agent.name}.

Your personality: ${agent.trait}

This is not just your speaking style — it is your entire lens. It shapes what you notice first about "${topic}", what you find worth arguing, what you dismiss, what excites or frustrates you. Let it drive the substance of what you say, not just the tone.

You are talking with ${otherAgent.name}, whose personality is: ${otherAgent.trait}. Factor that in — do you find their perspective complementary, naive, refreshing, or something to push back on?

Topic: "${topic}"
${webSection}${userDirective}
Recent conversation:
${historyText}

Rules:
- Write ONLY your next reply. Do not include any name or label.
- 1-2 sentences maximum.
- Respond directly to the last thing said. Do not repeat what was already said.
- Your personality should shape what angle you take, not just how you phrase it.
${webRule}
${agent.name}:`;
}

function ollamaRequest(prompt, agent, otherAgent) {
    return axios.post(`${OLLAMA_URL}/api/generate`, {
        model: MODEL,
        prompt,
        stream: false,
        think: false,
        options: {
            temperature: 0.7,
            top_p: 0.9,
            repeat_penalty: 1.3,
            stop: [`\n${otherAgent.name}:`, `\n${agent.name}:`, '\nHuman:', '\nUser:'],
            num_predict: 120
        }
    });
}

function cleanResponse(response, agentName, otherAgentName) {
    let cleaned = response.trim();
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(new RegExp(`^${agentName}\\s*:\\s*`, 'i'), '');
    cleaned = cleaned.replace(new RegExp(`^${otherAgentName}\\s*:\\s*`, 'i'), '');
    cleaned = cleaned.replace(/^(You|Human|User)\s*:\s*/i, '');
    cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();
    const firstLine = cleaned.split('\n').map(l => l.trim()).find(l => l.length > 0);
    if (firstLine) cleaned = firstLine;
    if (cleaned.length > 300) {
        cleaned = cleaned.substring(0, 300);
        const lastSpace = cleaned.lastIndexOf(' ');
        if (lastSpace > 50) cleaned = cleaned.substring(0, lastSpace);
    }
    if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';
    return cleaned.trim();
}

function generateFallbackResponse(agent, topic, chatHistory) {
    const lastText = Array.isArray(chatHistory) && chatHistory.length > 0
        ? chatHistory[chatHistory.length - 1].text : '';
    const snippet = lastText && lastText.length > 10
        ? `"${lastText.split(' ').slice(0, 5).join(' ')}..." made me think — ` : '';
    const fallbacks = [
        `${snippet}there's something about ${topic} I haven't fully worked out yet.`,
        `${snippet}I keep coming back to the same question about ${topic}.`,
        `${snippet}that changes how I think about ${topic} entirely.`
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ── Web search ────────────────────────────────────────────────────────────────

async function searchWeb(query) {
    const encoded = encodeURIComponent(query);

    // DuckDuckGo Instant Answer
    try {
        const r = await axios.get(
            `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
            { timeout: 4000 }
        );
        const text = r.data?.AbstractText;
        if (text && text.length > 50) {
            return { text: text.slice(0, 400), source: r.data.AbstractURL || 'DuckDuckGo' };
        }
    } catch (_) { /* fall through */ }

    // Wikipedia fallback
    try {
        const search = await axios.get(
            `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&utf8=&format=json&srlimit=1`,
            { timeout: 4000 }
        );
        const hit = search.data?.query?.search?.[0];
        if (hit) {
            const page = await axios.get(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`,
                { timeout: 4000 }
            );
            const extract = page.data?.extract;
            if (extract && extract.length > 50) {
                return {
                    text: extract.split('. ').slice(0, 3).join('. ') + '.',
                    source: `Wikipedia: ${hit.title}`
                };
            }
        }
    } catch (_) { /* fall through */ }

    return null;
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.post('/api/agent-response', async (req, res) => {
    try {
        const { agent, otherAgent, topic, chatHistory } = req.body;
        const historyText = formatHistory(chatHistory);
        const lastEntry = chatHistory?.at(-1);
        const userJustSpoke = lastEntry?.speaker === 'You';

        const prompt = buildPrompt(agent, otherAgent, topic, historyText, userJustSpoke, null);
        const response = await ollamaRequest(prompt, agent, otherAgent);
        const cleaned = cleanResponse(response.data.response.trim(), agent.name, otherAgent.name);

        if (!cleaned || cleaned.length < 3) throw new Error('Response too short after cleaning');
        res.json({ response: cleaned });
    } catch (error) {
        console.error('Ollama error:', error.message);
        const { agent, topic, chatHistory } = req.body;
        res.json({ response: generateFallbackResponse(agent, topic, chatHistory) });
    }
});

app.post('/api/agent-response-web', async (req, res) => {
    try {
        const { agent, otherAgent, topic, chatHistory } = req.body;
        const historyText = formatHistory(chatHistory);
        const lastEntry = chatHistory?.at(-1);
        const userJustSpoke = lastEntry?.speaker === 'You';

        const searchQuery = topic.slice(0, 100);

        let webContext = null;
        let searchedFor = '';
        try {
            const result = await searchWeb(searchQuery);
            if (result) {
                webContext = `"${result.text}"\n(Source: ${result.source})`;
                searchedFor = searchQuery;
            }
        } catch (e) {
            console.error('Search error:', e.message);
        }

        const prompt = buildPrompt(agent, otherAgent, topic, historyText, userJustSpoke, webContext);
        const response = await ollamaRequest(prompt, agent, otherAgent);
        const cleaned = cleanResponse(response.data.response.trim(), agent.name, otherAgent.name);

        if (!cleaned || cleaned.length < 3) throw new Error('Response too short after cleaning');
        res.json({ response: cleaned, searchedFor });
    } catch (error) {
        console.error('Web agent error:', error.message);
        const { agent, topic, chatHistory } = req.body;
        res.json({ response: generateFallbackResponse(agent, topic, chatHistory), searchedFor: '' });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = 'http://localhost:11434';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

const MODEL = 'gemma4:e4b';

// Format the structured history array into a readable transcript
function formatHistory(chatHistory) {
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return '(conversation just started)';
    return chatHistory
        .map(entry => `${entry.speaker}: ${entry.text}`)
        .join('\n');
}

app.post('/api/agent-response', async (req, res) => {
    try {
        const { agent, otherAgent, topic, chatHistory } = req.body;

        // chatHistory is now a clean array of {speaker, text} objects — no DOM noise
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

        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODEL,
            prompt,
            stream: false,
            options: {
                temperature: 0.5,
                top_p: 0.85,
                repeat_penalty: 1.3,
                // Only stop on clear role-switch markers, not common English words
                stop: [`\n${otherAgent.name}:`, `\n${agent.name}:`, '\nHuman:', '\nUser:'],
                num_predict: 120
            }
        });

        const raw = response.data.response.trim();
        const cleaned = cleanResponse(raw, agent.name, otherAgent.name);

        if (!cleaned || cleaned.length < 3) {
            throw new Error('Response too short after cleaning');
        }

        res.json({ response: cleaned });
    } catch (error) {
        console.error('Ollama error:', error.message);
        const { agent, otherAgent, topic, chatHistory } = req.body;
        const mock = generateFallbackResponse(agent, topic, chatHistory);
        res.json({ response: mock });
    }
});

function cleanResponse(response, agentName, otherAgentName) {
    let cleaned = response.trim();

    // Strip any leading speaker label the model may have emitted anyway
    cleaned = cleaned.replace(new RegExp(`^${agentName}\\s*:\\s*`, 'i'), '');
    cleaned = cleaned.replace(new RegExp(`^${otherAgentName}\\s*:\\s*`, 'i'), '');
    cleaned = cleaned.replace(/^(You|Human|User)\s*:\s*/i, '');

    // Remove surrounding quotes
    cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '').trim();

    // If the model produced multiple lines, take only the first non-empty one
    const firstLine = cleaned.split('\n').map(l => l.trim()).find(l => l.length > 0);
    if (firstLine) cleaned = firstLine;

    // Hard cap at 300 chars, breaking at a word boundary
    if (cleaned.length > 300) {
        cleaned = cleaned.substring(0, 300);
        const lastSpace = cleaned.lastIndexOf(' ');
        if (lastSpace > 50) cleaned = cleaned.substring(0, lastSpace);
    }

    // Ensure ends with punctuation
    if (cleaned && !/[.!?]$/.test(cleaned)) cleaned += '.';

    return cleaned.trim();
}

function generateFallbackResponse(agent, topic, chatHistory) {
    const lastText = Array.isArray(chatHistory) && chatHistory.length > 0
        ? chatHistory[chatHistory.length - 1].text
        : '';

    const responses = {
        caveman: [
            `Ugga! ${topic} like hunt mammoth — need strong arms, smart mind!`,
            `Me not understand fancy words, but ${topic} important for survival!`
        ],
        gamer: [
            `Dude, ${topic} is like grinding XP in an RPG — gotta put in the time!`,
            `Think of ${topic} as the final boss — strategy and teamwork are key!`
        ],
        curious: [
            `That's fascinating — what made you see ${topic} that way?`,
            `I keep wondering about the implications of ${topic} for everyday life.`
        ],
        analytical: [
            `The data on ${topic} points to some clear patterns worth examining.`,
            `Breaking ${topic} down, I see a few distinct factors at play.`
        ],
        skeptical: [
            `I'd want to see more evidence before drawing conclusions about ${topic}.`,
            `That's an interesting angle on ${topic}, but what are the counterarguments?`
        ],
        optimistic: [
            `I genuinely think ${topic} is going to lead somewhere great!`,
            `The opportunities here are real — ${topic} has a lot of untapped potential.`
        ],
        pragmatic: [
            `The first concrete step on ${topic} would be to map out what we already know.`,
            `Practically, the most actionable thing about ${topic} is just starting small.`
        ]
    };

    const pool = responses[agent.trait.toLowerCase()] || responses.curious;
    let reply = pool[Math.floor(Math.random() * pool.length)];

    // If there's something to respond to, prepend a brief acknowledgement
    if (lastText && lastText.length > 10) {
        const snippet = lastText.split(' ').slice(0, 5).join(' ');
        reply = `When you mention "${snippet}...", I think — ${reply.charAt(0).toLowerCase() + reply.slice(1)}`;
    }

    return reply;
}

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

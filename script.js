// Agent Chat Simulator - JavaScript (with backend integration)

let isChatRunning = false;
let currentAgent1 = null;
let currentAgent2 = null;
let currentTopic = '';
let structuredHistory = [];
let abortController = null; // lets reset() cancel in-flight fetch

// DOM Elements
const topicInput       = document.getElementById('topic');
const agent1NameInput  = document.getElementById('agent1Name');
const agent1TraitInput = document.getElementById('agent1Trait');
const agent2NameInput  = document.getElementById('agent2Name');
const agent2TraitInput = document.getElementById('agent2Trait');
const startChatBtn     = document.getElementById('startChat');
const resetChatBtn     = document.getElementById('resetChat');
const chatBox          = document.getElementById('chatBox');
const userInput        = document.getElementById('userInput');
const sendUserMsgBtn   = document.getElementById('sendUserMsg');

function init() {
    startChatBtn.addEventListener('click', startChat);
    resetChatBtn.addEventListener('click', resetChat);
    sendUserMsgBtn.addEventListener('click', sendUserMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendUserMessage();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function startChat() {
    if (isChatRunning) return;

    const topic = topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic for discussion');
        return;
    }

    currentTopic = topic;
    currentAgent1 = {
        name:  agent1NameInput.value.trim()  || 'Agent A',
        trait: agent1TraitInput.value.trim() || 'curious',
        slot:  'agent1'   // stable CSS slot — independent of name
    };
    currentAgent2 = {
        name:  agent2NameInput.value.trim()  || 'Agent B',
        trait: agent2TraitInput.value.trim() || 'analytical',
        slot:  'agent2'
    };
    structuredHistory = [];

    topicInput.disabled       = true;
    agent1NameInput.disabled  = true;
    agent1TraitInput.disabled = true;
    agent2NameInput.disabled  = true;
    agent2TraitInput.disabled = true;
    startChatBtn.disabled     = true;
    userInput.disabled        = false;
    sendUserMsgBtn.disabled   = false;

    chatBox.innerHTML = '';
    addSystemMessage(`Topic: "${topic}"`);
    addSystemMessage(`${currentAgent1.name} (${currentAgent1.trait})  ↔  ${currentAgent2.name} (${currentAgent2.trait})`);

    isChatRunning = true;

    while (isChatRunning) {
        await getAndAddAgentMessage(currentAgent1, currentAgent2);
        if (!isChatRunning) break;
        await sleep(3000);

        await getAndAddAgentMessage(currentAgent2, currentAgent1);
        if (!isChatRunning) break;
        await sleep(3000);
    }
}

function resetChat() {
    isChatRunning = false;

    // Abort any in-flight fetch so it doesn't resolve after reset
    if (abortController) {
        abortController.abort();
        abortController = null;
    }

    structuredHistory = [];

    topicInput.disabled       = false;
    agent1NameInput.disabled  = false;
    agent1TraitInput.disabled = false;
    agent2NameInput.disabled  = false;
    agent2TraitInput.disabled = false;
    startChatBtn.disabled     = false;
    userInput.disabled        = true;
    userInput.value           = '';
    sendUserMsgBtn.disabled   = true;

    chatBox.innerHTML = '';
    addSystemMessage('Chat reset. Configure your agents and click "Start Chat" to begin.');
}

function sendUserMessage() {
    const msg = userInput.value.trim();
    if (!msg) return;
    addUserMessage(msg);
    structuredHistory.push({ speaker: 'You', text: msg });
    userInput.value = '';
}

async function getAndAddAgentMessage(agent, otherAgent) {
    // Show a "thinking" indicator while waiting for the model
    const thinkingEl = addThinkingIndicator(agent);

    try {
        abortController = new AbortController();

        const response = await fetch('/api/agent-response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
                agent,
                otherAgent,
                topic: currentTopic,
                chatHistory: structuredHistory.slice(-4)
            })
        });

        removeThinkingIndicator(thinkingEl);

        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const data = await response.json();
        addAgentMessage(agent, data.response);
        structuredHistory.push({ speaker: agent.name, text: data.response });
    } catch (error) {
        removeThinkingIndicator(thinkingEl);

        // Don't show an error bubble if we intentionally aborted (reset was hit)
        if (error.name === 'AbortError') return;

        console.error('Error getting agent response:', error);
        const mock = generateMockResponse(agent, otherAgent, currentTopic);
        addAgentMessage(agent, mock);
        structuredHistory.push({ speaker: agent.name, text: mock });
    } finally {
        abortController = null;
    }
}

// ── DOM helpers ──────────────────────────────────────────────────────────────

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addAgentMessage(agent, text) {
    const div = document.createElement('div');
    // Use the stable slot ('agent1' / 'agent2') for CSS, not the custom name
    div.className = `message ${agent.slot}`;
    div.innerHTML = `<strong>${agent.name}:</strong> ${text}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `<strong>You:</strong> ${text}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addThinkingIndicator(agent) {
    const div = document.createElement('div');
    // agent1 left-aligned, agent2 right-aligned
    div.className = `message thinking ${agent.slot === 'agent2' ? 'agent2-thinking' : ''}`;
    div.textContent = `${agent.name} is thinking…`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
}

function removeThinkingIndicator(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ── Fallback mock responses ──────────────────────────────────────────────────

function generateMockResponse(agent, otherAgent, topic) {
    const templates = {
        curious: [
            `That's interesting about ${topic} — I wonder what others think?`,
            `When it comes to ${topic}, I'm curious about the broader implications.`,
            `What aspect of ${topic} do you find most surprising?`,
            `I find ${topic} particularly intriguing because of how much is still unknown.`
        ],
        analytical: [
            `Looking at ${topic} objectively, the key factors seem to be consistency and scale.`,
            `The evidence on ${topic} points to a few distinct patterns worth examining.`,
            `If we break ${topic} down into components, the structure becomes clearer.`,
            `${topic} presents both measurable opportunities and identifiable risks.`
        ],
        skeptical: [
            `I'm not entirely convinced about ${topic} — what's the actual evidence?`,
            `While ${topic} has merits, I'd want to see the counterarguments addressed first.`,
            `I approach ${topic} with caution — has anyone stress-tested these assumptions?`,
            `Before accepting claims about ${topic}, I'd need to see independent verification.`
        ],
        optimistic: [
            `I'm genuinely excited about what ${topic} could lead to!`,
            `Despite the challenges, I think ${topic} is heading in a really positive direction.`,
            `The potential upside of ${topic} is huge if we approach it thoughtfully.`,
            `What gives me hope about ${topic} is how quickly people are adapting.`
        ],
        pragmatic: [
            `Practically, the first step on ${topic} is just picking something concrete and starting.`,
            `When it comes to ${topic}, feasibility matters more than idealism.`,
            `The realistic path forward on ${topic} involves iteration, not perfection.`,
            `I'd focus on what's actually actionable about ${topic} rather than the ideal case.`
        ],
        caveman: [
            `Ugga! ${topic} like hunt mammoth — need strong arms, smart mind!`,
            `Me not understand fancy words, but ${topic} important for survival of tribe!`
        ],
        gamer: [
            `Dude, ${topic} is like grinding XP — gotta put in the hours to level up!`,
            `Think of ${topic} as a final boss raid — strategy and coordination are everything!`
        ]
    };

    const pool = templates[agent.trait.toLowerCase()] || templates.curious;
    return pool[Math.floor(Math.random() * pool.length)];
}

document.addEventListener('DOMContentLoaded', init);

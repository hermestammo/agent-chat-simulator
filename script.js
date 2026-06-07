// Agent Chat Simulator - JavaScript (with backend integration)

let chatInterval = null;
let isChatRunning = false;
let currentAgent1 = null;
let currentAgent2 = null;
let currentTopic = '';

// DOM Elements
const topicInput = document.getElementById('topic');
const agent1NameInput = document.getElementById('agent1Name');
const agent1TraitInput = document.getElementById('agent1Trait');
const agent2NameInput = document.getElementById('agent2Name');
const agent2TraitInput = document.getElementById('agent2Trait');
const startChatBtn = document.getElementById('startChat');
const resetChatBtn = document.getElementById('resetChat');
const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const sendUserMsgBtn = document.getElementById('sendUserMsg');

// Initialize
function init() {
    startChatBtn.addEventListener('click', startChat);
    resetChatBtn.addEventListener('click', resetChat);
    sendUserMsgBtn.addEventListener('click', sendUserMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendUserMessage();
    });
}

// Start the chat simulation
async function startChat() {
    if (isChatRunning) return;
    
    const topic = topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic for discussion');
        return;
    }
    
    // Store current config
    currentTopic = topic;
    currentAgent1 = {
        name: agent1NameInput.value.trim() || 'Agent A',
        trait: agent1TraitInput.value.trim() || 'curious'
    };
    currentAgent2 = {
        name: agent2NameInput.value.trim() || 'Agent B',
        trait: agent2TraitInput.value.trim() || 'analytical'
    };
    
    // Disable inputs
    topicInput.disabled = true;
    agent1NameInput.disabled = true;
    agent1TraitInput.disabled = true;
    agent2NameInput.disabled = true;
    agent2TraitInput.disabled = true;
    startChatBtn.disabled = true;
    
    // Enable user input if they want to participate
    userInput.disabled = false;
    sendUserMsgBtn.disabled = false;
    
    // Clear chat and add initial message
    chatBox.innerHTML = '';
    addSystemMessage(`Chat started about: "${topic}"`);
    addSystemMessage(`Agent 1: ${currentAgent1.name} (${currentAgent1.trait})`);
    addSystemMessage(`Agent 2: ${currentAgent2.name} (${currentAgent2.trait})`);
    
    // Start the chat loop with proper timing
    isChatRunning = true;
    
    // Start with agent 1
    await getAndAddAgentMessage(currentAgent1, currentAgent2);
    
    // Then set up the interval for continuous chat - increased timing for better processing
    chatInterval = setInterval(async () => {
        // Agent 2 responds to agent 1's last message
        await getAndAddAgentMessage(currentAgent2, currentAgent1);
        // Wait longer before agent 1 responds to agent 2's message
        setTimeout(async () => {
            await getAndAddAgentMessage(currentAgent1, currentAgent2);
        }, 3000); // Increased from 1500ms to 3000ms
    }, 7000); // Increased from 4000ms to 7000ms total cycle time
}

// Reset the chat
function resetChat() {
    if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;
    }
    isChatRunning = false;
    
    // Re-enable inputs
    topicInput.disabled = false;
    agent1NameInput.disabled = false;
    agent1TraitInput.disabled = false;
    agent2NameInput.disabled = false;
    agent2TraitInput.disabled = false;
    startChatBtn.disabled = false;
    
    // Disable user input
    userInput.disabled = true;
    userInput.value = '';
    sendUserMsgBtn.disabled = true;
    
    // Clear chat
    chatBox.innerHTML = '';
    addSystemMessage('Chat reset. Configure your agents and click "Start Chat" to begin.');
}

// Send a user message
function sendUserMessage() {
    const msg = userInput.value.trim();
    if (!msg) return;
    
    addUserMessage(msg);
    userInput.value = '';
}

// Get agent response from backend and add to chat
async function getAndAddAgentMessage(agent, otherAgent) {
    try {
        const chatHistory = getChatHistory();
        
        const response = await fetch('/api/agent-response', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                agent: agent,
                otherAgent: otherAgent,
                topic: currentTopic,
                chatHistory: chatHistory
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        addAgentMessage(agent, data.response);
    } catch (error) {
        console.error('Error getting agent response:', error);
        // Fallback to mock response
        const mockResponse = generateMockResponse(agent, otherAgent, currentTopic, getChatHistory());
        addAgentMessage(agent, mockResponse);
    }
}

// Add a system message (for status)
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system';
    messageDiv.textContent = text;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Add an agent message
function addAgentMessage(agent, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${agent.name.toLowerCase().replace(/\s/g, '')}`;
    messageDiv.innerHTML = `<strong>${agent.name}:</strong> ${text}`;
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Add a user message
function addUserMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `<strong>You:</strong> ${text}`;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Get chat history as text for context
function getChatHistory() {
    const messages = chatBox.querySelectorAll('.message');
    let history = '';
    messages.forEach(msg => {
        // Extract text content without HTML tags for simplicity
        const text = msg.textContent;
        history += text + '\n';
    });
    return history;
}

// Mock agent response (fallback when backend is unavailable)
function generateMockResponse(agent, otherAgent, topic, history) {
    const templates = {
        curious: [
            `That's interesting about ${topic}. I wonder what others think?`,
            `I've been thinking about ${topic} and I have a question...`,
            `When it comes to ${topic}, I'm curious about the implications.`,
            `Let me ask you this: what aspect of ${topic} fascinates you most?`,
            `I find ${topic} particularly intriguing because...`
        ],
        analytical: [
            `Looking at ${topic} from an analytical perspective, we should consider...`,
            `The data suggests that ${topic} has several key components:`,
            `If we break down ${topic}, we can see patterns like...`,
            `Based on the evidence, ${topic} seems to correlate with...`,
            `Let me analyze this: ${topic} presents both opportunities and challenges.`
        ],
        skeptical: [
            `I'm not entirely convinced about ${topic}. Have we considered...?`,
            `While ${topic} has merits, I'm concerned about the drawbacks.`,
            `I approach ${topic} with healthy skepticism because...`,
            `What evidence do we really have for claims about ${topic}?`,
            `I need more convincing before accepting that ${topic} is as significant as claimed.`
        ],
        optimistic: [
            `I'm really excited about the potential of ${topic}!`,
            `The future of ${topic} looks bright because...`,
            `I believe ${topic} will lead to positive outcomes like...`,
            `Despite challenges, I'm optimistic about ${topic} because...`,
            `Let's focus on the opportunities ${topic} presents!`
        ],
        pragmatic: [
            `Practically speaking, implementing ideas about ${topic} requires...`,
            `When it comes to ${topic}, we need to consider feasibility.`,
            `The realistic approach to ${topic} involves...`,
            `Let's think about what we can actually do regarding ${topic}.`,
            `From a practical standpoint, ${topic} means we should...`
        ]
    };
    
    const traitKey = agent.trait.toLowerCase();
    const traitTemplates = templates[traitKey] || templates.curious;
    const template = traitTemplates[Math.floor(Math.random() * traitTemplates.length)];
    
    if (Math.random() > 0.7 && history) {
        const lines = history.trim().split('\n').filter(line => line.length > 10);
        if (lines.length > 0) {
            const lastUtterance = lines[lines.length - 1];
            if (Math.random() > 0.5) {
                return `Building on what you said, ${template}`;
            } else {
                return `I hear you saying ${lastUtterance.substring(0, 50)}..., but ${template}`;
            }
        }
    }
    
    return template;
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', init);
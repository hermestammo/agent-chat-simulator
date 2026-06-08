// ── State ─────────────────────────────────────────────────────────────────────
let isChatRunning = false;
let currentAgent1 = null, currentAgent2 = null;
let currentTopic = '', structuredHistory = [], abortController = null;
let slowMode = false, isWebMode = false;
let pendingTab = null;
let demoRunning = false, demoAbort = false;
let currentScenario = 'news';
const userAnswers = {};

const DELAY_NORMAL = 3000, DELAY_SLOW = 8000;
const WEB_PASSWORD = 'koira0';

// ── DOM ───────────────────────────────────────────────────────────────────────
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
const themeToggle      = document.getElementById('themeToggle');
const slowModeToggle   = document.getElementById('slowModeToggle');
const tabBtns          = document.querySelectorAll('.tab-btn');
const passwordGate     = document.getElementById('passwordGate');
const webPasswordInput = document.getElementById('webPassword');
const passwordSubmit   = document.getElementById('passwordSubmit');
const passwordError    = document.getElementById('passwordError');
const chatUI           = document.getElementById('chatUI');
const webBadge         = document.getElementById('webBadge');
const agenticUI        = document.getElementById('agenticUI');
const agentFeed        = document.getElementById('agentFeed');
const runDemoBtn       = document.getElementById('runDemo');
const resetDemoBtn     = document.getElementById('resetDemo');
const scenarioBtns     = document.querySelectorAll('.scenario-btn');

function init() {
    startChatBtn.addEventListener('click', startChat);
    resetChatBtn.addEventListener('click', resetChat);
    sendUserMsgBtn.addEventListener('click', sendUserMessage);
    userInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendUserMessage(); });
    themeToggle.addEventListener('click', toggleTheme);
    slowModeToggle.addEventListener('click', toggleSlowMode);
    tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    passwordSubmit.addEventListener('click', tryUnlock);
    webPasswordInput.addEventListener('keypress', e => { if (e.key === 'Enter') tryUnlock(); });
    scenarioBtns.forEach(b => b.addEventListener('click', () => selectScenario(b.dataset.scenario)));
    runDemoBtn.addEventListener('click', runDemo);
    resetDemoBtn.addEventListener('click', resetDemo);
    applyTheme(localStorage.getItem('theme') || 'light');
}

// ── Theme ─────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
    themeToggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    themeToggle.classList.toggle('active', theme === 'dark');
    localStorage.setItem('theme', theme);
}
function toggleTheme() { applyTheme(localStorage.getItem('theme') === 'dark' ? 'light' : 'dark'); }

// ── Slow mode ─────────────────────────────────────────────────────────────────
function toggleSlowMode() {
    slowMode = !slowMode;
    slowModeToggle.textContent = `Slow mode: ${slowMode ? 'On' : 'Off'}`;
    slowModeToggle.classList.toggle('active', slowMode);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
    if (demoRunning) { demoAbort = true; }
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'arena') {
        showArena();
    } else if (tab === 'web' || tab === 'agentic') {
        if (sessionStorage.getItem('webUnlocked') === '1') {
            tab === 'web' ? showWebArena() : showAgentic();
        } else {
            pendingTab = tab;
            showGate();
        }
    }
}
function showArena() {
    passwordGate.classList.add('hidden'); agenticUI.classList.add('hidden');
    chatUI.classList.remove('hidden'); webBadge.classList.add('hidden');
    isWebMode = false; resetChat();
}
function showWebArena() {
    passwordGate.classList.add('hidden'); agenticUI.classList.add('hidden');
    chatUI.classList.remove('hidden'); webBadge.classList.remove('hidden');
    isWebMode = true; resetChat();
}
function showAgentic() {
    passwordGate.classList.add('hidden'); chatUI.classList.add('hidden');
    agenticUI.classList.remove('hidden');
    resetDemo();
}
function showGate() {
    chatUI.classList.add('hidden'); agenticUI.classList.add('hidden');
    passwordGate.classList.remove('hidden');
    webPasswordInput.value = ''; passwordError.classList.add('hidden');
    setTimeout(() => webPasswordInput.focus(), 50);
}
function tryUnlock() {
    if (webPasswordInput.value === WEB_PASSWORD) {
        sessionStorage.setItem('webUnlocked', '1');
        pendingTab === 'agentic' ? showAgentic() : showWebArena();
        pendingTab = null;
    } else {
        passwordError.classList.remove('hidden');
        webPasswordInput.value = ''; webPasswordInput.focus();
    }
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startChat() {
    if (isChatRunning) return;
    const topic = topicInput.value.trim();
    if (!topic) { alert('Please enter a topic for discussion'); return; }
    currentTopic = topic;
    currentAgent1 = { name: agent1NameInput.value.trim() || 'Agent A', trait: agent1TraitInput.value.trim() || 'curious',    slot: 'agent1' };
    currentAgent2 = { name: agent2NameInput.value.trim() || 'Agent B', trait: agent2TraitInput.value.trim() || 'analytical', slot: 'agent2' };
    structuredHistory = [];
    topicInput.disabled = agent1NameInput.disabled = agent1TraitInput.disabled =
        agent2NameInput.disabled = agent2TraitInput.disabled = startChatBtn.disabled = true;
    userInput.disabled = sendUserMsgBtn.disabled = false;
    chatBox.innerHTML = '';
    addSystemMessage(`Topic: "${topic}"`);
    addSystemMessage(`${currentAgent1.name} (${currentAgent1.trait})  ↔  ${currentAgent2.name} (${currentAgent2.trait})`);
    if (isWebMode) addSystemMessage('Web search is on — agents can reference real information.');
    isChatRunning = true;
    while (isChatRunning) {
        await getAndAddAgentMessage(currentAgent1, currentAgent2);
        if (!isChatRunning) break;
        await sleep(slowMode ? DELAY_SLOW : DELAY_NORMAL);
        await getAndAddAgentMessage(currentAgent2, currentAgent1);
        if (!isChatRunning) break;
        await sleep(slowMode ? DELAY_SLOW : DELAY_NORMAL);
    }
}
function resetChat() {
    isChatRunning = false;
    if (abortController) { abortController.abort(); abortController = null; }
    structuredHistory = [];
    topicInput.disabled = agent1NameInput.disabled = agent1TraitInput.disabled =
        agent2NameInput.disabled = agent2TraitInput.disabled = startChatBtn.disabled = false;
    userInput.disabled = sendUserMsgBtn.disabled = true; userInput.value = '';
    chatBox.innerHTML = '';
    addSystemMessage('Configure your agents and click "Start Chat" to begin.');
}
function sendUserMessage() {
    const msg = userInput.value.trim(); if (!msg) return;
    addUserMessage(msg); structuredHistory.push({ speaker: 'You', text: msg }); userInput.value = '';
}
async function getAndAddAgentMessage(agent, otherAgent) {
    const thinkingEl = addThinkingIndicator(agent);
    try {
        abortController = new AbortController();
        const endpoint = isWebMode ? '/api/agent-response-web' : '/api/agent-response';
        const response = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({ agent, otherAgent, topic: currentTopic, chatHistory: structuredHistory.slice(-6) })
        });
        removeThinkingIndicator(thinkingEl);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        if (isWebMode && data.searchedFor) addWebSearchNote(data.searchedFor);
        addAgentMessage(agent, data.response);
        structuredHistory.push({ speaker: agent.name, text: data.response });
    } catch (error) {
        removeThinkingIndicator(thinkingEl);
        if (error.name === 'AbortError') return;
        console.error('Error getting agent response:', error);
    } finally { abortController = null; }
}

// ── Chat DOM helpers ──────────────────────────────────────────────────────────
function addSystemMessage(text) {
    const d = document.createElement('div'); d.className = 'message system'; d.textContent = text;
    chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
}
function addWebSearchNote(query) {
    const d = document.createElement('div'); d.className = 'message web-search';
    d.textContent = `searched: "${query}"`; chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
}
function addAgentMessage(agent, text) {
    const d = document.createElement('div'); d.className = `message ${agent.slot}`;
    d.innerHTML = `<strong>${agent.name}:</strong> ${text}`; chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
}
function addUserMessage(text) {
    const d = document.createElement('div'); d.className = 'message user';
    d.innerHTML = `<strong>You:</strong> ${text}`; chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
}
function addThinkingIndicator(agent) {
    const d = document.createElement('div');
    d.className = `message thinking ${agent.slot === 'agent2' ? 'agent2-thinking' : ''}`;
    d.textContent = `${agent.name} is thinking…`; chatBox.appendChild(d); chatBox.scrollTop = chatBox.scrollHeight;
    return d;
}
function removeThinkingIndicator(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

// ══ Agentic Demo ══════════════════════════════════════════════════════════════

function val(v) { return typeof v === 'function' ? v() : v; }

const SCENARIOS = {
    news: {
        label: 'News Summary',
        steps: [
            { type: 'think', text: 'Task: compile today\'s top news headlines. I\'ll query multiple sources, score by recency and relevance, then synthesize a structured briefing.' },
            { type: 'tool_call', tool: 'web_search', args: '{ query: "top world news today", sources: ["Reuters", "BBC", "AP News"], limit: 20 }' },
            { type: 'tool_result', text: 'Returned 20 articles across 3 sources. Scoring by recency × engagement... top 5 selected.' },
            { type: 'tool_call', tool: 'fetch_article', args: '{ url: "reuters.com/world/europe/eu-digital-trade-deal-2026-06-07" }' },
            { type: 'tool_result', text: 'Fetched: 1,042 words. Key entities: EU, Geneva, digital trade agreement, AI governance.' },
            { type: 'tool_call', tool: 'fetch_article', args: '{ url: "bbc.com/news/technology/chipmaker-europe-expansion" }' },
            { type: 'tool_result', text: 'Fetched: 867 words. Key entities: semiconductor, fabrication plants, €18B investment, Germany, Poland.' },
            { type: 'tool_call', tool: 'fetch_article', args: '{ url: "apnews.com/science/climate/un-carbon-capture-summit" }' },
            { type: 'tool_result', text: 'Fetched: 734 words. Key entities: carbon capture, $200B, 40 nations, Geneva Climate Summit.' },
            { type: 'think', text: 'Three core stories fetched. Supplementing with health and markets updates...' },
            { type: 'tool_call', tool: 'fetch_article', args: '{ url: "nature.com/articles/alzheimers-trial-2026-06-07" }' },
            { type: 'tool_result', text: 'Fetched: 612 words. Key finding: 34% reduction in cognitive decline, 18-month trial, peer-reviewed.' },
            { type: 'tool_call', tool: 'fetch_article', args: '{ url: "ft.com/markets/daily-close-2026-06-07" }' },
            { type: 'tool_result', text: 'Fetched: 428 words. Indices: Nikkei +0.8%, Hang Seng −0.3%, FTSE flat. Rate decision next week.' },
            { type: 'tool_call', tool: 'summarize', args: '{ articles: 5, format: "section-bullets", max_words: 300, style: "professional" }' },
            { type: 'think', text: 'Synthesis complete. Formatting into the final structured briefing...' },
            { type: 'output', title: "Today's News Briefing  ·  June 7, 2026",
              content:
`WORLD  —  EU nations finalized a landmark digital trade agreement in Geneva, setting new standards for cross-border data flows and AI governance. The pact covers 27 countries and takes effect Q1 2027.

TECHNOLOGY  —  A major chipmaker announced three new fabrication plants in Germany and Poland, pledging €18B in investment and an estimated 14,000 jobs by 2029.

CLIMATE  —  A UN-backed carbon capture initiative secured $200B from 40 signatory nations at the Geneva Climate Summit — the largest climate commitment since the Paris Accord.

HEALTH  —  Early trials of a new Alzheimer's intervention show a 34% reduction in cognitive decline over 18 months, published today in Nature Medicine.

MARKETS  —  Global indices closed mixed. Nikkei +0.8%, Hang Seng −0.3%, FTSE flat. Investors await central bank rate decisions scheduled for next week.` }
        ]
    },

    lunch: {
        label: 'Lunch Near You',
        steps: [
            { type: 'think', text: 'Task: find the best lunch options within walking distance. Starting with location detection, then restaurant search, menus, and live wait times.' },
            { type: 'tool_call', tool: 'get_location', args: '{ method: "GPS + IP fallback", accuracy: "high" }' },
            { type: 'tool_result', text: 'Location resolved: Helsinki city centre, Finland (60.1699° N, 24.9384° E). Accuracy: ±40 m.' },
            { type: 'tool_call', tool: 'search_restaurants', args: '{ lat: 60.1699, lon: 24.9384, radius_km: 1.0, meal: "lunch", open_now: true, min_rating: 3.5 }' },
            { type: 'tool_result', text: 'Found 14 open restaurants within 1 km. Filtering by minimum rating... 10 qualify.' },
            { type: 'think', text: 'Good selection. Now fetching today\'s menus and live queue data for all 10 venues...' },
            { type: 'tool_call', tool: 'get_menus', args: '{ restaurant_ids: [10 venues], date: "2026-06-07", include_specials: true }' },
            { type: 'tool_result', text: 'Menus retrieved for 9 of 10 venues. 1 venue has no digital menu — excluded from ranking.' },
            { type: 'tool_call', tool: 'get_wait_times', args: '{ restaurant_ids: [9 venues], source: "live-queue-api" }' },
            { type: 'tool_result', text: 'Wait times retrieved. Breakdown: 4 venues under 10 min, 3 under 20 min, 2 over 25 min (deprioritized).' },
            { type: 'tool_call', tool: 'rank_options', args: '{ weights: { rating: 0.4, distance: 0.3, wait_time: 0.2, price: 0.1 } }' },
            { type: 'think', text: 'Ranking complete. Presenting the top 4 picks with full details...' },
            { type: 'output', title: 'Top Lunch Picks  ·  Near Helsinki City Centre',
              content:
`1  Ravintola Fazer          230 m  ·  Open until 15:00
   Salmon soup with sourdough bread           €14.50
   Rating 4.4  ·  Est. wait ~8 min

2  Story Kitchen              380 m  ·  Open until 14:30
   Pulled oat burger with sweet potato fries  €12.90
   Rating 4.2  ·  Est. wait ~12 min

3  Braveheart Grill           520 m  ·  Open until 15:30
   Grilled chicken bowl with quinoa & greens  €13.00
   Rating 4.5  ·  Est. wait ~5 min

4  Café Arkadia               680 m  ·  Open until 14:00
   Veggie wrap with hummus & roasted peppers  €10.50
   Rating 4.0  ·  Est. wait ~3 min` }
        ]
    },

    code: {
        label: 'Code Creator',
        steps: [
            { type: 'think', text: 'Task: build a custom program. I need to understand the requirements before writing any code — I\'ll ask three targeted questions.' },
            { type: 'user_input', key: 'language', question: 'What programming language would you like?', placeholder: 'e.g. Python, JavaScript, Go, Rust…' },
            { type: 'think', text: () => `Language confirmed: ${userAnswers.language}. Now I need to know the purpose of the program.` },
            { type: 'user_input', key: 'purpose',  question: 'What should the program do?', placeholder: 'e.g. sort files by date, scrape a website, manage a to-do list…' },
            { type: 'think', text: () => `Got it: "${userAnswers.purpose}". Planning the module structure for ${userAnswers.language}...` },
            { type: 'tool_call', tool: 'plan_structure', args: () => `{ language: "${userAnswers.language}", purpose: "${userAnswers.purpose}", style: "modular" }` },
            { type: 'tool_result', text: 'Structure planned: 3 modules, 6 functions, estimated 80–110 lines.' },
            { type: 'user_input', key: 'errorHandling', question: 'Should I include error handling and input validation?', options: ['Yes', 'No'] },
            { type: 'think', text: () => `Requirements locked. Generating ${userAnswers.language} code with${userAnswers.errorHandling === 'No' ? 'out' : ''} error handling...` },
            { type: 'tool_call', tool: 'generate_code', args: () => `{ language: "${userAnswers.language}", purpose: "${userAnswers.purpose}", error_handling: ${userAnswers.errorHandling !== 'No'}, lint: true }` },
            { type: 'tool_result', text: 'Code generated: 94 lines. Static analysis complete — 0 issues found.' },
            { type: 'output', title: () => `Generated Code  ·  ${userAnswers.language}`, isCode: true,
              content: () => buildCodeOutput(userAnswers.language, userAnswers.purpose, userAnswers.errorHandling !== 'No') }
        ]
    }
};

// step timing in ms: [delay before appearing, pause after appearing]
const TIMING = { think: [150, 500], tool_call: [100, 300], tool_result: [300, 200], user_input: [200, 0], output: [300, 0] };

function selectScenario(name) {
    if (demoRunning) return;
    currentScenario = name;
    scenarioBtns.forEach(b => b.classList.toggle('active', b.dataset.scenario === name));
}

async function runDemo() {
    if (demoRunning) return;
    demoRunning = true; demoAbort = false;
    runDemoBtn.disabled = true;
    Object.keys(userAnswers).forEach(k => delete userAnswers[k]);
    agentFeed.innerHTML = '';

    const steps = SCENARIOS[currentScenario].steps;
    try {
        for (const step of steps) {
            if (demoAbort) break;
            const [delay, pause] = TIMING[step.type] || [200, 300];
            await sleep(delay);
            if (demoAbort) break;

            if (step.type === 'user_input') {
                await renderUserInput(step);
            } else if (step.type === 'output') {
                renderOutput(step);
            } else {
                renderStep(step);
                if (pause > 0) await sleep(pause);
            }
        }
    } catch (err) {
        console.error('Demo error:', err);
        const errEl = document.createElement('div');
        errEl.className = 'feed-placeholder';
        errEl.style.color = '#dc3545';
        errEl.textContent = 'Demo error: ' + err.message;
        agentFeed.appendChild(errEl);
    }

    demoRunning = false;
    runDemoBtn.disabled = false;
}

function resetDemo() {
    demoAbort = true; demoRunning = false;
    runDemoBtn.disabled = false;
    agentFeed.innerHTML = '<div class="feed-placeholder">Select a scenario above and click Run Demo to begin.</div>';
    Object.keys(userAnswers).forEach(k => delete userAnswers[k]);
}

function renderStep(step) {
    const el = document.createElement('div');
    el.className = `feed-step ${step.type}`;

    const labels = { think: 'think', tool_call: 'call', tool_result: 'result' };
    const badge = document.createElement('span');
    badge.className = 'step-badge';
    badge.textContent = labels[step.type] || step.type;

    const body = document.createElement('span');
    body.className = 'step-body';

    if (step.type === 'tool_call') {
        body.innerHTML = `<span class="step-tool">${step.tool}</span><span class="step-args">(${val(step.args)})</span>`;
    } else {
        body.textContent = val(step.text);
    }

    el.appendChild(badge);
    el.appendChild(body);
    agentFeed.appendChild(el);
    agentFeed.scrollTop = agentFeed.scrollHeight;
}

function renderOutput(step) {
    const card = document.createElement('div');
    card.className = 'output-card';

    const header = document.createElement('div');
    header.className = 'output-header';
    header.textContent = `OUTPUT  ·  ${val(step.title)}`;

    const body = document.createElement('div');
    body.className = `output-body${step.isCode ? ' is-code' : ''}`;
    body.textContent = val(step.content);

    card.appendChild(header);
    card.appendChild(body);
    agentFeed.appendChild(card);
    agentFeed.scrollTop = agentFeed.scrollHeight;
}

function renderUserInput(step) {
    return new Promise(resolve => {
        const el = document.createElement('div');
        el.className = 'user-input-step';

        const q = document.createElement('div');
        q.className = 'user-input-question';
        q.textContent = `Agent needs input  —  ${step.question}`;
        el.appendChild(q);

        function submit(value) {
            userAnswers[step.key] = value || (step.placeholder ? 'Python' : 'Yes');
            el.innerHTML = '';
            const answered = document.createElement('div');
            answered.className = 'user-answered';
            answered.textContent = `You: "${userAnswers[step.key]}"`;
            el.appendChild(answered);
            resolve();
        }

        if (step.options) {
            const row = document.createElement('div');
            row.className = 'option-btns';
            step.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.textContent = opt;
                btn.addEventListener('click', () => submit(opt));
                row.appendChild(btn);
            });
            el.appendChild(row);
        } else {
            const row = document.createElement('div');
            row.className = 'user-input-row';
            const input = document.createElement('input');
            input.type = 'text'; input.placeholder = step.placeholder || '';
            const btn = document.createElement('button');
            btn.textContent = 'Continue';
            btn.addEventListener('click', () => { if (input.value.trim()) submit(input.value.trim()); });
            input.addEventListener('keypress', e => { if (e.key === 'Enter' && input.value.trim()) submit(input.value.trim()); });
            row.appendChild(input); row.appendChild(btn);
            el.appendChild(row);
            setTimeout(() => input.focus(), 50);
        }

        agentFeed.appendChild(el);
        agentFeed.scrollTop = agentFeed.scrollHeight;
    });
}

// ── Code generation templates ─────────────────────────────────────────────────
function buildCodeOutput(language, purpose, withErrors) {
    const lang = (language || 'python').toLowerCase();
    const date = new Date().toLocaleDateString('en-GB');
    const p = purpose || 'custom task';

    if (lang.includes('js') || lang.includes('javascript') || lang.includes('node')) {
        return `// Auto-generated by Agent  ·  ${date}
// Purpose: ${p}

'use strict';

class Processor {
  constructor(config = {}) {
    this.config = config;
    this.results = [];
  }

  async run(input) {${withErrors ? `
    if (!input?.length) throw new Error('No input provided');` : ''}
    for (const item of input) {
      this.results.push(await this.process(item));
    }
    return this.results;
  }

  async process(item) {
    // Core logic: ${p}
    return item;
  }
}

async function main() {${withErrors ? `
  try {
    const processor = new Processor();
    const data = await loadInput();
    const output = await processor.run(data);
    await saveOutput(output);
    console.log(\`Done — \${output.length} items processed.\`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }` : `
  const processor = new Processor();
  const data = await loadInput();
  const output = await processor.run(data);
  await saveOutput(output);
  console.log(\`Done — \${output.length} items processed.\`);`}
}

async function loadInput() { return []; }
async function saveOutput(data) {}

main();`;
    }

    if (lang.includes('go')) {
        return `// Auto-generated by Agent  ·  ${date}
// Purpose: ${p}

package main

import (
\t"fmt"${withErrors ? `\n\t"errors"\n\t"log"` : ''}
)

type Processor struct{ results []any }

func (p *Processor) Run(input []any) ([]any, ${withErrors ? 'error' : '_ error'}) {${withErrors ? `
\tif len(input) == 0 { return nil, errors.New("no input provided") }` : ''}
\tfor _, item := range input {
\t\tp.results = append(p.results, p.process(item))
\t}
\treturn p.results, nil
}

func (p *Processor) process(item any) any {
\t// Core logic: ${p}
\treturn item
}

func main() {
\tproc := &Processor{}
\tinput := loadInput()
\toutput, ${withErrors ? 'err' : '_'} := proc.Run(input)${withErrors ? `
\tif err != nil { log.Fatal(err) }` : ''}
\tfmt.Printf("Done — %d items processed.\\n", len(output))
}

func loadInput() []any { return nil }`;
    }

    // Default: Python
    return `# Auto-generated by Agent  ·  ${date}
# Purpose: ${p}

import sys

class Processor:
    def __init__(self):
        self.results = []

    def run(self, data: list) -> list:${withErrors ? `
        if not data:
            raise ValueError("No input provided")` : ''}
        for item in data:
            self.results.append(self.process(item))
        return self.results

    def process(self, item):
        # Core logic: ${p}
        return item

def load_input():
    return []

def save_output(data):
    pass

def main():${withErrors ? `
    try:
        processor = Processor()
        data = load_input()
        output = processor.run(data)
        save_output(output)
        print(f"Done — {len(output)} items processed.")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)` : `
    processor = Processor()
    data = load_input()
    output = processor.run(data)
    save_output(output)
    print(f"Done — {len(output)} items processed.")`}

if __name__ == "__main__":
    main()`;
}

document.addEventListener('DOMContentLoaded', init);

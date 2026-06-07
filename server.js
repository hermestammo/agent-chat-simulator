const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = 'http://localhost:11434';

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// Ollama model to use - switched to gemma4:e4b as requested
const MODEL = 'gemma4:e4b';

// Enhanced endpoint to get agent response from Ollama
app.post('/api/agent-response', async (req, res) => {
  try {
    const { agent, otherAgent, topic, chatHistory } = req.body;

    // Limit chat history to prevent context confusion
    const limitedHistory = limitChatHistory(chatHistory, 4); // Last 2 exchanges only

    // Create a very specific, structured prompt to prevent looping
    const prompt = `CONVERSATION RULES:
1. You are ${agent.name}, a ${agent.trait} agent
2. You are talking to ${otherAgent.name} (a ${otherAgent.trait} agent) about "${topic}"
3. Keep your response CONCISE (1-2 sentences max)
4. Stay IN CHARACTER as ${agent.name}
5. Respond DIRECTLY to what was just said
6. NO repeating phrases
7. NO mentioning games/worlds unless relevant to topic
8. BE CREATIVE but STAY ON TOPIC

RECENT EXCHANGE:
${limitedHistory}

YOUR TURN AS ${agent.name}:
Respond naturally as a ${agent.trait} person would. Be specific and engaging.`;

    // Call Ollama API with strict parameters
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.4,
        top_p: 0.8,
        repeat_penalty: 1.3,
        stop: ["\n\n", "Human:", "Agent:", "You:", `${agent.name}:`, `${otherAgent.name}:`, "Tammo:", "Dusk:"],
        num_predict: 300 // Increased max tokens to 300 as requested
      }
    });

    const rawResponse = response.data.response.trim();
    
    // Clean and validate response
    const agentResponse = cleanAndValidateResponse(rawResponse, agent.name, otherAgent.name, topic);
    
    // Final safety check
    if (!agentResponse || agentResponse.length < 3) {
      throw new Error('Response too short or empty after cleaning');
    }
    
    res.json({ response: agentResponse });
  } catch (error) {
    console.error('Error calling Ollama:', error.message);
    // Fallback to improved mock response
    // Need to extract agent, otherAgent, topic, chatHistory from req.body for fallback
    const { agent, otherAgent, topic, chatHistory } = req.body;
    const mockResponse = generateImprovedMockResponse(agent, otherAgent, topic, chatHistory);
    res.json({ response: mockResponse });
  }
});

// Limit chat history to last N exchanges (each exchange = 2 messages)
function limitChatHistory(history, maxExchanges = 4) {
  if (!history) return '';
  
  const lines = history.trim().split('\n').filter(line => line.trim().length > 0);
  // Keep only the last N*2 lines (each exchange is 2 lines)
  const keepLines = lines.slice(-maxExchanges * 2);
  return keepLines.join('\n');
}

// Clean and validate the response
function cleanAndValidateResponse(response, agentName, otherAgentName, topic) {
  if (!response) return '';
  
  let cleaned = response.trim();
  
  // Remove speaker labels if they appear at start
  cleaned = cleaned.replace(new RegExp(`^${agentName}[:\\s]+`, 'i'), '')
                  .replace(/^Agent \\d+[:\\s]+/i, '')
                  .replace(/^You[:\\s]+/i, '');
  
  // Remove surrounding quotes
  cleaned = cleaned.replace(/^["']+|["']+$/g, '');
  
  // Take only first sentence if multiple sentences
  const firstSentenceMatch = cleaned.match(/^[^.!?]*[.!?]/);
  if (firstSentenceMatch) {
    cleaned = firstSentenceMatch[0].trim();
  }
  
  // Remove any content after common stop indicators
  const stopWords = ['However,', 'But,', 'And,', 'So,', 'Then,', 'Next,', 'Also,', 'Furthermore:', 'Moreover,'];
  for (const stopWord of stopWords) {
    const index = cleaned.indexOf(stopWord);
    if (index > 10) { // Only if it's not at the very beginning
      cleaned = cleaned.substring(0, index).trim();
      // Add back appropriate punctuation
      if (!cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
        cleaned += '.';
      }
    }
  }
  
  // Limit length - adjusted for higher token count
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500).trim();
    // Try to end at word boundary
    const lastSpace = cleaned.lastIndexOf(' ');
    if (lastSpace > 100) {
      cleaned = cleaned.substring(0, lastSpace) + '.';
    }
  }
  
  // Final cleanup
  cleaned = cleaned.trim();
  
  // Ensure it ends with punctuation
  if (cleaned && !cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
    cleaned += '.';
  }
  
  return cleaned;
}

// Generate improved mock response as fallback
function generateImprovedMockResponse(agent, otherAgent, topic, history) {
  // Extract last meaningful statement from history to respond to
  const lastStatement = extractLastStatement(history);
  
  const traitResponses = {
    'caveman': [
      `Ugga! ${topic} like hunt mammoth - need strong arms and smart mind!`,
      `Me ${agent.name} think ${topic} much work, like carry heavy stones!`,
      `Ugga-Ugga! ${topic} make me tired, but tribe need food!`,
      `Me not understand fancy words, but ${topic} important for survival!`
    ],
    'gamer': [
      `Dude, ${topic} is like grinding XP in an RPG - gotta put in the time to level up!`,
      `Think of ${topic} as the final boss raid - strategy and teamwork are key!`,
      `${topic}? More like a hardcore difficulty setting - but the loot is worth it!`,
      `If ${topic} was a game, I'd be playing on nightmare mode for the achievements!`
    ],
    'curious': [
      `That's fascinating about ${topic}! What made you interested in this area?`,
      `I've been wondering about ${topic} - how did it evolve to be this way?`,
      `When it comes to ${topic}, I'm particularly curious about the human impact.`,
      `Let me ask you this: what aspect of ${topic} do you find most surprising?`
    ],
    'analytical': [
      `Looking at ${topic} objectively, the key factors appear to be...`,
      `Based on available data, ${topic} shows patterns of...`,
      `If we break down ${topic} into components, we see...`,
      `From an analytical standpoint, ${topic} requires consideration of...`
    ],
    'skeptical': [
      `I'm not entirely convinced about ${topic}. What evidence supports this view?`,
      `While ${topic} has merits, I'd want to see more data on long-term effects.`,
      `My skepticism about ${topic} comes from considering alternative perspectives.`,
      `Before accepting claims about ${topic}, I'd need to see peer-reviewed research.`
    ],
    'optimistic': [
      `I'm really excited about the potential of ${topic}! The future looks bright.`,
      `Despite challenges, I believe ${topic} will lead to positive developments.`,
      `The opportunities in ${topic} are tremendous if we approach it creatively!`,
      `What gives me hope about ${topic} is seeing how people are innovating in this space.`
    ],
    'pragmatic': [
      `Practically speaking, implementing ideas about ${topic} would require...`,
      `When it comes to ${topic}, we need to focus on actionable steps.`,
      `The realistic approach to ${topic} involves starting with...`,
      `From a practical standpoint, ${topic} means we should prioritize...`
    ]
  };
  
  const responses = traitResponses[agent.trait.toLowerCase()] || traitResponses.curious;
  let response = responses[Math.floor(Math.random() * responses.length)];
  
  // If we have a last statement, try to incorporate it
  if (lastStatement && lastStatement.length > 10 && Math.random() > 0.3) {
    response = `Regarding what you said about ${lastStatement.substring(0, 30)}..., ${response.toLowerCase()}`;
  }
  
  return response;
}

// Extract last meaningful statement from chat history
function extractLastStatement(history) {
  if (!history) return '';
  
  const lines = history.trim().split('\n').filter(line => line.trim().length > 10);
  if (lines.length === 0) return '';
  
  // Get the last line that looks like actual content (not just labels)
  const lastLine = lines[lines.length - 1];
  // Extract content after colon if present
  const colonIndex = lastLine.indexOf(':');
  if (colonIndex !== -1 && colonIndex < lastLine.length - 2) {
    return lastLine.substring(colonIndex + 1).trim();
  }
  return lastLine.trim();
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
/**
 * Safely renders content to an element, using innerHTML for markup
 * and textContent for plain text to prevent potential XSS issues.
 * @param {HTMLElement} element - The DOM element to render into.
 * @param {string} content - The string, which may be plain text or HTML.
 */
function renderContent(element, content) {
  try {
    console.log(`renderContent: raw content: ${content}`);
    const rawHtml = marked.parse(content); // Marked parses Markdown -> HTML
    console.log(`renderContent: output of marked: ${rawHtml}`);
    const safeHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } }); // sanitize
    console.log(`renderContent: output of DOMPurify: ${safeHtml}`);
    element.innerHTML = safeHtml;
  } catch (error) {
    console.log(`renderContent: error: ${error}`);
    element.textContent = content;
  }
}

const MODEL_ID = 'mistral-nemo'; // 'qwen3:14b';
const OLLAMA_API = 'http://localhost:11434/api/generate';

// A more sophisticated prompt for better summaries
const SUMMARY_PROMPT_TEMPLATE = `You are an expert summarizer. Your task is to analyze a chunk of text from a webpage and extract only the most critical information.
Ignore navigational elements like menus, ads, headers, footers, and sidebars.
Ignore small thumbnail sections at the bottom.
If the given text contains such low information content, ignore it.
Focus on the main content.

Here is the text chunk:
---
{{CHUNK}}
---

Your summary of this chunk:`;

// A safe character limit per chunk. 10,000 chars is roughly 2,500 tokens.
const MAX_CHUNK_LENGTH = 10000;

// --- Helper Functions for Text Processing and API Calls ---

/**
 * Splits a long string of text into smaller chunks.
 * @param {string} text - The full text to be chunked.
 * @returns {string[]} - An array of text chunks.
 */
function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK_LENGTH) {
    chunks.push(text.substring(i, i + MAX_CHUNK_LENGTH));
  }
  return chunks;
}

/**
 * Calls the Ollama API with a given prompt.
 * @param {string} prompt - The prompt to send to the model.
 * @returns {Promise<string>} - The AI's response text.
 */
async function callOllama(prompt) {
  try {
    const response = await fetch(OLLAMA_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_ID,
        prompt: prompt,
        stream: false,
      }),
    });
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("Error calling Ollama API:", error);
    return "Error: Could not connect to the AI model.";
  }
}

/**
 * Generates a full summary by processing text chunk-by-chunk.
 * @param {string} fullText - The entire text of the webpage.
 * @returns {Promise<string>} - The final, combined summary.
 */
async function generateFullSummary(fullText) {
  const chunks = chunkText(fullText);
  const chunkSummaries = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Summarizing chunk ${i + 1} of ${chunks.length}...`);
    const prompt = SUMMARY_PROMPT_TEMPLATE.replace('{{CHUNK}}', chunks[i]);
    const summary = await callOllama(prompt);
    if (summary) {
      chunkSummaries.push(summary);
    }
  }

  // If we have multiple summaries, we ask the AI to combine them into a final report.
  if (chunkSummaries.length > 1) {
    console.log("Combining chunk summaries into a final report...");
    const combinePrompt = `The following are several summaries from different parts of the same document.
    Combine them into a single, cohesive, and well-structured summary. Remove any redundancies.
    Summarize the key facts, findings, and conclusions as a series of concise bullet points and markdown text.

    ---
    ${chunkSummaries.join('\n\n---\n\n')}
    ---

    Final cohesive summary:`;
    return await callOllama(combinePrompt);
  }

  // If there was only one chunk, just return its summary.
  return chunkSummaries[0] || "Could not generate a summary.";
}

// --- Main execution starts when the side panel is fully loaded ---
document.addEventListener('DOMContentLoaded', async () => {
  // Get all necessary DOM elements
  const summaryEl = document.getElementById('summary');
  const chatBox = document.getElementById('chat-box');
  const form = document.getElementById('chat-form');
  const promptField = document.getElementById('prompt');
  const summaryLoader = document.getElementById('summary-loader');
  const chatLoader = document.getElementById('chat-loader');

  // --- UI State Helper Functions ---
  const setSummaryLoading = (isLoading) => {
    summaryLoader.style.display = isLoading ? 'block' : 'none';
    summaryEl.style.display = isLoading ? 'none' : 'block';
  };
  const setChatLoading = (isLoading) => { chatLoader.style.display = isLoading ? 'block' : 'none'; };
  const setChatDisabled = (isDisabled) => {
    promptField.disabled = isDisabled;
    form.querySelector('button').disabled = isDisabled;
    promptField.placeholder = isDisabled ? "Please wait..." : "Ask anything…";
  };

  // 1. Initial Setup
  setChatDisabled(true);
  setSummaryLoading(true);

  // 2. Get Page Content
  let pageText = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['libs/Readability.js'] // vendored from mozilla/readability
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    const response = await chrome.tabs.sendMessage(tab.id, { action: "get_page_text" });
    if (!response || !response.text) throw new Error("Could not retrieve page content.");
    pageText = response.text;
  } catch (error) {
    summaryEl.innerText = error.message;
    setSummaryLoading(false);
    return;
  }
  
  console.log(`pageText length: ${pageText.length}`);
  console.log(`Full pageText: ${pageText}`);

  // 3. Generate and Display the Full Summary
  const fullSummary = await generateFullSummary(pageText);
  renderContent(summaryEl, fullSummary);
  setSummaryLoading(false);
  setChatDisabled(false);
  promptField.focus();

  // 4. Set up the Chat Form Listener
  form.onsubmit = async (e) => {
    e.preventDefault();
    const userPrompt = promptField.value.trim();
    if (!userPrompt) return;

    // Add user message to chatbox
    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'chat-message user-message';
    userMessageDiv.textContent = userPrompt;
    chatBox.appendChild(userMessageDiv);
    promptField.value = ''; // Clear the input field
    setChatDisabled(true);
    setChatLoading(true);

    // Generate AI response using the summary as primary context
    const chatPrompt = `You are a helpful assistant. Answer the user's question based on the provided summary of a webpage.
    If the summary does not contain the answer, you may refer to the full text content as a fallback.

    --- SUMMARY CONTEXT ---
    ${fullSummary}
    -----------------------

    --- FULL TEXT (FALLBACK ONLY) ---
    ${pageText.slice(0, 15000)}
    ---------------------------------

    User Question: "${userPrompt}"

    Your Answer:`;
    
    const aiResponse = await callOllama(chatPrompt);

    // Add AI message to chatbox
    const aiMessageDiv = document.createElement('div');
    aiMessageDiv.className = 'chat-message ai-message';
    renderContent(aiMessageDiv, aiResponse || "I'm not sure how to respond to that.");
    chatBox.appendChild(aiMessageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Add AI response to UI and re-enable chat
    setChatLoading(false);
    setChatDisabled(false);
    promptField.focus();
  };
});

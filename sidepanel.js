/**
 * Safely renders content to an element by converting Markdown to HTML
 * and sanitizing it before insertion.
 */
function renderContent(element, content) {
  try {
    console.log(`renderContent: raw content: ${content}`);
    const rawHtml = marked.parse(content); // Markdown -> HTML
    console.log(`renderContent: output of marked: ${rawHtml}`);
    const safeHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
    console.log(`renderContent: output of DOMPurify: ${safeHtml}`);
    element.innerHTML = safeHtml;
  } catch (error) {
    console.log(`renderContent: error: ${error}`);
    element.textContent = content;
  }
}

/* =========================
   Ollama configuration
   ========================= */
const OLLAMA_BASE = 'http://localhost:11434';
const OLLAMA_API_GENERATE = `${OLLAMA_BASE}/api/generate`; // generate endpoint
// Default model; will be overridden by saved preference or user dropdown selection.
let CURRENT_MODEL_ID = 'mistral-nemo';

/* =========================
   Summary prompting
   ========================= */
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

/* =========================
   Helpers
   ========================= */
/**
 * Splits a long string of text into smaller chunks.
 * @param {string} text
 * @returns {string[]}
 */
function chunkText(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK_LENGTH) {
    chunks.push(text.substring(i, i + MAX_CHUNK_LENGTH));
  }
  return chunks;
}

/**
 * Calls the Ollama generate API with a given prompt using CURRENT_MODEL_ID.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function callOllama(prompt) {
  try {
    const response = await fetch(OLLAMA_API_GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CURRENT_MODEL_ID,
        prompt,
        stream: false,
      }),
    });
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error('Error calling Ollama API:', error);
    return 'Error: Could not connect to the AI model.';
  }
}

/**
 * Generates a full summary by processing text chunk-by-chunk.
 * @param {string} fullText
 * @returns {Promise<string>}
 */
async function generateFullSummary(fullText) {
  const chunks = chunkText(fullText);
  const chunkSummaries = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Summarizing chunk ${i + 1} of ${chunks.length}...`);
    const prompt = SUMMARY_PROMPT_TEMPLATE.replace('{{CHUNK}}', chunks[i]);
    const summary = await callOllama(prompt);
    if (summary) chunkSummaries.push(summary);
  }

  if (chunkSummaries.length > 1) {
    console.log('Combining chunk summaries into a final report...');
    const combinePrompt = `You are a summarization bot. Only provide the summary and nothing else. Do not provide any conversational text, explanations, or prefaces.
    The following are several summaries from different parts of the same document.
    1. Combine them into a single, cohesive, and well-structured summary.
    2. Remove any redundancies.
    3. Summarize the key facts, findings, and conclusions as a series of concise list items (where appropritate) in markdown format.
    4. Only output the direct summary, nothing else. Do not include explanations, meta commentary, or repeat my instructions.

    ---
    ${chunkSummaries.join('\n\n---\n\n')}
    ---

    Final cohesive summary:`;
    return await callOllama(combinePrompt);
  }

  return chunkSummaries[0] || 'Could not generate a summary.';
}

/* =========================
   Model listing & persistence
   ========================= */
/**
 * Fetches local models from Ollama and returns an array of { name }.
 * Tries /api/tags first (documented) and falls back to /api/list if needed.
 * @returns {Promise<string[]>} array of model names
 */
async function fetchLocalModels() {
  // Primary documented endpoint: GET /api/tags -> { models: [{ name, ... }, ...] }
  // See Ollama API reference[web:540] and guides[web:245].
  const endpoints = [`${OLLAMA_BASE}/api/tags`, `${OLLAMA_BASE}/api/list`];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) continue;
      const data = await res.json();
      // Normalize to array of names
      if (Array.isArray(data?.models)) {
        // Each entry can have name or model field depending on version; prefer name.
        const names = data.models
          .map(m => m?.name || m?.model)
          .filter(Boolean);
        if (names.length) return names;
      }
    } catch (e) {
      console.warn(`Model list fetch failed for ${url}:`, e);
    }
  }
  return [];
}

/**
 * Loads saved model selection from chrome.storage.local.
 * @returns {Promise<string | null>}
 */
function loadSavedModel() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['selectedModel'], (result) => {
        resolve(result?.selectedModel || null);
      });
    } catch (e) {
      console.warn('chrome.storage.local.get failed:', e);
      resolve(null);
    }
  });
}

/**
 * Saves model selection to chrome.storage.local.
 * @param {string} model
 * @returns {Promise<void>}
 */
function saveSelectedModel(model) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ selectedModel: model }, () => resolve());
    } catch (e) {
      console.warn('chrome.storage.local.set failed:', e);
      resolve();
    }
  });
}

/**
 * Populates the #model-select dropdown and wires change handling.
 * Sets CURRENT_MODEL_ID and persists the selection.
 * @param {HTMLSelectElement} selectEl
 * @returns {Promise<void>}
 */
async function initModelPicker(selectEl) {
  // Load any saved selection first so it can be pre-selected if available.
  const saved = await loadSavedModel(); // uses chrome.storage.local[web:592]
  if (saved) {
    CURRENT_MODEL_ID = saved;
  }

  // Fetch local models from Ollama and populate.
  const models = await fetchLocalModels(); // via /api/tags[web:540]
  selectEl.innerHTML = '';

  if (!models.length) {
    const opt = document.createElement('option');
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = 'No models found';
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }

  // Create options
  for (const name of models.sort((a, b) => a.localeCompare(b))) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    selectEl.appendChild(opt);
  }

  // Determine initial selection: saved one if present, else default or first available.
  if (saved && models.includes(saved)) {
    selectEl.value = saved;
    CURRENT_MODEL_ID = saved;
  } else if (models.includes(CURRENT_MODEL_ID)) {
    selectEl.value = CURRENT_MODEL_ID;
  } else {
    selectEl.value = models[0];
    CURRENT_MODEL_ID = models[0];
  }

  // Persist current selection so page refresh or reboot keeps the choice.
  await saveSelectedModel(CURRENT_MODEL_ID); // persists preference[web:592]

  // Listen to changes
  selectEl.addEventListener('change', async (e) => {
    const picked = e.target.value;
    CURRENT_MODEL_ID = picked;
    await saveSelectedModel(picked); // persist selection[web:592]
    console.log(`Model switched to: ${picked}`);
  });
}

/* =========================
   Main
   ========================= */
document.addEventListener('DOMContentLoaded', async () => {
  // Get all necessary DOM elements
  const summaryEl = document.getElementById('summary');
  const chatBox = document.getElementById('chat-box');
  const form = document.getElementById('chat-form');
  const promptField = document.getElementById('prompt');
  const summaryLoader = document.getElementById('summary-loader');
  const chatLoader = document.getElementById('chat-loader');
  const modelSelect = document.getElementById('model-select');

  // --- UI State Helper Functions ---
  const setSummaryLoading = (isLoading) => {
    summaryLoader.style.display = isLoading ? 'block' : 'none';
    summaryEl.style.display = isLoading ? 'none' : 'block';
  };
  const setChatLoading = (isLoading) => { chatLoader.style.display = isLoading ? 'block' : 'none'; };
  const setChatDisabled = (isDisabled) => {
    promptField.disabled = isDisabled;
    form.querySelector('button').disabled = isDisabled;
    promptField.placeholder = isDisabled ? 'Please wait...' : 'Ask anything…';
  };

  // Init model picker early so generate calls use the selected model.
  if (modelSelect) {
    try {
      await initModelPicker(modelSelect); // fills dropdown and sets CURRENT_MODEL_ID[web:540][web:592]
    } catch (e) {
      console.warn('Model picker init failed:', e);
    }
  }

  // 1. Initial Setup
  setChatDisabled(true);
  setSummaryLoading(true);

  // 2. Get Page Content
  let pageText = '';
  let responseJson = {};
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

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'get_page_text' });
    if (!response || !response.text) throw new Error('Could not retrieve page content.');
    pageText = response.text;
    responseJson = response;
    console.log(`get_page_text response: ${JSON.stringify(responseJson)}`);
  } catch (error) {
    summaryEl.innerText = error.message;
    setSummaryLoading(false);
    return;
  }

  console.log(`pageText length: ${pageText.length}`);

  // 3. Generate and Display the Full Summary
  const fullSummary = await generateFullSummary(pageText);
  // Remove all <think>...</think> blocks and their contents (non-greedy)
  const cleanedSummary = fullSummary.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  console.log(`cleanedSummary: ${cleanedSummary}`);
  renderContent(summaryEl, cleanedSummary);

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
    If the summary does not contain the answer, you may refer to the full content JSON as a fallback.

    --- SUMMARY CONTEXT ---
    ${fullSummary}
    -----------------------

    --- FULL TEXT (FALLBACK ONLY) ---
    ${JSON.stringify(responseJson)}
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

    // Re-enable chat
    setChatLoading(false);
    setChatDisabled(false);
    promptField.focus();
  };

  // 5. Listen for model changes from other tabs
  chrome.storage.onChanged.addListener((changes, namespace) => {
    // We only care about changes in local storage for our 'selectedModel' key.
    if (namespace === 'local' && changes.selectedModel) {
      const newModel = changes.selectedModel.newValue;
      // If the new model is different from the current one, update the UI.
      if (newModel && newModel !== CURRENT_MODEL_ID) {
        console.log(`Model changed in another tab to: ${newModel}. Updating this panel.`);
        if (modelSelect) {
          modelSelect.value = newModel;
        }
        CURRENT_MODEL_ID = newModel;
      }
    }
  });

  // 6. Listen for reload commands from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'reload_side_panel') {
      // sender.tab.id is the ID of the tab this side panel instance is associated with.
      // We only reload if the message's target tabId matches this side panel's tabId.
      if (sender.tab && sender.tab.id === request.tabId) {
        console.log(`Reloading side panel for tab ${request.tabId} (this panel's tab)...`);
        window.location.reload();
      } else {
        console.log(`Ignoring reload for tab ${request.tabId}. This panel is for tab ${sender.tab?.id}.`);
      }
    }
  });
});

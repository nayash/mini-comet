/*model_id = 'mistral-nemo';
ollama_api = 'http://localhost:11434/api/generate';

document.addEventListener('DOMContentLoaded', async () => {
  console.log("Side panel loaded. Initiating text extraction.");

  const summaryLoader = document.getElementById('summary-loader');
  const chatLoader = document.getElementById('chat-loader');

  // Get the current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab) {
    // 1. Programmatically inject the content script into the active tab
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // 2. Send a message to the now-injected content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: "get_page_text" });

    if (response && response.text) {
      console.log("Side panel received text. Calling Ollama...");
      const pageText = response.text;

      // --- Existing Ollama and Chat Logic ---
      const summaryEl = document.getElementById('summary');
      const chatBox = document.getElementById('chat-box');
      const form = document.getElementById('chat-form');
      const promptField = document.getElementById('prompt');

      // Call Ollama for summary
      const summaryResp = await fetch(ollama_api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model_id,
          prompt: `Summarize the following page in a few sentences:\n${pageText.slice(0, 8000)}`,
          stream: false,
        }),
      });
      const data = await summaryResp.json();
      summaryEl.innerText = data.response || "Error: Could not generate summary.";

      // Set up chat form listener
      form.onsubmit = async (e) => {
        e.preventDefault();
        let userPrompt = promptField.value;
        if (!userPrompt || !pageText) return;

        chatBox.innerHTML += `<div><strong>User:</strong> ${userPrompt}</div>`;
        promptField.value = "";

        let contextPrompt = `Context:\n${pageText.slice(0,7000)}\n\nQuestion: ${userPrompt}`;
        const reply = await fetch(ollama_api, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: model_id,
              prompt: contextPrompt,
              stream: false,
            })
        }).then(res => res.json());

        chatBox.innerHTML += `<div><strong>AI:</strong> ${reply.response}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      };

    } else {
      console.error("Did not receive a valid response from content script.");
      document.getElementById('summary').innerText = "Could not access page content.";
    }
  }
});

*/


const MODEL_ID = 'mistral-nemo';
const OLLAMA_API = 'http://localhost:11434/api/generate';

// --- Main execution starts when the side panel is fully loaded ---
document.addEventListener('DOMContentLoaded', async () => {
  // Get all necessary DOM elements
  const summaryEl = document.getElementById('summary');
  const chatBox = document.getElementById('chat-box');
  const form = document.getElementById('chat-form');
  const promptField = document.getElementById('prompt');
  const summaryLoader = document.getElementById('summary-loader');
  const chatLoader = document.getElementById('chat-loader');

  // A global variable to hold the page content
  let pageText = "";

  // --- Helper Functions for UI State ---

  function setSummaryLoading(isLoading) {
    summaryLoader.style.display = isLoading ? 'block' : 'none';
    summaryEl.style.display = isLoading ? 'none' : 'block';
  }

  function setChatLoading(isLoading) {
    chatLoader.style.display = isLoading ? 'block' : 'none';
  }

  function setChatDisabled(isDisabled) {
    promptField.disabled = isDisabled;
    form.querySelector('button').disabled = isDisabled;
    promptField.placeholder = isDisabled ? "Please wait..." : "Ask anything…";
  }

  // --- Helper Function for API Calls ---

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

  // --- Main Logic ---

  // 1. Initial Setup: Disable chat and show summary loader
  setChatDisabled(true);
  setSummaryLoading(true);

  // 2. Get Page Content
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    const response = await chrome.tabs.sendMessage(tab.id, { action: "get_page_text" });
    if (!response || !response.text) throw new Error("Could not retrieve page content.");
    pageText = response.text;
  } catch (error) {
    console.error(error.message);
    summaryEl.innerText = error.message;
    setSummaryLoading(false);
    return; // Stop execution if we can't get page text
  }

  console.log(`pageText length: ${pageText.length}`)
  // 3. Generate and Display the Initial Summary
  const summaryPrompt = `Summarize the following text within 1000 words.
  Keep all the important points/facts from the page. DO NOT hallucinate.
  Give summary as bullet points in well formated plain text:\n${pageText.slice(0, 10000)}`;
  // TODO later handle large texts too.
  const summaryText = await callOllama(summaryPrompt);
  summaryEl.innerText = summaryText || "The AI could not generate a summary.";
  
  // 4. Finalize Setup: Hide summary loader and enable chat
  setSummaryLoading(false);
  setChatDisabled(false);
  promptField.focus(); // Set focus to the input field

  // 5. Set up the Chat Form Listener
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

    // Disable chat and show loader
    setChatDisabled(true);
    setChatLoading(true);

    // Generate AI response
    // TODO later handle large texts too.
    const chatPrompt = `Context:\n${pageText.slice(0, 10000)}\n\nQuestion: ${userPrompt}`;
    const aiResponse = await callOllama(chatPrompt);

    // Add AI message to chatbox
    const aiMessageDiv = document.createElement('div');
    aiMessageDiv.className = 'chat-message ai-message';
    aiMessageDiv.textContent = aiResponse || "I'm not sure how to respond to that.";
    chatBox.appendChild(aiMessageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;

    // Re-enable chat and hide loader
    setChatLoading(false);
    setChatDisabled(false);
    promptField.focus();
  };
});

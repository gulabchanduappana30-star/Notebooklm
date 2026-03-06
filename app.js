// App State
const state = {
    notebooks: [
        { id: '1', title: 'My Research Notes', sources: [], createdAt: new Date() }
    ],
    activeNotebookId: '1',
    chatHistory: [],
    isGenerating: false
};

// DOM Elements
const elements = {
    sourceCount: document.getElementById('source-count'),
    sourcesList: document.getElementById('sources-list'),
    chatHistory: document.getElementById('chat-history'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    chatSuggestions: document.getElementById('chat-suggestions'),
    addSourceBtn: document.getElementById('add-source-btn'),
    addSourceModal: document.getElementById('add-source-modal'),
    closeSourceModal: document.getElementById('close-source-modal'),
    fileInput: document.getElementById('file-input'),
    uploadZone: document.getElementById('upload-zone'),
    generateModal: document.getElementById('generate-modal'),
    closeGenerateModal: document.getElementById('close-generate-modal'),
    generateTitle: document.getElementById('generate-title'),
    generateContent: document.getElementById('generate-content'),
    generateItems: document.querySelectorAll('.generate-item'),
    shareBtn: document.getElementById('share-btn'),
    audioGenerateBtn: document.getElementById('audio-generate-btn')
};

// API Base URL - adjust if needed
const API_BASE = 'http://localhost:3000/api';

// Initialize
function init() {
    setupEventListeners();
    renderState();
}

function getActiveNotebook() {
    return state.notebooks.find(n => n.id === state.activeNotebookId);
}

// Event Listeners
function setupEventListeners() {
    // Chat input
    elements.chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        elements.sendBtn.disabled = this.value.trim() === '';
    });

    elements.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendChat();
        }
    });

    elements.sendBtn.addEventListener('click', handleSendChat);

    // Modals
    elements.addSourceBtn.addEventListener('click', () => {
        elements.addSourceModal.classList.add('active');
    });

    elements.closeSourceModal.addEventListener('click', () => {
        elements.addSourceModal.classList.remove('active');
    });

    elements.closeGenerateModal.addEventListener('click', () => {
        elements.generateModal.classList.remove('active');
    });

    // File Upload
    elements.fileInput.addEventListener('change', handleFileSelected);

    // Drag & Drop
    const dropZone = elements.uploadZone;
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => dropZone.classList.remove('dragover'));
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            elements.fileInput.files = e.dataTransfer.files;
            handleFileSelected();
        }
    });

    // Generate Buttons
    if (elements.generateItems) {
        elements.generateItems.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode) handleGenerate(mode);
            });
        });
    }

    // Audio Overview Button
    if (elements.audioGenerateBtn) {
        elements.audioGenerateBtn.addEventListener('click', handleAudioOverview);
    }

    // Share Button
    if (elements.shareBtn) {
        elements.shareBtn.addEventListener('click', async () => {
            const shareData = {
                title: 'NoteVista AI',
                text: 'Check out my AI-generated study notes and audio overview!',
                url: window.location.href,
            };
            try {
                if (navigator.share) {
                    await navigator.share(shareData);
                } else {
                    await navigator.clipboard.writeText(shareData.url);
                    alert('App link copied to clipboard!');
                }
            } catch (err) {
                console.error('Share failed:', err);
            }
        });
    }

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            elements.chatInput.value = chip.textContent.replace(/[^\w\s]/gi, '').trim();
            elements.chatInput.style.height = 'auto';
            elements.sendBtn.disabled = false;
            handleSendChat();
        });
    });
}

// Actions
async function handleFileSelected() {
    const files = elements.fileInput.files;
    if (!files.length) return;

    elements.addSourceModal.classList.remove('active');

    // Show loading state somewhere if desired

    for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);

        try {
            const response = await fetch(`${API_BASE}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Upload failed');

            const data = await response.json();
            const notebook = getActiveNotebook();
            notebook.sources.push(data);

            // clear empty state
            if (notebook.sources.length === 1 && state.chatHistory.length === 0) {
                showInitialChatGreeting();
            }

            renderState();
        } catch (error) {
            console.error('Error uploading file:', error);
            alert(`Failed to upload ${files[i].name}: ${error.message}`);
        }
    }

    elements.fileInput.value = ''; // reset
}

function showInitialChatGreeting() {
    elements.chatHistory.innerHTML = '';
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message system';
    msgDiv.innerHTML = `
        Hello! I'm your NoteVista AI assistant for <strong>My Research Notes</strong>. Add sources on the left, then ask me anything about them.
        <br><br>
        <span class="tip">✦ Try asking me to summarize, explain, or create a study guide!</span>
    `;
    elements.chatHistory.appendChild(msgDiv);
    elements.chatSuggestions.style.display = 'flex';
    elements.chatInput.disabled = false;
    elements.sendBtn.disabled = true; // wait for input
}

async function handleSendChat() {
    const message = elements.chatInput.value.trim();
    if (!message || elements.sendBtn.disabled) return;

    const notebook = getActiveNotebook();
    if (notebook.sources.length === 0) {
        alert("Please add at least one source first.");
        return;
    }

    // Add user message
    appendMessage('user', message);
    elements.chatInput.value = '';
    elements.chatInput.style.height = 'auto';
    elements.sendBtn.disabled = true;
    elements.chatSuggestions.style.display = 'none';

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    appendTypingIndicator(typingId);

    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                history: state.chatHistory,
                sources: notebook.sources
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Chat request failed. Is the server running?');
        }

        // Remove typing indicator
        document.getElementById(typingId)?.remove();

        // Add model message
        appendMessage('model', data.response);

        // Update history
        state.chatHistory.push({ role: 'user', content: message });
        state.chatHistory.push({ role: 'model', content: data.response });

        // Show suggestions again as "continue chat" options
        showNewSuggestions();

    } catch (error) {
        console.error('Chat error:', error);
        document.getElementById(typingId)?.remove();
        appendMessage('system', `⚠️ Error: ${error.message} <br><br><b>Troubleshooting:</b><br>1. Verify your <code>GEMINI_API_KEY</code> in the <code>.env</code> file.<br>2. Check <a href="/api/health" target="_blank" style="color:#58a6ff">API Health Status</a> to see if your key is working.`);
    } finally {
        elements.sendBtn.disabled = false;
        elements.chatInput.disabled = false;
        elements.chatInput.focus();
    }
}

function showNewSuggestions() {
    const suggestions = [
        "Summarize the key takeaways",
        "What are the main arguments?",
        "Extract a timeline of events",
        "Create 5 quiz questions",
        "Explain this to a 5-year old",
        "What are the pros and cons?"
    ];
    // Pick 3 random
    const shuffled = suggestions.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    elements.chatSuggestions.innerHTML = selected.map(s => `<button class="suggestion-chip">${s}</button>`).join('');
    elements.chatSuggestions.style.display = 'flex';

    // Re-attach listeners
    elements.chatSuggestions.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            elements.chatInput.value = chip.textContent;
            handleSendChat();
        });
    });
}

async function handleGenerate(mode) {
    const notebook = getActiveNotebook();
    if (notebook.sources.length === 0) {
        alert("Please add at least one source before generating a " + mode);
        return;
    }

    elements.generateTitle.textContent = mode;
    elements.generateContent.innerHTML = '<div class="typing-indicator" style="margin: 40px auto;"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    elements.generateModal.classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: mode,
                sources: notebook.sources
            })
        });

        if (!response.ok) throw new Error('Generate request failed');

        const data = await response.json();

        // Render Markdown safely
        const dirtyHtml = marked.parse(data.response);
        const cleanHtml = DOMPurify.sanitize(dirtyHtml);
        elements.generateContent.innerHTML = cleanHtml;

    } catch (error) {
        console.error('Generate error:', error);
        elements.generateContent.innerHTML = `<p style="color: var(--danger-color)">Error generating content: ${error.message}. Please check your API key and connection.</p>`;
    }
}

async function handleAudioOverview() {
    const notebook = getActiveNotebook();
    if (notebook.sources.length === 0) {
        alert("Please add at least one source before generating an Audio Overview.");
        return;
    }

    elements.generateTitle.textContent = "Audio Overview";
    elements.generateContent.innerHTML = '<div class="typing-indicator" style="margin: 40px auto;"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div><p style="text-align: center; color: var(--text-secondary); margin-top: 16px;">Generating script and synthesizing audio (this takes ~10-20 seconds)...</p>';
    elements.generateModal.classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/audio-overview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sources: notebook.sources
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Audio Generate request failed');
        }

        const data = await response.json();

        // Render audio player and script
        let contentHtml = `
            <div style="margin-bottom: 24px; text-align: center;">
                <audio controls autoplay style="width: 100%; max-width: 400px;">
                    <source src="data:audio/mp3;base64,${data.audio_base64}" type="audio/mp3">
                    Your browser does not support the audio element.
                </audio>
            </div>
            <hr style="border: none; border-top: 1px solid var(--panel-border); margin: 24px 0;">
            <div class="markdown-body">
                <h3>Audio Script</h3>
                <p><em>${data.script.replace(/\n/g, '<br>')}</em></p>
            </div>
        `;

        elements.generateContent.innerHTML = contentHtml;

    } catch (error) {
        console.error('Audio Generate error:', error);
        elements.generateContent.innerHTML = `<p style="color: var(--danger-color)">Error generating audio: ${error.message}.</p>`;
    }
}

// Rendering
function appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    if (role === 'model') {
        const dirtyHtml = marked.parse(content);
        msgDiv.innerHTML = `<div class="markdown-body">${DOMPurify.sanitize(dirtyHtml)}</div>`;
    } else {
        msgDiv.textContent = content;
    }

    elements.chatHistory.appendChild(msgDiv);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
}

function appendTypingIndicator(id) {
    const div = document.createElement('div');
    div.id = id;
    div.className = 'typing-indicator';
    div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
    elements.chatHistory.appendChild(div);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
}

function renderState() {
    const notebook = getActiveNotebook();

    // Update Sources Count
    elements.sourceCount.textContent = notebook.sources.length;

    // Render Sources List
    elements.sourcesList.innerHTML = notebook.sources.map(source => `
        <div class="source-item" title="${source.title}">
            <div class="source-icon">📄</div>
            <div class="source-name">${source.title}</div>
        </div>
    `).join('');

    // Enable/disable inputs based on sources
    if (notebook.sources.length > 0 && state.chatHistory.length > 0) {
        elements.chatInput.disabled = false;
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);

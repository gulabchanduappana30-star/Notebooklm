# NoteVista AI ✦ (NotebookLM Clone)

NoteVista AI is a full-stack, AI-powered document research assistant, built to provide an experience similar to Google's **NotebookLM**.

[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue?logo=github)](https://github.com/gulabchanduappana30-star/Notebooklm)

## ✨ Features

- **3-Panel Workspace**: Manage sources (left), chat with AI (center), and generate deep-dive content (right).
- **RAG-Powered Chat**: All AI responses are strictly grounded in your provided documents for accuracy.
- **Dynamic File Processing**: Natively supports **PDF**, **DOCX**, and **TXT** files.
- **Studio Mode**: Generate 9 unique content types:
  - 📄 Study Guides
  - 🧠 Mind Maps (via Mermaid.js)
  - 💼 Briefing Docs
  - 📇 Flashcards
  - ❓ Quizzes
  - 📊 Reports
  - 📽️ Slide Decks
  - ⏱️ Timelines
  - 📖 Glossaries
- **Audio Overviews**: Generate an engaging 1-minute audio conversation summarizing your sources.
- **Glassmorphic UI**: Premium dark-themed aesthetic using the Outfit font family.

## 🛠️ Technology Stack

- **Backend**: Python 3.11+, Flask, Google Generative AI (Gemini), gTTS (Text-to-Speech)
- **Frontend**: Vanilla JS, CSS3, HTML5, Marked.js, DOMPurify

## 🚀 Getting Started

### 1. Prerequisites
- Python installed
- A Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 2. Setup
Clone the repository and install dependencies:
```bash
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in the root directory and add your API key:
```env
GEMINI_API_KEY=your_actual_key_here
PORT=3000
```

### 4. Run the App
Start the Flask server:
```bash
python server.py
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

## 📜 License
MIT License.

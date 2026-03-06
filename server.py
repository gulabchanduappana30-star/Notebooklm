import os
import io
import uuid
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
import PyPDF2
import docx

load_dotenv(override=True)

app = Flask(__name__, static_folder='.', static_url_path='')
# Enable CORS for frontend running on same host or differently
CORS(app)

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY", "").strip()
if api_key:
    genai.configure(api_key=api_key)

# The model to use
DEFAULT_MODEL = "gemini-1.5-flash"

def get_best_model():
    """Try to find the best working model for this key."""
    candidates = [DEFAULT_MODEL, "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro", "models/gemini-1.5-flash"]
    try:
        # Check cached or preferred model first
        for name in candidates:
             try:
                 model = genai.GenerativeModel(name)
                 # Try a tiny generation to see if it 404s
                 model.generate_content("ping", generation_config={"max_output_tokens": 1})
                 return name
             except Exception as e:
                 if "404" not in str(e):
                      # If it's a 400 (Invalid Key) or 429 quota, keep that name to report the real error
                      return name
                 continue
        # Fallback to listing models if candidates fail
        for m in genai.list_models():
             if 'generateContent' in m.supported_generation_methods:
                  return m.name
    except:
        pass
    return DEFAULT_MODEL

MODEL_NAME = get_best_model()

def generate_with_fallback(prompt, system_instruction=None):
    """Reliably generate content using primary model with automatic fallback."""
    model_to_use = MODEL_NAME
    try:
        model = genai.GenerativeModel(
            model_name=model_to_use,
            system_instruction=system_instruction
        )
        return model.generate_content(prompt)
    except Exception as e:
        if "404" in str(e):
            fallback = "gemini-pro" if "flash" in model_to_use else "gemini-1.5-flash"
            print(f"Fallback to {fallback} after 404 on {model_to_use}")
            model = genai.GenerativeModel(
                model_name=fallback,
                system_instruction=system_instruction
            )
            return model.generate_content(prompt)
        raise e

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

def extract_text_from_pdf(file_stream):
    try:
        reader = PyPDF2.PdfReader(file_stream)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return ""

def extract_text_from_docx(file_stream):
    try:
        doc = docx.Document(file_stream)
        return "\n".join([para.text for para in doc.paragraphs])
    except Exception as e:
        print(f"Error reading DOCX: {e}")
        return ""

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    filename = file.filename
    ext = filename.split('.')[-1].lower()
    text = ""

    try:
        if ext == 'pdf':
            text = extract_text_from_pdf(io.BytesIO(file.read()))
        elif ext == 'docx':
            text = extract_text_from_docx(io.BytesIO(file.read()))
        elif ext == 'txt' or ext == 'md':
            text = file.read().decode('utf-8')
        else:
            return jsonify({"error": "Unsupported file type"}), 400
            
        if not text.strip():
            return jsonify({"error": "Could not extract text or file is empty"}), 400

        source_id = str(uuid.uuid4())
        return jsonify({
            "id": source_id,
            "title": filename,
            "text": text,
            "type": ext
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    message = data.get('message', '')
    history = data.get('history', [])
    sources = data.get('sources', [])
    
    if not message:
        return jsonify({"error": "Message is required"}), 400
    
    # Reload env vars inside the route to catch live updates to .env
    load_dotenv(override=True)
    current_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    if not current_key or current_key == "AIzaSyBH8FYLF2JqmmevqjlSFWXBgNhaTojrJq8" or current_key == "your_api_key_here":
        return jsonify({"error": "You are using a placeholder API Key. <br><br><b>Please go to <a href='https://aistudio.google.com/app/apikey' target='_blank' style='color:#58a6ff'>Google AI Studio</a>, generate a real API key, and paste it into your <code>C:\\Users\\chand\\NOTEBOOKLM\\.env</code> file!</b>"}), 400

    try:
        genai.configure(api_key=current_key)
        # Prompt construction
        context_text = "\n\n---\n\n".join([f"Source: {s['title']}\n{s['text']}" for s in sources])
        
        system_instruction = f"""You are NoteVista AI, an intelligent assistant. 
Your primary goal is to help the user understand and interact with their provided sources.
Always ground your responses in the provided sources. If the answer is not in the sources, say so.
Be helpful, clear, and use markdown formatting where appropriate.

AVAILABLE SOURCES:
{context_text}"""

        model_to_use = MODEL_NAME
        model = genai.GenerativeModel(
            model_name=model_to_use,
            system_instruction=system_instruction
        )
            
        # Convert history
        gemini_history = []
        for msg in history:
            role = "user" if msg['role'] == "user" else "model"
            gemini_history.append({"role": role, "parts": [msg['content']]})
            
        chat = model.start_chat(history=gemini_history)
        
        try:
            response = chat.send_message(message)
        except Exception as e:
            if "404" in str(e):
                fallback = "gemini-pro" if "flash" in model_to_use else "gemini-1.5-flash"
                print(f"Chat Fallback to {fallback}")
                model = genai.GenerativeModel(model_name=fallback, system_instruction=system_instruction)
                chat = model.start_chat(history=gemini_history)
                response = chat.send_message(message)
            else:
                raise e
        
        return jsonify({
            "response": response.text
        })
            
    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/generate', methods=['POST'])
def generate():
    data = request.json
    mode = data.get('mode', '')
    sources = data.get('sources', [])
    
    if not mode or not sources:
        return jsonify({"error": "Mode and sources are required"}), 400
        
    # Reload env vars to catch live updates to .env
    load_dotenv(override=True)
    current_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    if not current_key or current_key == "AIzaSyBH8FYLF2JqmmevqjlSFWXBgNhaTojrJq8" or current_key == "your_api_key_here":
        return jsonify({"error": "You are using a placeholder API Key. <br><br><b>Please go to <a href='https://aistudio.google.com/app/apikey' target='_blank' style='color:#58a6ff'>Google AI Studio</a>, generate a real API key, and paste it into your <code>C:\\Users\\chand\\NOTEBOOKLM\\.env</code> file!</b>"}), 400

    genai.configure(api_key=current_key)
    context_text = "\n\n---\n\n".join([f"Source: {s['title']}\n{s['text']}" for s in sources])
    
    prompts = {
        "Study Guide": "Create a comprehensive study guide based on the provided sources. Include key concepts, summaries of major topics, and review questions. Format cleanly in Markdown.",
        "Briefing Doc": "Create an executive briefing document based on the sources. Provide a high-level summary, key takeaways, and critical insights. Keep it concise and professional.",
        "Mind Map": "Create a Mermaid.js mind map visualizing the key concepts and their relationships from the sources. ONLY output valid Mermaid.js syntax inside a ```mermaid\n block.",
        "Flashcards": "Create a set of 10-15 flashcards based on the sources for active recall. Format them as Q&A pairs (e.g., **Q:** ... \n **A:** ...).",
        "Quiz": "Generate a 5-question multiple-choice quiz based on the sources to test knowledge. Provide the answer key at the very end.",
        "Report": "Write an in-depth, structured thematic report synthesizing the information in the sources. Include introduction, main body paragraphs with clear headings, and a conclusion.",
        "Slide Deck": "Create an outline for a presentation slide deck based on the sources. For each slide, provide a Title and 3-5 concise bullet points.",
        "Glossary": "Extract crucial terms, jargon, and concepts from the sources and provide a glossary with clear definitions.",
        "Timeline": "Extract important events from the sources and present them in a chronological timeline format."
    }

    mode_prompt = prompts.get(mode, f"Generate a {mode} based on the sources.")
    
    try:
        prompt = f"""You are a helpful study assistant. 
Based ON THE FOLLOWING SOURCES, complete the task requested.

TASK:
{mode_prompt}

SOURCES:
{context_text}"""

        response = generate_with_fallback(prompt)
        
        return jsonify({
            "response": response.text
        })
        
    except Exception as e:
        print(f"Generate error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/audio-overview', methods=['POST'])
def audio_overview():
    data = request.json
    sources = data.get('sources', [])
    
    if not sources:
        return jsonify({"error": "Sources are required"}), 400
        
    load_dotenv(override=True)
    current_key = os.getenv("GEMINI_API_KEY", "").strip()
    
    if not current_key or current_key == "AIzaSyBH8FYLF2JqmmevqjlSFWXBgNhaTojrJq8" or current_key == "your_api_key_here":
         return jsonify({"error": "You are using a placeholder API Key. <br><br><b>Please go to <a href='https://aistudio.google.com/app/apikey' target='_blank' style='color:#58a6ff'>Google AI Studio</a>, generate a real API key, and paste it into your <code>C:\\Users\\chand\\NOTEBOOKLM\\.env</code> file!</b>"}), 400

    try:
        genai.configure(api_key=current_key)
        context_text = "\n\n---\n\n".join([f"Source: {s['title']}\n{s['text']}" for s in sources])
        
        prompt = f"""You are an enthusiastic AI host creating an engaging 1-minute audio overview of the following sources. 
Create a script for yourself to read. Do NOT include sound effects or speaker labels, just the raw text you will speak. Make it sound conversational, welcoming, and summarize the key insights.

SOURCES:
{context_text}"""
        
        response = generate_with_fallback(prompt)
        script_text = response.text
        
        from gtts import gTTS
        tts = gTTS(text=script_text, lang='en', slow=False)
        
        import base64
        fp = io.BytesIO()
        tts.write_to_fp(fp)
        fp.seek(0)
        audio_base64 = base64.b64encode(fp.read()).decode('utf-8')
        
        return jsonify({
            "audio_base64": audio_base64,
            "script": script_text
        })
        
    except Exception as e:
        print(f"Audio overview error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/health')
def health_check():
    load_dotenv(override=True)
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return jsonify({"status": "error", "message": "No API key found in .env"}), 400
    
    try:
        genai.configure(api_key=key)
        models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        return jsonify({
            "status": "ok",
            "available_models": models,
            "current_model": MODEL_NAME
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 3000))
    print(f"Starting server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)


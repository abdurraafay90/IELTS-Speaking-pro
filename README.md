# IELTS Speaking Practice Pro

## Why this exists?
Finding a reliable website that can accurately score your IELTS speaking performance is challenging. Many existing tools are either paid, inaccurate, or only focus on pronunciation. This application was created to provide a free, high-quality alternative that uses advanced AI models to evaluate your speech based on official IELTS criteria: Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, and Task Relevance.

## Features
- **Real-time Recording:** Record your speech directly in the browser.
- **AI Transcription:** Uses OpenAI's `gpt-4o-mini-transcribe` for highly accurate speech-to-text.
- **Criteria-based Scoring:** Get a detailed band score (out of 9.0) based on official IELTS standards.
- **Detailed Feedback:** Understand your strengths and specific areas for improvement.
- **Part 1, 2, & 3 Support:** Practice for all sections of the IELTS Speaking test.

## Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- [Python 3.8+](https://www.python.org/downloads/)
- [OpenAI API Key](https://platform.openai.com/api-keys)

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/your-username/ielts-speaking-pro.git
cd ielts-speaking-pro
```

### 2. Setup Backend
Navigate to the `backend` folder:
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the `backend` folder and add your OpenAI API key:
```env
OPENAI_API_KEY=your_actual_api_key_here
```

### 3. Setup Frontend
Navigate to the `frontend` folder:
```bash
cd ../frontend
npm install
```

## Running the Application

### Option 1: Automatic Run (Windows Only)
From the root directory, run:
```bash
run_app.bat
```

### Option 2: Manual Start
1. **Start the Backend:**
   ```bash
   cd backend
   # Activate venv if not already
   venv\Scripts\activate  # Windows
   python main.py
   ```
   *The backend will run on http://localhost:8000*

2. **Start the Frontend:**
   In a new terminal window:
   ```bash
   cd frontend
   npm start
   ```
   *The application will open automatically on http://localhost:3000*

## How to Practice
1. Select the IELTS Part (Part 1, 2, or 3).
2. Paste the question or cue card you want to answer.
3. Click "Start Recording" and speak.
4. Click "Stop Recording" once you've finished.
5. Wait for the AI to transcribe and evaluate your response.
6. Review your Band Score and suggestions for improvement!

---
*Created for IELTS aspirants to provide accessible and reliable feedback on their speaking journey.*

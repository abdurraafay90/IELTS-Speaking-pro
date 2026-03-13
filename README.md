# IELTS Master Pro

## Why this exists?
Finding a reliable platform that can accurately score your IELTS performance is challenging. Many existing tools are either paid, inaccurate, or only focus on pronunciation. This application was created to provide a free, high-quality alternative that uses advanced AI models to evaluate both your **Speaking** and **Writing** performance based on official IELTS criteria.

## Features
- **🎙️ IELTS Speaking:**
  - **Real-time Recording:** Record your speech directly in the browser.
  - **AI Transcription:** Uses OpenAI's `gpt-4o-mini-transcribe` for highly accurate speech-to-text.
  - **Criteria-based Scoring:** Detailed band score (out of 9.0) for Fluency, Lexical Resource, and Grammar.
  - **Listen Back:** Audio playback feature to review your own recordings.
- **✍️ IELTS Writing:**
  - **Essay Evaluation:** Submit Task 2 essays for instant AI feedback.
  - **Task-specific Scoring:** Evaluates Task Response, Cohesion, Lexical Resource, and Grammatical Accuracy.
  - **Word Count Tracking:** Real-time word count monitoring for your essays.
- **🛠️ Integrated API Configuration:**
  - **Sidebar Settings:** Configure your OpenAI API key directly within the app's sidebar.
  - **Persistent Settings:** Your API key is securely saved to the `.env` file for future sessions.
- **🌓 Modern UI:**
  - **Collapsible Sidebar:** Toggle the sidebar to maximize your workspace.
  - **Glassmorphism Design:** A beautiful, modern interface with smooth animations and dark mode support.
  - **Export Results:** Download your speaking transcripts and writing evaluations as text reports.

## Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- [Python 3.8+](https://www.python.org/downloads/)
- [OpenAI API Key](https://platform.openai.com/api-keys)

## Installation

### 1. Clone the repository
```bash
git clone https://github.com/your-username/ielts-master-pro.git
cd ielts-master-pro
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
1. **Configure API:** Open the sidebar, enter your OpenAI API key, and click "Save".
2. **Speaking:** Select a Part (1, 2, or 3), record your response, and get a detailed band score.
3. **Writing:** Enter the essay prompt, type your response, and submit for a comprehensive evaluation.
4. **Improve:** Review the "Areas for Improvement" and "Suggested Answer" sections to refine your skills.

---
*Created for IELTS aspirants to provide accessible and reliable feedback on their journey to success.*

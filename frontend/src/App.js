import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('speaking'); // 'speaking' or 'writing'
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // API Config States
  const [apiKey, setApiKey] = useState('');
  const [apiStatus, setApiStatus] = useState({ type: '', message: '' });
  const [isConfiguring, setIsConfiguring] = useState(false);

  // Speaking States
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Ready to record');
  const [transcript, setTranscript] = useState('Transcript will appear here...');
  const [evaluation, setEvaluation] = useState('Evaluation will appear here...');
  const [recorderInfo, setRecorderInfo] = useState('');
  const [timer, setTimer] = useState(0);
  const [duration, setDuration] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [ieltsPart, setIeltsPart] = useState('Part 1');
  const [question, setQuestion] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(`You are an expert, strict, and constructive English Language Speaking Examiner for international standardized proficiency tests. Your goal is to evaluate a candidate's transcribed spoken response to a specific question.

You will be provided with:
The "Part Number" of the test, the "Question" asked, and the "Candidate's Transcript".

Evaluation Criteria:
Evaluate based on Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, and Task Relevance.

Required Output Format:
### **Overall Band Score: [x.x]**

### **1. Strengths:**
- [Bullet points]

### **2. Areas for Improvement:**
- [Bullet points]

### **3. Detailed Breakdown:**
- **Fluency & Coherence:** [Score]/9.0 - [Feedback]
- **Lexical Resource:** [Score]/9.0 - [Feedback]
- **Grammatical Range & Accuracy:** [Score]/9.0 - [Feedback]

### **4. Suggested Answer / Better Phrasing:**
> [Rewritten sentences or phrasing]`);

  // Writing States
  const [writingTask, setWritingTask] = useState('Task 2');
  const [writingQuestion, setWritingQuestion] = useState('');
  const [writingEssay, setWritingEssay] = useState('');
  const [writingEvaluation, setWritingEvaluation] = useState('Evaluation will appear here...');
  const [writingStatus, setWritingStatus] = useState('Ready to submit');
  const [writingSystemPrompt, setWritingSystemPrompt] = useState(`# IELTS Task 2 Writing Evaluator - System Prompt

You are an expert, strict, and constructive English writing examiner for IELTS Task 2 essays. Use the official IELTS band descriptors.

Required Output Format:
### **Overall Band Score: [x.x]**

**Word Count:** [n] words ([Pass/Fail] min 250)

### **1. Strengths:**
- [Bullet points]

### **2. Areas for Improvement:**
- [Bullet points]

### **3. Detailed Breakdown:**
- **Task Response:** [x.x]/9.0 - [Feedback]
- **Coherence & Cohesion:** [x.x]/9.0 - [Feedback]
- **Lexical Resource:** [x.x]/9.0 - [Feedback]
- **Grammatical Range & Accuracy:** [x.x]/9.0 - [Feedback]

### **4. Suggested Rewrite (Polishing a Paragraph):**
> [High-level rewritten paragraph]

---
**Data Summary (JSON):**
\`\`\`json
{
  "overall": x.x,
  "task_response": x.x,
  "cohesion": x.x,
  "lexical": x.x,
  "grammar": x.x,
  "word_count": n
}
\`\`\``);

  const timerIntervalRef = useRef(null);
  const timerRef = useRef(0);
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioBlobRef = useRef(null);

  const startRecording = async () => {
    if (!question.trim()) {
      alert('Please enter or paste the IELTS question first.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      setTimer(0);
      timerRef.current = 0;
      setDuration(null);
      setAudioUrl(null);
      timerIntervalRef.current = setInterval(() => {
        timerRef.current += 1;
        setTimer(timerRef.current);
      }, 1000);

      mediaRecorderRef.current.ondataavailable = event => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        audioBlobRef.current = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        clearInterval(timerIntervalRef.current);
        setDuration(timerRef.current);
        
        const url = URL.createObjectURL(audioBlobRef.current);
        setAudioUrl(url);

        setStatus('Processing transcription and evaluation...');
        const result = await sendAudioForProcessing(audioBlobRef.current);
        setTranscript(result.transcript);
        setEvaluation(result.evaluation);
        setStatus('Processing complete!');

        const sizeInMB = (audioBlobRef.current.size / (1024 * 1024)).toFixed(2);
        setRecorderInfo(`Recorded: ${new Date().toLocaleString()}, Size: ${sizeInMB}MB`);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setStatus('Recording...');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setStatus('Error: Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  const sendAudioForProcessing = async (blob) => {
    const formData = new FormData();
    formData.append('audio_file', blob, 'recording.webm');
    formData.append('question', question);
    formData.append('ielts_part', ieltsPart);
    formData.append('system_prompt', systemPrompt);

    try {
      const response = await fetch('http://localhost:8000/transcribe-and-score', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Processing error:', error);
      return {
        transcript: `Error: ${error.message}`,
        evaluation: `Error: ${error.message}`
      };
    }
  };

  const handleWritingSubmit = async () => {
    if (!writingQuestion.trim()) {
      alert('Please enter the writing question first.');
      return;
    }
    if (!writingEssay.trim()) {
      alert('Please write your essay first.');
      return;
    }

    setWritingStatus('Evaluating your writing...');
    
    const formData = new FormData();
    formData.append('essay', writingEssay);
    formData.append('question', writingQuestion);
    formData.append('task_type', writingTask);
    formData.append('system_prompt', writingSystemPrompt);

    try {
      const response = await fetch('http://localhost:8000/evaluate-writing', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      const data = await response.json();
      setWritingEvaluation(data.evaluation);
      setWritingStatus('Evaluation complete!');
    } catch (error) {
      console.error('Writing evaluation error:', error);
      setWritingEvaluation(`Error: ${error.message}`);
      setWritingStatus('Error occurred during evaluation.');
    }
  };

  const saveTranscript = () => {
    const content = `QUESTION: ${question}\n\nTRANSCRIPT:\n${transcript}\n\nEVALUATION:\n${evaluation}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts_speaking_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveWritingReport = () => {
    const content = `TASK: ${writingTask}\nQUESTION: ${writingQuestion}\n\nESSAY:\n${writingEssay}\n\nEVALUATION:\n${writingEvaluation}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts_writing_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const handleConfigApi = async () => {
    if (!apiKey.trim()) {
      alert('Please enter an OpenAI API Key.');
      return;
    }

    setIsConfiguring(true);
    setApiStatus({ type: 'info', message: 'Configuring API...' });

    const formData = new FormData();
    formData.append('api_key', apiKey);

    try {
      const response = await fetch('http://localhost:8000/config-api', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to configure API');
      }

      const data = await response.json();
      setApiStatus({ type: 'success', message: data.message });
      setApiKey(''); // Clear the input for security
    } catch (error) {
      console.error('API Config error:', error);
      setApiStatus({ type: 'error', message: error.message });
    } finally {
      setIsConfiguring(false);
    }
  };

  const renderSpeaking = () => (
    <div className="main-content">
      <div className="setup-container">
        <div className="input-group">
          <label>Select IELTS Part:</label>
          <select value={ieltsPart} onChange={(e) => setIeltsPart(e.target.value)}>
            <option value="Part 1">Part 1: Introduction & Interview</option>
            <option value="Part 2">Part 2: Individual Long Turn (Cue Card)</option>
            <option value="Part 3">Part 3: Two-Way Discussion</option>
          </select>
        </div>

        <div className="input-group">
          <div className="label-row">
            <label>Question / Cue Card:</label>
            <div className="action-links">
              <button className="clear-link" onClick={() => copyToClipboard(question)}>Copy Question</button>
              <button className="clear-link" onClick={() => setQuestion('')}>Clear Text</button>
            </div>
          </div>
          <textarea 
            placeholder="Paste the IELTS question or cue card here..." 
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows="4"
          />
        </div>
      </div>

      <div className="recorder-container">
        <div className={`timer-display ${isRecording ? 'active' : ''}`}>
          {isRecording ? formatTime(timer) : (duration ? `Duration: ${formatTime(duration)}` : '0:00')}
        </div>
        <button
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>

        {audioUrl && !isRecording && (
          <div className="audio-playback-container">
            <label>Listen back to your recording:</label>
            <audio src={audioUrl} controls className="audio-player" />
          </div>
        )}

        <div className="status">{status}</div>
        <div className="recorder-info">{recorderInfo}</div>
      </div>

      <div className="results-container">
        <div className="transcript-box">
          <h3>Transcript:</h3>
          <div className="display-area">{transcript}</div>
        </div>
        
        <div className="evaluation-box">
          <h3>Examiner Evaluation & Feedback:</h3>
          <div className="display-area evaluation-text">
            <ReactMarkdown>{evaluation}</ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="actions-bar">
        <button className="action-button save-btn" onClick={saveTranscript}>
          Download Full Report
        </button>
        <button className="action-button copy-btn" onClick={() => copyToClipboard(transcript)}>
          Copy Transcript
        </button>
      </div>
    </div>
  );

  const renderWriting = () => (
    <div className="writing-container">
      <div className="setup-container">
        <div className="input-group">
          <label>IELTS Writing Task:</label>
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            padding: '12px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            color: 'var(--primary)',
            fontWeight: '600'
          }}>
            Task 2: Academic / General Essay
          </div>
        </div>

        <div className="input-group">
          <div className="label-row">
            <label>Writing Question / Topic:</label>
            <div className="action-links">
              <button className="clear-link" onClick={() => copyToClipboard(writingQuestion)}>Copy Question</button>
              <button className="clear-link" onClick={() => setWritingQuestion('')}>Clear Text</button>
            </div>
          </div>
          <textarea 
            placeholder="Paste the IELTS writing prompt here..." 
            value={writingQuestion}
            onChange={(e) => setWritingQuestion(e.target.value)}
            rows="3"
          />
        </div>

        <div className="input-group">
          <div className="label-row">
            <label>Your Response:</label>
            <div className="action-links">
              <span className="word-count" style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>
                Words: {writingEssay.trim() ? writingEssay.trim().split(/\s+/).length : 0}
              </span>
              <button className="clear-link" onClick={() => setWritingEssay('')}>Clear Essay</button>
            </div>
          </div>
          <textarea 
            placeholder="Type your essay here..." 
            value={writingEssay}
            onChange={(e) => setWritingEssay(e.target.value)}
            rows="12"
          />
        </div>
      </div>

      <button 
        className="writing-submit-btn" 
        onClick={handleWritingSubmit}
        disabled={writingStatus.includes('Evaluating')}
      >
        {writingStatus.includes('Evaluating') ? 'Evaluating...' : 'Submit for Evaluation'}
      </button>

      <div className="status" style={{textAlign: 'center'}}>{writingStatus}</div>

      <div className="results-container">
        <div className="evaluation-box" style={{gridColumn: 'span 2'}}>
          <h3>Examiner Evaluation & Feedback:</h3>
          <div className="display-area evaluation-text">
            <ReactMarkdown>{writingEvaluation}</ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="actions-bar">
        <button className="action-button save-btn" onClick={saveWritingReport}>
          Download Writing Report
        </button>
        <button className="action-button copy-btn" onClick={() => copyToClipboard(writingEssay)}>
          Copy Essay
        </button>
      </div>
    </div>
  );

  return (
    <div className={`app-wrapper ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
      <button 
        className="sidebar-toggle" 
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
      >
        {isSidebarOpen ? '✕' : '☰'}
      </button>

      <aside className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
        <div className="sidebar-logo">IELTS Master</div>
        <nav className="sidebar-nav">
          <div 
            className={`nav-item ${activeTab === 'speaking' ? 'active' : ''}`}
            onClick={() => setActiveTab('speaking')}
          >
            <span className="nav-icon">🎙️</span>
            <span>Speaking</span>
          </div>
          <div 
            className={`nav-item ${activeTab === 'writing' ? 'active' : ''}`}
            onClick={() => setActiveTab('writing')}
          >
            <span className="nav-icon">✍️</span>
            <span>Writing</span>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="api-config-container">
            <h4>OpenAI API Settings</h4>
            <div className="api-input-group">
              <input 
                type="password" 
                placeholder="sk-..." 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button 
                onClick={handleConfigApi}
                disabled={isConfiguring}
              >
                {isConfiguring ? '...' : 'Save'}
              </button>
            </div>
            {apiStatus.message && (
              <div className={`api-status-msg ${apiStatus.type}`}>
                {apiStatus.message}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="App">
        <header className="app-header">
          <h1>{activeTab === 'speaking' ? 'IELTS Speaking' : 'IELTS Writing'} Pro</h1>
          <p>{activeTab === 'speaking' ? 'Record, Transcribe, and Get AI Band Scores' : 'Write, Submit, and Get AI Band Scores'}</p>
        </header>

        {activeTab === 'speaking' ? renderSpeaking() : renderWriting()}
      </main>
    </div>
  );
}

export default App;

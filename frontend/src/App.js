import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Ready to record');
  const [transcript, setTranscript] = useState('Transcript will appear here...');
  const [evaluation, setEvaluation] = useState('Evaluation will appear here...');
  const [recorderInfo, setRecorderInfo] = useState('');
  const [timer, setTimer] = useState(0);
  const [duration, setDuration] = useState(null);
  const [ieltsPart, setIeltsPart] = useState('Part 1');
  const timerIntervalRef = useRef(null);
  const timerRef = useRef(0);
  
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const [question, setQuestion] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(`You are an expert, strict, and constructive English Language Speaking Examiner for international standardized proficiency tests. Your goal is to evaluate a candidate's transcribed spoken response to a specific question.

You will be provided with:

The "Part Number" of the test (which indicates the expected depth and length of the response).

The "Question" asked.

The "Candidate's Transcript" (speech-to-text output of their answer).

Evaluation Criteria:
Evaluate the response based on the following four pillars:

Fluency & Coherence: Does the answer flow logically? Are there excessive repetitions, self-corrections, or transcribed hesitation markers (e.g., "um," "uh")? Are linking words used naturally?

Lexical Resource (Vocabulary): Does the candidate use a wide range of vocabulary accurately? Is there evidence of idiomatic language, uncommon words, or strong collocations?

Grammatical Range & Accuracy: Does the candidate use a mix of simple and complex sentence structures? Are the tenses appropriate for the question?

Task Relevance (Based on Part Number):

Part 1 (Introduction): Expect short, direct, and natural answers.

Part 2 (Monologue): Expect a well-structured, sustained answer covering all points of the prompt.

Part 3 (Discussion): Expect abstract reasoning, justifications, and deep analysis.

Constraints:
Acknowledge that you are reading a transcript. You cannot evaluate pronunciation, intonation, or accent, but you MUST evaluate fluency based on transcribed pauses, filler words, and sentence flow.

Be objective and professional. Do not overly praise the candidate; focus on actionable improvement.

Account for Speech-to-Text (STT) Errors: If a word or phrase is nonsensical but phonetically sounds like a logical English word in context (e.g., transcribed as "head turn" instead of "return", or "a plenty" instead of "plenty of"), assume it is an STT software error. Point out the likely intended word in your feedback, but evaluate the candidate's Lexical and Grammatical score based on what they likely intended to say. Do not severely penalize their band score for an obvious microphone or transcription glitch.

Required Output Format:
Always format your response exactly as follows:

### **Overall Band Score: [Provide an overall band score out of 9.0]**

### **1. Strengths:**
- [Bullet point 1-2 things the candidate did well]

### **2. Areas for Improvement:**
- [Bullet point 1-2 specific weaknesses in grammar, vocabulary, or flow]

### **3. Detailed Breakdown:**
- **Fluency & Coherence:** [Score]/9.0 - [Feedback]
- **Lexical Resource:** [Score]/9.0 - [Feedback]
- **Grammatical Range & Accuracy:** [Score]/9.0 - [Feedback]

### **4. Suggested Answer / Better Phrasing:**
- [Rewrite 1-2 of the candidate's sentences to sound more natural, advanced, or grammatically correct.]`);
  
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

      // Reset and start timer
      setTimer(0);
      timerRef.current = 0;
      setDuration(null);
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

        // Stop timer and set duration
        clearInterval(timerIntervalRef.current);
        setDuration(timerRef.current);

        setStatus('Processing transcription and evaluation...');
        const result = await sendAudioForProcessing(audioBlobRef.current);
        setTranscript(result.transcript);
        setEvaluation(result.evaluation);
        setStatus('Processing complete!');

        // Show file info
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

  const saveTranscript = () => {
    const content = `QUESTION: ${question}\n\nTRANSCRIPT:\n${transcript}\n\nEVALUATION:\n${evaluation}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ielts_practice_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript);
    alert('Transcript copied to clipboard!');
  };

  const copyQuestion = () => {
    if (!question.trim()) {
      alert('Question is empty!');
      return;
    }
    navigator.clipboard.writeText(question);
    alert('Question copied to clipboard!');
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>IELTS Speaking Practice Pro</h1>
        <p>Record, Transcribe, and Get AI Band Scores</p>
      </header>

      <main className="main-content">
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
                <button className="clear-link" onClick={copyQuestion}>Copy Question</button>
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
          <button className="action-button copy-btn" onClick={copyToClipboard}>
            Copy Transcript
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
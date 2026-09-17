import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getRandomQuestion } from './questionBank';
import { CAMBRIDGE_TESTS } from './cambridgeTests';
import './App.css';

const DEFAULT_SYSTEM_PROMPT = `You are a Senior, Official IELTS Speaking Examiner accredited by the British Council and IDP.
Your mission is to rigorously and constructively evaluate a candidate's transcribed spoken response in accordance with the official IELTS Speaking Public Band Descriptors.

EVALUATION PILLARS (Band 0.0 - 9.0 in 0.5 increments):
1. Fluency and Coherence (FC): Continuity, speech rate, natural flow, appropriate use of discourse markers, absence of unnatural self-correction or excessive hesitation.
2. Lexical Resource (LR): Range, precision, flexibility, idiomatic collocations, sophistication, paraphrasing ability, and natural word choice.
3. Grammatical Range and Accuracy (GRA): Use of compound and complex sentence structures, conditional clauses, relative clauses, tense consistency, and structural variety.
4. Pronunciation & Delivery Insights (P): Based on transcription clarity, rhythm markers, pause indicators, and cadence.

PART-SPECIFIC BENCHMARKS:
- Part 1 (Introduction & Interview): Answers should be natural, direct, and concise (2-4 sentences, ~20-30s), extending with a reason or concrete example without over-rambling.
- Part 2 (Long Turn / Cue Card): The candidate should speak for 1-2 minutes continuously, logically addressing all cue card prompts with a strong narrative arc and cohesive transitions.
- Part 3 (Two-Way Discussion): Answers should demonstrate abstract analysis, evaluation of multiple perspectives, hypothesizing, and sophisticated academic discourse markers.

IMPORTANT CONSTRAINTS & STT TOLERANCE:
- Account for Speech-to-Text (STT) glitches: If a transcribed word is odd but phonetically sounds like a logical English word in context, evaluate their intended linguistic competence and do not penalize unfairly.
- Maintain an encouraging yet realistic standard. Be exact with Band Scores.

REQUIRED OUTPUT FORMAT (Markdown):
### **Overall Band Score: [e.g. 7.5 / 9.0]**

#### **Examiner Summary:**
[A concise 2-sentence executive summary of the candidate's performance and primary strength.]

#### **Criteria Breakdown:**
- **Fluency & Coherence:** **[Score]/9.0** — [Specific diagnostic feedback]
- **Lexical Resource:** **[Score]/9.0** — [Specific diagnostic feedback]
- **Grammatical Range & Accuracy:** **[Score]/9.0** — [Specific diagnostic feedback]
- **Spoken Delivery & Pronunciation Notes:** **[Score]/9.0** — [Notes on cadence, sentence length, and speech flow]

#### **Key Strengths:**
- [Specific strength demonstrated in the answer]
- [Another positive element of language or organization]

#### **Areas for Target Improvement:**
- [Precise weakness in grammar, vocabulary, or coherence]
- [Specific actionable recommendation to jump to the next band level]

#### **Band 8+ Lexical Upgrades:**
| Candidate's Original Phrase | Recommended Band 8.5+ Upgrade | Why It's Better |
| :--- | :--- | :--- |
| *"[Original phrase]"* | **"[Advanced collocation/idiom]"** | [Brief explanation] |
| *"[Original phrase]"* | **"[Advanced collocation/idiom]"** | [Brief explanation] |

#### **Model Band 9.0 Answer:**
> "[Rewrite the candidate's response into a natural, native-level Band 9.0 answer answering the exact same question. Include natural flow and advanced collocations.]"
`;

function App() {
  // Authentication State
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('ielts_auth_key') || '');
  const [username, setUsername] = useState(() => localStorage.getItem('ielts_username') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('ielts_auth_key')));
  const [loginUsername, setLoginUsername] = useState(() => localStorage.getItem('ielts_username') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Cambridge IELTS Selection State
  const [selectedCambridgeTestId, setSelectedCambridgeTestId] = useState('cambridge-19-test-1');

  // Practice & Recording State
  const [ieltsPart, setIeltsPart] = useState('Part 1');
  const [question, setQuestion] = useState(() => {
    const defaultTest = CAMBRIDGE_TESTS[0];
    return defaultTest ? defaultTest.part_1.join('\n\n') : getRandomQuestion('Part 1');
  });
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Ready to practice');
  const [transcript, setTranscript] = useState('');
  const [evaluation, setEvaluation] = useState('');
  const [recorderInfo, setRecorderInfo] = useState('');
  const [timer, setTimer] = useState(0);
  const [duration, setDuration] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showMicModal, setShowMicModal] = useState(false);

  // Part 2 Prep Timer State
  const [isPrepActive, setIsPrepActive] = useState(false);
  const [prepTimeLeft, setPrepTimeLeft] = useState(60);
  const prepIntervalRef = useRef(null);

  const timerIntervalRef = useRef(null);
  const timerRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioBlobRef = useRef(null);

  // Handle Authentication
  const handleLogin = (e) => {
    e?.preventDefault();
    if (!loginUsername.trim()) {
      setLoginError('Please enter your name or username.');
      return;
    }
    if (!loginPassword.trim()) {
      setLoginError('Please enter the access password.');
      return;
    }

    // Default expected password is speaking30
    if (loginPassword.trim() === 'speaking30') {
      localStorage.setItem('ielts_auth_key', loginPassword.trim());
      localStorage.setItem('ielts_username', loginUsername.trim());
      setAuthToken(loginPassword.trim());
      setUsername(loginUsername.trim());
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Incorrect password. Access is restricted.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('ielts_auth_key');
    localStorage.removeItem('ielts_username');
    setAuthToken('');
    setUsername('');
    setIsAuthenticated(false);
    setLoginPassword('');
    setLoginUsername('');
    setLoginError('');
  };

  // Load Cambridge Test
  const loadCambridgeTest = (testId, part = ieltsPart) => {
    setSelectedCambridgeTestId(testId);
    stopPrepTimer();
    if (!testId) {
      setQuestion(getRandomQuestion(part));
      return;
    }
    const found = CAMBRIDGE_TESTS.find((t) => t.id === testId);
    if (found) {
      if (part === 'Part 1') {
        setQuestion(found.part_1.join('\n\n'));
      } else if (part === 'Part 2') {
        setQuestion(found.part_2);
      } else if (part === 'Part 3') {
        setQuestion(found.part_3.join('\n\n'));
      }
    }
  };

  // Change question when IELTS Part changes
  const handlePartChange = (part) => {
    setIeltsPart(part);
    stopPrepTimer();
    if (selectedCambridgeTestId) {
      loadCambridgeTest(selectedCambridgeTestId, part);
    } else {
      setQuestion(getRandomQuestion(part));
    }
  };

  const handleRandomQuestion = () => {
    setSelectedCambridgeTestId('');
    setQuestion(getRandomQuestion(ieltsPart));
    stopPrepTimer();
  };

  const handleRandomCambridgeTest = () => {
    const randomIndex = Math.floor(Math.random() * CAMBRIDGE_TESTS.length);
    const randomTest = CAMBRIDGE_TESTS[randomIndex];
    if (randomTest) {
      loadCambridgeTest(randomTest.id, ieltsPart);
    }
  };

  const startRecordingRef = useRef(null);

  // Part 2 1-Minute Preparation Timer
  const togglePrepTimer = () => {
    if (isPrepActive) {
      stopPrepTimer();
    } else {
      if (isRecording) {
        stopRecording();
      }
      setIsPrepActive(true);
      setPrepTimeLeft(60);
      setStatus('⏳ 1-Minute Preparation timer started. Jot down notes! Recording will start automatically at 0:00.');

      prepIntervalRef.current = setInterval(() => {
        setPrepTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(prepIntervalRef.current);
            setIsPrepActive(false);
            setStatus('🎙️ 1-Minute prep complete! Recording started automatically... Speak clearly.');

            // Sound chime cue (880Hz)
            try {
              const AudioCtx = window.AudioContext || window.webkitAudioContext;
              if (AudioCtx) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 880;
                gain.gain.value = 0.15;
                osc.start();
                setTimeout(() => {
                  osc.stop();
                  ctx.close();
                }, 350);
              }
            } catch (e) {}

            // Automatically trigger speech recording
            if (startRecordingRef.current) {
              startRecordingRef.current();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const stopPrepTimer = () => {
    if (prepIntervalRef.current) {
      clearInterval(prepIntervalRef.current);
    }
    setIsPrepActive(false);
    setPrepTimeLeft(60);
  };

  const skipPrepAndRecord = () => {
    stopPrepTimer();
    if (startRecordingRef.current) {
      startRecordingRef.current();
    }
  };

  useEffect(() => {
    return () => {
      if (prepIntervalRef.current) clearInterval(prepIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Speech Metrics Calculation
  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const recordedDuration = duration || timer;
  const wordsPerMinute = recordedDuration > 5 && wordCount > 0 
    ? Math.round((wordCount / recordedDuration) * 60) 
    : 0;

  const getPaceFeedback = (wpm) => {
    if (wpm === 0) return null;
    if (wpm < 95) return { label: 'Deliberate / Pauses Detected', color: '#f59e0b', desc: 'Slightly slow pace. Try to connect sentences more fluidly.' };
    if (wpm <= 155) return { label: 'Ideal Conversational Pace', color: '#10b981', desc: 'Natural, native-sounding speech velocity (110–155 WPM).' };
    return { label: 'Fast / Rapid Delivery', color: '#ef4444', desc: 'High pace. Ensure clarity and pronunciation are not rushed.' };
  };

  const paceInfo = getPaceFeedback(wordsPerMinute);

  // Recording Controls
  const startRecording = async () => {
    if (!question.trim()) {
      alert('Please enter or select an IELTS question first.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Try optimal opus format, fallback to default
      let options = { audioBitsPerSecond: 48000 };
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options.mimeType = 'audio/mp4';
      }

      try {
        mediaRecorderRef.current = new MediaRecorder(stream, options);
      } catch (e) {
        mediaRecorderRef.current = new MediaRecorder(stream);
      }

      audioChunksRef.current = [];

      // Reset timers
      setTimer(0);
      timerRef.current = 0;
      setDuration(null);
      setAudioUrl(null);
      setTranscript('');
      setEvaluation('');

      timerIntervalRef.current = setInterval(() => {
        timerRef.current += 1;
        setTimer(timerRef.current);
      }, 1000);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
        audioBlobRef.current = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());

        clearInterval(timerIntervalRef.current);
        const finalDuration = timerRef.current;
        setDuration(finalDuration);

        const url = URL.createObjectURL(audioBlobRef.current);
        setAudioUrl(url);

        setIsLoading(true);
        setStatus('Transcribing speech & analyzing examiner criteria...');

        const result = await sendAudioForProcessing(audioBlobRef.current);
        setTranscript(result.transcript || 'No transcript generated.');
        setEvaluation(result.evaluation || 'No evaluation received.');
        setIsLoading(false);
        setStatus('Evaluation completed!');

        const sizeInKB = (audioBlobRef.current.size / 1024).toFixed(1);
        setRecorderInfo(`Duration: ${formatTime(finalDuration)} | Size: ${sizeInKB} KB`);
      };

      mediaRecorderRef.current.start(250); // Slice data every 250ms
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      const isDenied = 
        error.name === 'NotAllowedError' || 
        error.name === 'PermissionDeniedError' || 
        error.name === 'SecurityError' ||
        error.message?.toLowerCase().includes('denied') ||
        error.message?.toLowerCase().includes('permission') ||
        error.message?.toLowerCase().includes('not allowed');

      if (isDenied) {
        setShowMicModal(true);
        setStatus('⚠️ Microphone access is blocked. Please allow permissions in your browser.');
      } else if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setShowMicModal(true);
        setStatus('⚠️ Microphone requires a modern browser and HTTPS / secure context.');
      } else {
        setStatus(`Microphone error: ${error.message || 'Could not access audio device.'}`);
      }
    }
  };

  startRecordingRef.current = startRecording;

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

  // API Call with Authentication Header & Fallback URL
  const sendAudioForProcessing = async (blob) => {
    const formData = new FormData();
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    formData.append('audio_file', blob, `recording.${ext}`);
    formData.append('question', question);
    formData.append('ielts_part', ieltsPart);
    formData.append('system_prompt', systemPrompt);
    formData.append('access_token', authToken);

    // List of candidate endpoints to support Vercel serverless and local dev seamlessly
    const endpoints = [
      '/api/transcribe-and-score',
      'http://localhost:8000/api/transcribe-and-score',
      'http://localhost:8000/transcribe-and-score'
    ];

    let lastError = null;

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'x-access-token': authToken
          },
          body: formData
        });

        if (response.status === 401) {
          handleLogout();
          throw new Error('Access session expired or invalid password. Please sign in again.');
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        // If it's a connection refused on relative URL during local npm start without backend proxy, try next
        if (err.message.includes('401')) {
          break;
        }
      }
    }

    console.error('Processing error:', lastError);
    return {
      transcript: `Error processing audio: ${lastError?.message || 'Unknown network error'}`,
      evaluation: `### Evaluation Failed\n\nCould not communicate with the backend scoring service. Please ensure the backend server is running and your OpenAI API key is configured.\n\n*Error details: ${lastError?.message}*`
    };
  };

  const saveReport = () => {
    const content = `# IELTS Speaking Practice Report
Candidate: ${username || 'Candidate'}
Date: ${new Date().toLocaleString()}
Section: ${ieltsPart}
Duration: ${formatTime(duration || 0)}
Word Count: ${wordCount}
Pace: ${wordsPerMinute} WPM

## Target Question:
${question}

## Spoken Transcript:
${transcript}

---
## Official Examiner Evaluation:
${evaluation}
`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IELTS_Report_${(username || 'Candidate').replace(/\s+/g, '_')}_${ieltsPart.replace(/\s+/g, '_')}_${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text, message) => {
    navigator.clipboard.writeText(text);
    alert(message || 'Copied to clipboard!');
  };

  // --- 1. Single Sign-In Gate with Username & Password ---
  if (!isAuthenticated) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-badge">Private Access</div>
          <div className="login-icon">🎙️</div>
          <h2>IELTS Speaking Pro</h2>
          <p className="login-subtitle">
            Enter your name and the authorized access password to begin practicing.
          </p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="login-field-group">
              <label>Candidate Name / Username:</label>
              <div className="input-with-icon">
                <span className="input-field-icon">👤</span>
                <input
                  type="text"
                  placeholder="Enter your name (e.g. Alex)"
                  value={loginUsername}
                  onChange={(e) => {
                    setLoginUsername(e.target.value);
                    setLoginError('');
                  }}
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field-group">
              <label>Access Password:</label>
              <div className="password-input-wrapper input-with-icon">
                <span className="input-field-icon">🔑</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password (speaking30)"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    setLoginError('');
                  }}
                />
                <button
                  type="button"
                  className="toggle-pw-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? '👁️' : '🔒'}
                </button>
              </div>
            </div>

            {loginError && <div className="login-error-msg">{loginError}</div>}

            <button type="submit" className="login-submit-btn">
              Unlock Speaking Suite →
            </button>
          </form>

          <div className="login-footer">
            <span>Powered by OpenAI GPT-4o & GPT-4o-Transcribe</span>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. Main Practice Dashboard ---
  return (
    <div className="App">
      {/* Top Header Bar */}
      <header className="app-header">
        <div className="header-meta-row">
          <div className="candidate-badge">
            <span className="candidate-icon">👤</span>
            <span className="candidate-text">Candidate: <strong>{username || 'Friend'}</strong></span>
          </div>
          <div className="header-right-meta">
            <div className="status-pill">
              <span className="pulsing-dot"></span> Authorized Access
            </div>
            <button className="signout-button" onClick={handleLogout} title="Sign out and return to login screen">
              Sign Out
            </button>
          </div>
        </div>

        <div className="brand-badge">Official IELTS Criteria</div>
        <h1>IELTS Speaking Practice Pro</h1>
        <p>Record your voice, get transcribed instantly, and receive British Council / IDP Band Scores & feedback.</p>
      </header>

      <main className="main-content">
        {/* Setup & Question Card */}
        <section className="setup-container">
          {/* Cambridge IELTS Test Picker */}
          <div className="cambridge-selector-card">
            <div className="cambridge-selector-header">
              <div className="cambridge-selector-label">
                <span className="cambridge-book-icon">📚</span>
                <div>
                  <strong>Official Cambridge IELTS Practice Tests</strong>
                  <span>Auto-fills authentic Cambridge exam questions for Parts 1, 2, and 3</span>
                </div>
              </div>
              <button
                type="button"
                className="action-link-btn"
                onClick={handleRandomCambridgeTest}
                title="Picks a random Cambridge test"
              >
                🎲 Random Cambridge Test
              </button>
            </div>

            <div className="cambridge-dropdown-wrapper">
              <select
                className="cambridge-select"
                value={selectedCambridgeTestId}
                onChange={(e) => loadCambridgeTest(e.target.value)}
              >
                <option value="">-- Custom / Manual Question Entry --</option>
                {CAMBRIDGE_TESTS.map((t) => (
                  <option key={t.id} value={t.id}>
                    📖 {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="setup-row">
            <div className="input-group part-selector">
              <label>Select Speaking Part:</label>
              <div className="part-buttons">
                {['Part 1', 'Part 2', 'Part 3'].map((part) => (
                  <button
                    key={part}
                    type="button"
                    className={`part-pill ${ieltsPart === part ? 'active' : ''}`}
                    onClick={() => handlePartChange(part)}
                  >
                    {part === 'Part 1' && 'Part 1: Interview'}
                    {part === 'Part 2' && 'Part 2: Long Turn (Cue Card)'}
                    {part === 'Part 3' && 'Part 3: Discussion'}
                  </button>
                ))}
              </div>
            </div>

            {ieltsPart === 'Part 2' && (
              <div className={`part2-prep-banner ${isPrepActive ? 'active' : ''}`}>
                {!isPrepActive ? (
                  <div className="prep-banner-idle">
                    <div className="prep-banner-info">
                      <span className="prep-banner-icon">⏱️</span>
                      <div>
                        <strong>1-Minute Preparation Countdown</strong>
                        <p>Take notes on paper. Recording will automatically begin at 0:00.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="prep-start-btn"
                      onClick={togglePrepTimer}
                      disabled={isRecording || isLoading}
                    >
                      ⏱️ Start 1-Min Prep & Auto-Record
                    </button>
                  </div>
                ) : (
                  <div className="prep-banner-counting">
                    <div className="prep-countdown-box">
                      <span className="prep-countdown-num">0:{prepTimeLeft.toString().padStart(2, '0')}</span>
                      <span className="prep-countdown-sub">Preparation time remaining (Auto-recording starts at 0:00)</span>
                    </div>
                    <div className="prep-counting-actions">
                      <button
                        type="button"
                        className="prep-skip-btn"
                        onClick={skipPrepAndRecord}
                      >
                        🔴 Skip Prep & Record Now
                      </button>
                      <button
                        type="button"
                        className="prep-cancel-btn"
                        onClick={stopPrepTimer}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="input-group">
            <div className="label-row">
              <label>IELTS Question / Cue Card Prompt:</label>
              <div className="action-links">
                <button type="button" className="action-link-btn" onClick={handleRandomQuestion}>
                  🎲 Pick Random Question
                </button>
                <button type="button" className="action-link-btn" onClick={() => copyToClipboard(question, 'Question copied!')}>
                  📋 Copy Question
                </button>
                <button type="button" className="action-link-btn danger" onClick={() => setQuestion('')}>
                  Clear
                </button>
              </div>
            </div>
            <textarea
              placeholder="Paste or type your IELTS question / cue card here..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={ieltsPart === 'Part 2' ? 6 : 3}
            />
          </div>

          {/* Optional Prompt Customizer Drawer */}
          <div className="prompt-toggle-row">
            <button
              type="button"
              className="prompt-toggle-btn"
              onClick={() => setShowPromptEditor(!showPromptEditor)}
            >
              {showPromptEditor ? '▲ Hide Examiner Persona Prompt' : '⚙️ View / Customize Examiner Prompt'}
            </button>
          </div>

          {showPromptEditor && (
            <div className="prompt-editor-box">
              <label>Senior Examiner System Instructions:</label>
              <textarea
                rows="8"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
              <button
                type="button"
                className="reset-prompt-btn"
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
              >
                Reset to Default British Council / IDP Prompt
              </button>
            </div>
          )}
        </section>

        {/* Recording Section */}
        <section className="recorder-container">
          <div className="recorder-visual">
            <div className={`mic-ring ${isRecording ? 'pulse' : ''}`}>
              <span className="mic-icon">🎙️</span>
            </div>

            <div className={`timer-display ${isRecording ? 'active' : ''}`}>
              {isRecording ? formatTime(timer) : (duration ? `Duration: ${formatTime(duration)}` : '0:00')}
            </div>

            <div className="target-pace-hint">
              {ieltsPart === 'Part 1' && 'Target: 20–35s per answer'}
              {ieltsPart === 'Part 2' && 'Target: 1m 45s – 2m 00s'}
              {ieltsPart === 'Part 3' && 'Target: 40–60s per answer'}
            </div>
          </div>

          <div className="recorder-controls">
            {isRecording ? (
              <button
                className="record-button recording"
                onClick={stopRecording}
                disabled={isLoading}
              >
                ⏹️ Stop & Score Speaking
              </button>
            ) : isPrepActive ? (
              <div className="prep-active-recorder-cluster">
                <div className="prep-active-badge">
                  ⏳ 1-Min Prep Active: 0:{prepTimeLeft.toString().padStart(2, '0')} (Auto-records at 0:00)
                </div>
                <div className="prep-active-buttons">
                  <button
                    className="record-button skip-prep-btn"
                    onClick={skipPrepAndRecord}
                    disabled={isLoading}
                  >
                    🔴 Skip Prep & Start Recording Now
                  </button>
                  <button
                    type="button"
                    className="prep-cancel-secondary-btn"
                    onClick={stopPrepTimer}
                  >
                    Cancel Prep
                  </button>
                </div>
              </div>
            ) : ieltsPart === 'Part 2' ? (
              <div className="part2-record-buttons-row">
                <button
                  type="button"
                  className="record-button prep-trigger-btn"
                  onClick={togglePrepTimer}
                  disabled={isLoading}
                  title="Starts a 60-second preparation countdown for taking notes, then auto-records"
                >
                  ⏱️ 1-Min Prep & Auto-Record
                </button>
                <button
                  type="button"
                  className="record-button record-direct-btn"
                  onClick={startRecording}
                  disabled={isLoading}
                >
                  🔴 Record Directly
                </button>
              </div>
            ) : (
              <button
                className="record-button"
                onClick={toggleRecording}
                disabled={isLoading}
              >
                🔴 Start Recording Response
              </button>
            )}
          </div>

          {/* Audio Playback Player */}
          {audioUrl && !isRecording && (
            <div className="audio-playback-container">
              <div className="playback-header">
                <span>🔊 Listen Back to Your Spoken Audio</span>
                <span className="file-size-tag">{recorderInfo}</span>
              </div>
              <audio src={audioUrl} controls className="audio-player" />
            </div>
          )}

          <div className={`status-bar ${isLoading ? 'loading' : ''}`}>
            {isLoading && <span className="spinner"></span>}
            {status}
          </div>
        </section>

        {/* Live Metrics Row (if transcript exists) */}
        {transcript && (
          <section className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Spoken Word Count</div>
              <div className="metric-value">{wordCount}</div>
              <div className="metric-sub">Total words analyzed</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Speech Delivery Velocity</div>
              <div className="metric-value">
                {wordsPerMinute} <span className="metric-unit">WPM</span>
              </div>
              {paceInfo && (
                <div className="pace-badge" style={{ color: paceInfo.color, borderColor: paceInfo.color }}>
                  {paceInfo.label}
                </div>
              )}
            </div>

            <div className="metric-card">
              <div className="metric-label">Recorded Duration</div>
              <div className="metric-value">{formatTime(recordedDuration)}</div>
              <div className="metric-sub">Speaking timeline</div>
            </div>
          </section>
        )}

        {/* Results: Transcript & Examiner Evaluation */}
        {(transcript || evaluation) && (
          <section className="results-container">
            <div className="transcript-box">
              <div className="card-header">
                <h3>📝 Spoken Transcript</h3>
                <button
                  type="button"
                  className="card-copy-btn"
                  onClick={() => copyToClipboard(transcript, 'Transcript copied!')}
                >
                  Copy
                </button>
              </div>
              <div className="display-area transcript-text">
                {transcript || 'Awaiting spoken input...'}
              </div>
            </div>

            <div className="evaluation-box">
              <div className="card-header">
                <h3>🎖️ Examiner Assessment & Band Scoring</h3>
                <button
                  type="button"
                  className="card-copy-btn"
                  onClick={() => copyToClipboard(evaluation, 'Evaluation report copied!')}
                >
                  Copy Evaluation
                </button>
              </div>
              <div className="display-area evaluation-text">
                {evaluation ? (
                  <ReactMarkdown>{evaluation}</ReactMarkdown>
                ) : (
                  <div className="placeholder-text">Evaluation will appear after recording...</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Global Action Bar */}
        {(transcript || evaluation) && (
          <div className="actions-bar">
            <button className="action-button download-btn" onClick={saveReport}>
              💾 Download Complete IELTS Report (.md)
            </button>
            <button
              className="action-button next-btn"
              onClick={() => {
                handleRandomQuestion();
                setTranscript('');
                setEvaluation('');
                setDuration(null);
                setAudioUrl(null);
                setStatus('Ready to practice next question');
              }}
            >
              🚀 Practice Next Question
            </button>
          </div>
        )}
      </main>

      {/* Microphone Permission Modal Popup */}
      {showMicModal && (
        <div className="mic-modal-overlay" onClick={() => setShowMicModal(false)}>
          <div className="mic-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close-x"
              onClick={() => setShowMicModal(false)}
              title="Close popup"
            >
              ✕
            </button>

            <div className="mic-modal-icon-wrapper">
              <span className="mic-modal-main-icon">🎙️</span>
              <span className="mic-modal-lock-badge">🔒</span>
            </div>

            <h3>Microphone Access Blocked</h3>
            <p className="mic-modal-desc">
              Your browser has blocked microphone access for this website. To record and evaluate your IELTS response, you must allow microphone access.
            </p>

            <div className="mic-steps-container">
              <div className="mic-step-item">
                <div className="mic-step-number">1</div>
                <div className="mic-step-text">
                  <strong>Look at your browser's address bar</strong>
                  <span>Find the URL at the top (e.g. <em>speaking.araafay.online</em>).</span>
                </div>
              </div>

              <div className="mic-step-item">
                <div className="mic-step-number">2</div>
                <div className="mic-step-text">
                  <strong>Click the 🔒 Lock or 🎚️ Settings icon</strong>
                  <span>Click the icon situated directly on the left side of the web address.</span>
                </div>
              </div>

              <div className="mic-step-item">
                <div className="mic-step-number">3</div>
                <div className="mic-step-text">
                  <strong>Change Microphone from "Block" to "Allow"</strong>
                  <span>Toggle the microphone permission switch to <strong>Allow</strong>.</span>
                </div>
              </div>
            </div>

            <div className="mic-modal-buttons">
              <button
                type="button"
                className="mic-modal-retry-btn"
                onClick={() => {
                  setShowMicModal(false);
                  startRecording();
                }}
              >
                🔄 Try Again & Start Speaking
              </button>
              <button
                type="button"
                className="mic-modal-dismiss-btn"
                onClick={() => setShowMicModal(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
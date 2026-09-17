import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getRandomQuestion } from './questionBank';
import { CAMBRIDGE_TESTS } from './cambridgeTests';
import './App.css';

const DEFAULT_SYSTEM_PROMPT = `You are a Senior, Official IELTS Speaking Examiner accredited by the British Council and IDP.
Your mission is to rigorously and constructively evaluate a candidate's transcribed spoken response in accordance with the official IELTS Speaking Public Band Descriptors.

EVALUATION PILLARS (Band 0.0 - 9.0 in 0.5 increments):
1. Fluency and Coherence (FC): Continuity, speech rate, natural flow, appropriate use of discourse markers, absence of unnatural self-correction or excessive hesitation. Actively analyze spoken filler words ('um', 'uh', 'er', 'like', 'you know'), repetitions, stutters, false starts, and mid-sentence stalling.
2. Lexical Resource (LR): Range, precision, flexibility, idiomatic collocations, sophistication, paraphrasing ability, and natural word choice.
3. Grammatical Range and Accuracy (GRA): Use of compound and complex sentence structures, conditional clauses, relative clauses, tense consistency, and structural variety.
4. Spoken Delivery, Tone & Natural Expression (P): Cadence, sentence rhythm, discourse intonation, emotional engagement, clarity, naturalness of expression, and hesitation markers. Note any robotic tone or unnatural pauses.

PART-SPECIFIC BENCHMARKS:
- Part 1 (Introduction & Interview): Answers should be natural, direct, and concise (2-4 sentences, ~20-30s), extending with a reason or concrete example without over-rambling.
- Part 2 (Long Turn / Cue Card): The candidate should speak for 1-2 minutes continuously, logically addressing all cue card prompts with a strong narrative arc and cohesive transitions.
- Part 3 (Two-Way Discussion): Answers should demonstrate abstract analysis, evaluation of multiple perspectives, hypothesizing, and sophisticated academic discourse markers.

IMPORTANT CONSTRAINTS & STT TOLERANCE:
- Account for Speech-to-Text (STT) glitches: If a transcribed word is odd but phonetically sounds like a logical English word in context, evaluate their intended linguistic competence and do not penalize unfairly.
- If repeated filler words, stutters, or false starts appear in the transcript, provide constructive feedback on how to replace them with natural discourse connectives.
- Maintain an encouraging yet realistic standard. Be exact with Band Scores.

REQUIRED OUTPUT FORMAT (Markdown):
### **Overall Band Score: [e.g. 7.5 / 9.0]**

#### **Examiner Summary:**
[A concise 2-sentence executive summary of the candidate's performance, delivery flow, and primary strength.]

#### **Criteria Breakdown:**
- **Fluency & Coherence:** **[Score]/9.0** — [Specific diagnostic feedback on continuity, filler words, and flow]
- **Lexical Resource:** **[Score]/9.0** — [Specific diagnostic feedback on vocabulary range and collocations]
- **Grammatical Range & Accuracy:** **[Score]/9.0** — [Specific diagnostic feedback on sentence complexity and error density]
- **Delivery, Stutters & Expression Notes:** **[Score]/9.0** — [Detailed notes on pauses, stutters, filler words ('um/uh'), cadence, and natural communicative delivery]

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
  const [selectedCambridgeTestId, setSelectedCambridgeTestId] = useState('cambridge-21-test-1');

  // Practice & Recording State
  const [ieltsPart, setIeltsPart] = useState('Part 1');
  const [questionsList, setQuestionsList] = useState(() => {
    const defaultTest = CAMBRIDGE_TESTS[0];
    return defaultTest && defaultTest.part_1 ? defaultTest.part_1 : [getRandomQuestion('Part 1')];
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [question, setQuestion] = useState(() => {
    const defaultTest = CAMBRIDGE_TESTS[0];
    return defaultTest && defaultTest.part_1 && defaultTest.part_1.length > 0
      ? defaultTest.part_1[0]
      : getRandomQuestion('Part 1');
  });
  const [isManualQuestionEdit, setIsManualQuestionEdit] = useState(false);
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
  const handleLogin = async (e) => {
    e?.preventDefault();
    const cleanUser = loginUsername.trim();
    const cleanPass = loginPassword.trim();
    if (!cleanUser) {
      setLoginError('Please enter your name or username.');
      return;
    }
    if (!cleanPass) {
      setLoginError('Please enter the access password.');
      return;
    }

    try {
      // Authenticate with backend and record candidate login
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: cleanPass,
          username: cleanUser,
        }),
      });

      if (res.ok) {
        localStorage.setItem('ielts_auth_key', cleanPass);
        localStorage.setItem('ielts_username', cleanUser);
        setAuthToken(cleanPass);
        setUsername(cleanUser);
        setIsAuthenticated(true);
        setLoginError('');
        return;
      } else {
        setLoginError('Incorrect password. Access is restricted.');
        return;
      }
    } catch (err) {
      // Fallback offline verification if network issue
      if (cleanPass === 'speaking30') {
        localStorage.setItem('ielts_auth_key', cleanPass);
        localStorage.setItem('ielts_username', cleanUser);
        setAuthToken(cleanPass);
        setUsername(cleanUser);
        setIsAuthenticated(true);
        setLoginError('');
      } else {
        setLoginError('Incorrect password. Access is restricted.');
      }
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
  const loadCambridgeTest = (testId, part = ieltsPart, targetIndex = 0) => {
    setSelectedCambridgeTestId(testId);
    stopPrepTimer();
    setIsManualQuestionEdit(false);
    if (!testId) {
      const rand = getRandomQuestion(part);
      setQuestionsList([rand]);
      setCurrentQuestionIndex(0);
      setQuestion(rand);
      return;
    }
    const found = CAMBRIDGE_TESTS.find((t) => t.id === testId);
    if (found) {
      let list = [];
      if (part === 'Part 1') {
        list = found.part_1 || [];
      } else if (part === 'Part 2') {
        list = [found.part_2];
      } else if (part === 'Part 3') {
        list = found.part_3 || [];
      }
      setQuestionsList(list);
      const safeIndex = Math.min(targetIndex, Math.max(0, list.length - 1));
      setCurrentQuestionIndex(safeIndex);
      setQuestion(list[safeIndex] || '');
      setTranscript('');
      setEvaluation('');
      setDuration(null);
      setAudioUrl(null);
      setStatus(`Loaded ${found.title} - ${part} (Q${safeIndex + 1})`);
    }
  };

  // Change question when IELTS Part changes
  const handlePartChange = (part) => {
    setIeltsPart(part);
    stopPrepTimer();
    setIsManualQuestionEdit(false);
    if (selectedCambridgeTestId) {
      loadCambridgeTest(selectedCambridgeTestId, part, 0);
    } else {
      const rand = getRandomQuestion(part);
      setQuestionsList([rand]);
      setCurrentQuestionIndex(0);
      setQuestion(rand);
      setTranscript('');
      setEvaluation('');
      setDuration(null);
      setAudioUrl(null);
    }
  };
  // Navigation between questions (Part 1 and Part 3)
  const goToQuestion = (index) => {
    if (index >= 0 && index < questionsList.length) {
      if (isRecording) {
        stopRecording();
      }
      stopPrepTimer();
      setCurrentQuestionIndex(index);
      setQuestion(questionsList[index]);
      setTranscript('');
      setEvaluation('');
      setDuration(null);
      setAudioUrl(null);
      setStatus(`Ready to practice Question ${index + 1} of ${questionsList.length}`);
    }
  };

  const goToNextQuestion = () => {
    if (currentQuestionIndex < questionsList.length - 1) {
      goToQuestion(currentQuestionIndex + 1);
    } else if (ieltsPart === 'Part 1') {
      handlePartChange('Part 2');
    } else if (ieltsPart === 'Part 2') {
      handlePartChange('Part 3');
    }
  };

  const goToPrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      goToQuestion(currentQuestionIndex - 1);
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

        // Hard Credit Protection Limit: 5 minutes (300 seconds)
        if (timerRef.current >= 300) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
              mediaRecorderRef.current.stop();
            } catch (err) {
              console.error('Auto-stop error at 5-min limit:', err);
            }
            setIsRecording(false);
            setStatus('⏹️ 5-minute maximum limit reached! Recording automatically stopped & sent for examiner evaluation to protect OpenAI credits.');
          }
        }
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

        if (finalDuration < 1) {
          setIsLoading(false);
          setStatus('⚠️ Recording too short (< 1s). Please speak your answer.');
          setTranscript('[Recording under 1 second]');
          setEvaluation('### **Overall Band Score: N/A**\n\n> ⚠️ **Recording Too Short (< 1s)**\n>\n> The recording was under one second and did not capture your spoken answer. Please tap the microphone, speak your complete response, and tap stop when finished.');
          const sizeInKB = (audioBlobRef.current.size / 1024).toFixed(1);
          setRecorderInfo(`Duration: ${formatTime(finalDuration)} | Size: ${sizeInKB} KB [Ignored: < 1s]`);
          return;
        }

        setIsLoading(true);
        setStatus(finalDuration >= 300
          ? '⏹️ 5-minute limit reached. Transcribing & evaluating speaking...'
          : 'Transcribing speech & analyzing examiner criteria...');

        const result = await sendAudioForProcessing(audioBlobRef.current);
        setTranscript(result.transcript || 'No transcript generated.');
        setEvaluation(result.evaluation || 'No evaluation received.');
        setIsLoading(false);
        setStatus(finalDuration >= 300
          ? 'Evaluation completed! (Auto-capped at 5m max limit)'
          : 'Evaluation completed!');

        const sizeInKB = (audioBlobRef.current.size / 1024).toFixed(1);
        const limitTag = finalDuration >= 300 ? ' [Capped at 5:00]' : '';
        setRecorderInfo(`Duration: ${formatTime(finalDuration)}${limitTag} | Size: ${sizeInKB} KB`);
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
    // Safety guard: reject if audio blob is > 15MB (~5-minute ceiling)
    if (blob.size > 15 * 1024 * 1024) {
      return {
        transcript: 'Recording aborted: audio file exceeded 15MB safety threshold (~5 minutes).',
        evaluation: '### Recording Limit Exceeded\n\nThe recording file size exceeded the maximum safety threshold (15MB) to protect OpenAI credits. Please keep your response under 5 minutes.'
      };
    }

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
          <div className="login-badge">✦ Private Access</div>
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
                  placeholder="Enter your name"
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
            <span>Powered by OpenAI GPT-5.6-Luna & GPT-4o-Transcribe</span>
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
            <a
              href={`/api/logins?token=${encodeURIComponent(authToken || 'speaking30')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="signout-button"
              style={{ textDecoration: 'none', marginLeft: '6px' }}
              title="View all recorded candidate logins"
            >
              📋 Logins
            </a>
            <button className="signout-button" onClick={handleLogout} title="Sign out and return to login screen">
              Sign Out
            </button>
          </div>
        </div>

        <div className="brand-badge">✦ Official IELTS Examiner AI</div>
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
            </div>

            <div className="cambridge-dropdown-wrapper">
              <select
                className="cambridge-select"
                value={selectedCambridgeTestId}
                onChange={(e) => loadCambridgeTest(e.target.value)}
              >
                <option value="">-- Custom / Manual Question Entry --</option>
                {[21, 20, 19, 18, 17, 16, 15, 14].map((bookNum) => {
                  const testsForBook = CAMBRIDGE_TESTS.filter((t) => t.book === bookNum);
                  if (!testsForBook.length) return null;
                  return (
                    <optgroup key={bookNum} label={`📚 Cambridge IELTS ${bookNum}`}>
                      {testsForBook.map((t) => (
                        <option key={t.id} value={t.id}>
                          📖 {t.title}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
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

          {/* Interactive Question Card / Cue Card Section */}
          {questionsList.length > 1 ? (
            <div className="question-interactive-container">
              {/* Question Navigation Header */}
              <div className="question-nav-header">
                <div className="question-nav-meta">
                  <span className="question-step-badge">
                    Question {currentQuestionIndex + 1} of {questionsList.length}
                  </span>
                  <span className="question-part-pill">{ieltsPart}</span>
                </div>

                {/* Question Pills (Q1, Q2, Q3, Q4...) */}
                <div className="question-pills-cluster">
                  {questionsList.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`q-pill ${idx === currentQuestionIndex ? 'active' : ''}`}
                      onClick={() => goToQuestion(idx)}
                      title={`Jump directly to Question ${idx + 1}`}
                    >
                      Q{idx + 1}
                    </button>
                  ))}
                </div>

                <div className="action-links">
                  <button
                    type="button"
                    className="action-link-btn"
                    onClick={() => setIsManualQuestionEdit(!isManualQuestionEdit)}
                  >
                    {isManualQuestionEdit ? '👁️ View Prompt Card' : '✏️ Edit'}
                  </button>
                  <button
                    type="button"
                    className="action-link-btn"
                    onClick={() => copyToClipboard(question, 'Question copied!')}
                  >
                    📋 Copy
                  </button>
                </div>
              </div>

              {/* Active Question Display Card (No scrollbars!) */}
              {isManualQuestionEdit ? (
                <textarea
                  className="question-edit-textarea"
                  placeholder="Type or customize your IELTS question here..."
                  value={question}
                  onChange={(e) => {
                    const val = e.target.value;
                    setQuestion(val);
                    const updated = [...questionsList];
                    updated[currentQuestionIndex] = val;
                    setQuestionsList(updated);
                  }}
                  rows={3}
                />
              ) : (
                <div className="examiner-question-card">
                  <div className="examiner-quote-icon">🗣️</div>
                  <div className="examiner-question-content">
                    <div className="examiner-prefix-label">
                      Examiner asks (Question {currentQuestionIndex + 1}):
                    </div>
                    <h3 className="examiner-question-text">
                      "{question}"
                    </h3>
                  </div>
                </div>
              )}

              {/* Prev / Next Navigation Footer */}
              <div className="question-nav-footer">
                <button
                  type="button"
                  className="btn-nav-prev"
                  onClick={goToPrevQuestion}
                  disabled={currentQuestionIndex === 0}
                  title="Go to previous question"
                >
                  ← Previous Question
                </button>

                <div className="question-nav-indicator">
                  {currentQuestionIndex + 1} / {questionsList.length}
                </div>

                <button
                  type="button"
                  className="btn-nav-next"
                  onClick={goToNextQuestion}
                  disabled={currentQuestionIndex === questionsList.length - 1}
                  title="Go to next question"
                >
                  Next Question →
                </button>
              </div>
            </div>
          ) : (
            <div className="part2-cue-card-container">
              <div className="label-row">
                <label>{ieltsPart === 'Part 2' ? 'IELTS Part 2 Cue Card Prompt:' : 'IELTS Question Prompt:'}</label>
                <div className="action-links">
                  <button
                    type="button"
                    className="action-link-btn"
                    onClick={() => setIsManualQuestionEdit(!isManualQuestionEdit)}
                  >
                    {isManualQuestionEdit ? '👁️ View Card' : '✏️ Edit'}
                  </button>
                  <button
                    type="button"
                    className="action-link-btn"
                    onClick={() => copyToClipboard(question, 'Question copied!')}
                  >
                    📋 Copy
                  </button>
                </div>
              </div>

              {isManualQuestionEdit ? (
                <textarea
                  placeholder="Paste or type question / cue card..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={ieltsPart === 'Part 2' ? 6 : 3}
                />
              ) : (
                <div className="cue-card-display-card">
                  <div className="cue-card-top-tag">
                    {ieltsPart === 'Part 2' ? '📋 Candidate Long-Turn Cue Card (Speak for 1–2 Minutes)' : '🗣️ Examiner Question Prompt'}
                  </div>
                  <div className="cue-card-formatted-body">
                    {question}
                  </div>
                </div>
              )}
            </div>
          )}

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

            <div className={`timer-display ${isRecording ? 'active' : ''} ${isRecording && timer >= 270 ? 'warning' : ''}`}>
              {isRecording ? (
                <>
                  {formatTime(timer)} <span className="timer-max">/ 5:00 max</span>
                </>
              ) : (
                duration ? `Duration: ${formatTime(duration)}` : '0:00'
              )}
            </div>

            {isRecording && timer >= 270 && (
              <div className="limit-warning-badge">
                ⚠️ Approaching 5-minute limit: auto-stop in {300 - timer}s (credit protection)
              </div>
            )}

            <div className="target-pace-hint">
              {ieltsPart === 'Part 1' && 'Target: 20–35s per answer'}
              {ieltsPart === 'Part 2' && 'Target: 1m 45s – 2m 00s'}
              {ieltsPart === 'Part 3' && 'Target: 40–60s per answer'}
              <span className="limit-safe-tag"> • 🛡️ 5-min auto-stop active</span>
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

            {currentQuestionIndex < questionsList.length - 1 ? (
              <button
                className="action-button next-btn highlight-pulse"
                onClick={() => {
                  goToNextQuestion();
                  window.scrollTo({ top: 400, behavior: 'smooth' });
                }}
              >
                ➡️ Proceed to Question {currentQuestionIndex + 2} of {questionsList.length} →
              </button>
            ) : (
              <button
                className="action-button next-btn"
                onClick={() => {
                  if (ieltsPart === 'Part 1') {
                    handlePartChange('Part 2');
                  } else if (ieltsPart === 'Part 2') {
                    handlePartChange('Part 3');
                  } else {
                    handlePartChange('Part 1');
                  }
                  window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
              >
                {ieltsPart === 'Part 1'
                  ? '🎯 Part 1 Complete! Proceed to Part 2 (Cue Card) →'
                  : ieltsPart === 'Part 2'
                  ? '🎯 Part 2 Complete! Proceed to Part 3 (Discussion) →'
                  : '🎉 Speaking Test Finished! Restart / Choose Test →'}
              </button>
            )}
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
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
import httpx
import os
import io
import json
import re
import base64
import logging
import tempfile
from datetime import datetime, timezone
from typing import Optional
from dotenv import load_dotenv

# Load local environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ielts_backend")

# Application Configuration
APP_PASSWORD = os.getenv("APP_PASSWORD", "speaking30").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_EVAL_MODEL = os.getenv("OPENAI_EVAL_MODEL", "gpt-5.6-luna").strip()
OPENAI_TRANSCRIBE_MODEL = os.getenv("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-transcribe").strip()
MAX_AUDIO_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB hard limit (~5 minutes of speech audio)

def get_openai_client():
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured. Please set OPENAI_API_KEY in your environment variables or .env file."
        )
    return OpenAI(
        api_key=api_key,
        http_client=httpx.Client(proxy=None, timeout=60.0)
    )

app = FastAPI(title="IELTS Speaking Pro API (Local & Production)", version="2.0.0")

@app.middleware("http")
async def handle_vercel_rewrite(request: Request, call_next):
    if request.scope.get("path") in ("/api/index.py", "/api/index"):
        q_path = request.query_params.get("__path") or request.query_params.get("path")
        if q_path:
            clean = q_path.lstrip("/")
            request.scope["path"] = f"/api/{clean}" if not clean.startswith("api/") else f"/{clean}"
    return await call_next(request)


# Resolve Build Directory
def resolve_build_dir():
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public"),
        os.path.join(os.getcwd(), "public"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "build"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "build"),
        os.path.join(os.getcwd(), "frontend", "build"),
        os.path.join(os.getcwd(), "build"),
    ]
    for p in candidates:
        if os.path.isdir(p) and os.path.exists(os.path.join(p, "index.html")):
            return p
    return candidates[0]

BUILD_DIR = resolve_build_dir()
STATIC_DIR = os.path.join(BUILD_DIR, "static")

if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_access(
    authorization: Optional[str] = Header(None),
    x_access_token: Optional[str] = Header(None),
    form_token: Optional[str] = Form(None)
):
    """
    Verify the single sign-in password ('speaking30' by default).
    """
    token = None
    if authorization:
        parts = authorization.split(" ")
        token = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else authorization
    elif x_access_token:
        token = x_access_token
    elif form_token:
        token = form_token

    if not token or token.strip() != APP_PASSWORD:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid access password. Please enter the correct password (speaking30)."
        )
    return True


@app.get("/")
@app.get("/index.html")
async def serve_index():
    index_path = os.path.join(BUILD_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, media_type="text/html")
    return HTMLResponse("<h1>IELTS Speaking Pro</h1><p>Frontend is loading...</p>")


@app.get("/api")
async def root_status():
    return {
        "status": "online",
        "service": "IELTS Speaking Pro API",
        "eval_model": OPENAI_EVAL_MODEL,
        "transcribe_model": OPENAI_TRANSCRIBE_MODEL,
        "docs": "/docs"
    }


@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "api_key_configured": bool(OPENAI_API_KEY),
        "eval_model": OPENAI_EVAL_MODEL,
        "transcribe_model": OPENAI_TRANSCRIBE_MODEL
    }


IN_MEMORY_LOGINS = []
GITHUB_REPO = os.getenv("GITHUB_REPO", "abdurraafay90/IELTS-Speaking-pro").strip()
GITHUB_LOG_BRANCH = os.getenv("GITHUB_LOG_BRANCH", "main").strip()
GITHUB_LOG_PATH = "candidate_logins.txt"


def sync_login_to_github(entry: str) -> bool:
    """
    Persistently commit candidate logins directly to candidate_logins.txt in GitHub repo.
    This guarantees permanent retention even when Vercel serverless containers restart.
    """
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if not token:
        logger.info("ℹ️ GITHUB_TOKEN not configured. Logins stored in local/container storage.")
        return False

    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_LOG_PATH}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "IELTS-Speaking-Pro-Logger"
    }

    try:
        existing_text = ""
        sha = None

        with httpx.Client(timeout=10.0) as client:
            get_res = client.get(f"{url}?ref={GITHUB_LOG_BRANCH}", headers=headers)
            if get_res.status_code == 200:
                data = get_res.json()
                sha = data.get("sha")
                raw_b64 = data.get("content", "").replace("\n", "")
                existing_text = base64.b64decode(raw_b64).decode("utf-8", errors="ignore")
            elif get_res.status_code != 404:
                logger.warning(f"Could not read {GITHUB_LOG_PATH} from GitHub: {get_res.status_code}")
                return False

            if not existing_text.strip():
                updated_content = f"# Candidate Logins Log (IELTS Speaking Pro)\n\n{entry}"
            else:
                updated_content = existing_text.rstrip("\n") + "\n" + entry

            new_b64 = base64.b64encode(updated_content.encode("utf-8")).decode("utf-8")
            payload = {
                "message": f"log(candidate): {entry.strip().split('|')[0]}",
                "content": new_b64,
                "branch": GITHUB_LOG_BRANCH
            }
            if sha:
                payload["sha"] = sha

            put_res = client.put(url, headers=headers, json=payload)
            if put_res.status_code in (200, 201):
                logger.info(f"✅ Successfully committed candidate login to GitHub repo ({GITHUB_LOG_PATH})")
                return True
            else:
                logger.warning(f"Failed to commit login to GitHub: {put_res.status_code} {put_res.text}")
                return False
    except Exception as e:
        logger.warning(f"GitHub login sync error: {str(e)}")
        return False


def record_candidate_login(name: str, client_ip: str = "unknown", user_agent: str = ""):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    clean_agent = user_agent.replace("\n", " ")[:60] if user_agent else "Browser"
    entry = f"[{ts}] Candidate: {name} | IP: {client_ip} | Device: {clean_agent}\n"
    
    IN_MEMORY_LOGINS.append(entry)
    logger.info(f"👤 [CANDIDATE_LOGIN] Name='{name}' | IP={client_ip} | Time={ts}")
    
    paths = [
        os.path.join(tempfile.gettempdir(), "candidate_logins.txt"),
        os.path.join(os.getcwd(), "candidate_logins.txt"),
    ]
    for p in paths:
        try:
            with open(p, "a", encoding="utf-8") as f:
                f.write(entry)
        except Exception:
            pass

    # Automatically commit to GitHub if GITHUB_TOKEN is set
    try:
        sync_login_to_github(entry)
    except Exception as e:
        logger.warning(f"sync_login_to_github call failed: {e}")


def get_all_recorded_logins() -> str:
    # 1. Attempt to fetch master permanent log file directly from GitHub
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_LOG_PATH}?ref={GITHUB_LOG_BRANCH}"
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "IELTS-Speaking-Pro-Logger"
            }
            with httpx.Client(timeout=10.0) as client:
                res = client.get(url, headers=headers)
                if res.status_code == 200:
                    raw_b64 = res.json().get("content", "").replace("\n", "")
                    github_text = base64.b64decode(raw_b64).decode("utf-8", errors="ignore")
                    if github_text.strip():
                        return github_text
        except Exception as e:
            logger.warning(f"Could not load logins from GitHub: {e}")

    # 2. Fallback to in-memory + local file
    lines = list(IN_MEMORY_LOGINS)
    paths = [
        os.path.join(tempfile.gettempdir(), "candidate_logins.txt"),
        os.path.join(os.getcwd(), "candidate_logins.txt"),
    ]
    for p in paths:
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip() and line not in lines:
                            lines.append(line)
            except Exception:
                pass
    if not lines:
        return "# Candidate Logins Log\n\nNo logins recorded yet.\n"
    return "# Candidate Logins Log (IELTS Speaking Pro)\n\n" + "".join(lines)


@app.post("/verify-password")
@app.post("/api/verify-password")
async def verify_password_endpoint(payload: dict, request: Request):
    password = payload.get("password", "").strip()
    username = payload.get("username", "").strip() or payload.get("name", "").strip()
    if password == APP_PASSWORD:
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "")
        candidate_name = username if username else "Anonymous Candidate"
        record_candidate_login(candidate_name, client_ip, user_agent)
        return {"valid": True, "message": "Authenticated successfully"}
    return JSONResponse(
        status_code=401,
        content={"valid": False, "message": "Invalid access password"}
    )


@app.post("/api/log-login")
@app.post("/log-login")
async def log_login_endpoint(payload: dict, request: Request):
    password = payload.get("password", "").strip()
    username = payload.get("username", "").strip() or payload.get("name", "").strip()
    if password == APP_PASSWORD and username:
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "")
        record_candidate_login(username, client_ip, user_agent)
        return {"logged": True, "candidate": username}
    return JSONResponse(status_code=401, content={"logged": False, "message": "Invalid credentials"})


@app.get("/api/logins")
@app.get("/logins")
@app.get("/api/download-logins")
@app.get("/download-logins")
async def get_logins_endpoint(
    request: Request,
    token: Optional[str] = None,
    download: Optional[bool] = False,
    authorization: Optional[str] = Header(None)
):
    auth_token = token
    if not auth_token and authorization:
        parts = authorization.split(" ")
        auth_token = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else authorization
        
    if not auth_token or auth_token.strip() != APP_PASSWORD:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Access to candidate logins requires valid password (e.g. ?token=speaking30)."
        )
    content = get_all_recorded_logins()
    headers = {}
    if download or "download-logins" in request.url.path:
        headers["Content-Disposition"] = 'attachment; filename="candidate_logins.txt"'
    return PlainTextResponse(content=content, headers=headers)


async def transcribe_audio_stream(audio_bytes: bytes, filename: str) -> str:
    audio_io = io.BytesIO(audio_bytes)
    audio_io.name = filename if filename else "recording.webm"

    models_to_try = [OPENAI_TRANSCRIBE_MODEL, "whisper-1", "gpt-4o-mini-transcribe"]
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

    client = get_openai_client()
    for model_name in models_to_try:
        try:
            audio_io.seek(0)
            logger.info(f"Transcribing audio with model: {model_name}")
            transcription = client.audio.transcriptions.create(
                model=model_name,
                file=audio_io,
                response_format="text"
            )
            return transcription
        except Exception as e:
            logger.warning(f"Transcription failed with model {model_name}: {str(e)}")
            last_error = e

    raise HTTPException(status_code=500, detail=f"Speech transcription failed: {str(last_error)}")


# Set of common Whisper / STT hallucinations and artifacts on silence or low background noise
WHISPER_SILENCE_HALLUCINATIONS = {
    "thank you", "thank you.", "thank you very much", "thank you very much.",
    "thank you so much", "thank you so much.", "thanks for watching", 
    "thanks for watching!", "thank you for watching", "thank you for watching.",
    "please subscribe", "subscribe", "subtitles by", "transcribed by",
    "amara.org", "you", "bye", "bye bye", "goodbye", "the end",
    "[silence]", "[blank_audio]", "[applause]", "[laughter]", "[music]",
    "(music)", "(bell rings)", "(silence)", "♪", "♫", "so", "yeah", "yes",
    "no", "okay", "ok", "um", "uh", "huh", "oh", "ah", "hello", "hi"
}

TESTING_PATTERNS = [
    r"^test(ing)?(\s+(one|two|three|1|2|3|mic|microphone))+",
    r"^(can\s+you\s+hear\s+me|is\s+this\s+working|mic\s+check)",
    r"^(hello\s+hello|check\s+check|1\s+2\s+3)",
]

def check_hardcoded_meaningless(transcript: str) -> tuple[bool, str]:
    """
    Tier 1: 0-token, 0ms hardcoded gatekeeper.
    Instantly detects empty speech, silence, Whisper static hallucinations, and ultra-brief non-answers.
    """
    if not transcript or not transcript.strip() or transcript.strip() == "[Empty Recording]":
        return True, "The recording was empty or captured only silence."

    clean_text = transcript.strip().lower()
    normalized = re.sub(r"[^\w\s]", "", clean_text).strip()

    if not normalized:
        return True, "The recording contained only background noise, clicks, or unidentifiable sound."

    if clean_text in WHISPER_SILENCE_HALLUCINATIONS or normalized in WHISPER_SILENCE_HALLUCINATIONS:
        return True, "No substantive speech detected (audio contained ambient silence or background artifacts)."

    words = re.findall(r"\b[a-zA-Z0-9']+\b", clean_text)
    if len(words) < 4:
        return True, f"Response was too brief ({len(words)} word{'s' if len(words) != 1 else ''}) to evaluate against IELTS criteria. An IELTS response requires complete spoken sentences."

    for pat in TESTING_PATTERNS:
        if re.search(pat, clean_text):
            return True, "The recording appears to be a microphone check ('1 2 3' / 'mic test') rather than an attempted answer to the question."

    return False, ""


def validate_short_response_with_mini(client: OpenAI, transcript: str, question: str) -> tuple[bool, str]:
    """
    Tier 2: Micro-call to gpt-4o-mini (< 50 tokens, ~$0.000005) for borderline / short answers (4 to 14 words).
    Verifies whether the text is an attempted spoken answer or off-topic chatter / mic test.
    """
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an IELTS speech gatekeeper. Determine if the candidate's transcript "
                        "contains an actual attempt to answer the speaking question, or if it is merely "
                        "off-topic chit-chat, microphone testing, asking if anyone is listening, or filler noise.\n"
                        "Respond ONLY with valid JSON: {\"is_meaningful\": true/false, \"reason\": \"<short 1-sentence explanation>\"}"
                    )
                },
                {
                    "role": "user",
                    "content": f"Question: {question}\nCandidate Transcript: \"{transcript}\""
                }
            ],
            temperature=0.0,
            max_tokens=60,
            response_format={"type": "json_object"}
        )
        content = completion.choices[0].message.content
        data = json.loads(content)
        is_meaningful = bool(data.get("is_meaningful", True))
        reason = data.get("reason", "The response does not appear to address the target question.")
        return is_meaningful, reason
    except Exception as e:
        logger.warning(f"Mini gatekeeper check skipped due to error: {str(e)}")
        # If check fails, gracefully default to True so legitimate candidates are never blocked
        return True, ""


async def evaluate_speaking_response(
    transcript: str,
    question: str,
    ielts_part: str,
    custom_system_prompt: Optional[str] = None
) -> dict:
    """
    Evaluate candidate's response against official IELTS Speaking criteria.
    Employs a multi-tier token-saving pipeline:
    1. Tier 1: 0-token hardcoded filter for silence, hallucinations, and ultra-short audio.
    2. Tier 2: Micro-call with gpt-4o-mini (~40 tokens) for short answers (4-14 words).
    3. Tier 3: Full Senior Examiner evaluation with gpt-5.6-luna only for genuine answers.
    """
    # 1. Tier 1: Hardcoded pre-filter (Free, 0ms, 0 tokens)
    is_meaningless, reason = check_hardcoded_meaningless(transcript)
    if is_meaningless:
        logger.info(f"🚫 Hardcoded filter rejected non-answer: '{transcript}' -> {reason}")
        return {
            "transcript": transcript if transcript and transcript.strip() else "[Empty Recording]",
            "evaluation": (
                f"### **Overall Band Score: N/A**\n\n"
                f"> ⚠️ **No Spoken Answer Detected**\n>\n"
                f"> {reason}\n>\n"
                f"> **Target Question:** *\"{question}\"*\n\n"
                f"**Tip for IELTS Candidates:** The IELTS examiner requires continuous spoken speech to evaluate Fluency, Lexical Resource, Grammatical Range, and Delivery. Please record a full spoken response (at least 2–4 sentences for Part 1, 1–2 minutes for Part 2)."
            ),
            "model_used": "pre-check-filter"
        }

    # 2. Tier 2: Micro-gatekeeper with gpt-4o-mini for borderline / short responses (4 to 14 words)
    words = re.findall(r"\b[a-zA-Z0-9']+\b", transcript.lower())
    if 4 <= len(words) <= 14:
        try:
            client = get_openai_client()
            is_meaningful, mini_reason = validate_short_response_with_mini(client, transcript, question)
            if not is_meaningful:
                logger.info(f"🚫 gpt-4o-mini gatekeeper rejected short non-answer: '{transcript}' -> {mini_reason}")
                return {
                    "transcript": transcript,
                    "evaluation": (
                        f"### **Overall Band Score: N/A**\n\n"
                        f"> ⚠️ **Response Does Not Address Question**\n>\n"
                        f"> {mini_reason}\n>\n"
                        f"> **Target Question:** *\"{question}\"*\n\n"
                        f"**Tip for IELTS Candidates:** Please speak an actual answer to the question. Even a simple 2–3 sentence response will allow the examiner to calculate your band score."
                    ),
                    "model_used": "gatekeeper-gpt-4o-mini"
                }
        except Exception as e:
            logger.warning(f"Could not run mini gatekeeper check, proceeding to main model: {e}")

    system_prompt = custom_system_prompt or """You are a Senior, Official IELTS Speaking Examiner accredited by the British Council and IDP.
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
- Account for Speech-to-Text (STT) glitches: If a transcribed word is odd but phonetically sounds like a logical English word in context (e.g. 'candidacy' -> 'candidate see', 'there' -> 'their'), evaluate their intended linguistic competence and do not penalize unfairly.
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
"""

    user_content = f"""IELTS Speaking Section: {ielts_part}
Target Question / Cue Card: {question}

Candidate Spoken Transcript:
\"\"\"{transcript}\"\"\"

Please provide your rigorous examiner evaluation and band score."""

    models_to_try = [OPENAI_EVAL_MODEL, "gpt-4o", "gpt-4o-mini"]
    seen = set()
    models_to_try = [m for m in models_to_try if not (m in seen or seen.add(m))]

    last_error = None
    client = get_openai_client()
    for model_name in models_to_try:
        try:
            logger.info(f"Evaluating speaking response using model: {model_name}")
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.4,
                max_tokens=2500
            )

            evaluation = response.choices[0].message.content
            if evaluation and evaluation.strip():
                return {
                    "transcript": transcript,
                    "evaluation": evaluation,
                    "model_used": model_name
                }
        except Exception as e:
            logger.warning(f"Evaluation failed with model {model_name}: {str(e)}")
            last_error = e

    raise HTTPException(status_code=500, detail=f"Scoring evaluation failed: {str(last_error)}")


@app.post("/transcribe")
@app.post("/api/transcribe")
async def transcribe_endpoint(
    audio_file: UploadFile = File(...),
    auth: bool = Depends(verify_access)
):
    try:
        content = await audio_file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")
        if len(content) > MAX_AUDIO_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Audio file exceeds the maximum 5-minute limit (15MB ceiling). Size was {len(content) / (1024*1024):.1f}MB. Upload aborted to protect OpenAI credits."
            )
        transcript = await transcribe_audio_stream(content, audio_file.filename)
        return {"transcript": transcript}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription error: {str(e)}")


@app.post("/transcribe-and-score")
@app.post("/api/transcribe-and-score")
async def transcribe_and_score_endpoint(
    audio_file: UploadFile = File(...),
    question: str = Form(...),
    ielts_part: str = Form(...),
    system_prompt: Optional[str] = Form(None),
    auth: bool = Depends(verify_access)
):
    try:
        content = await audio_file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded audio file is empty.")
        if len(content) > MAX_AUDIO_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Audio file exceeds the maximum 5-minute limit (15MB ceiling). Size was {len(content) / (1024*1024):.1f}MB. Upload aborted to protect OpenAI credits."
            )

        transcript = await transcribe_audio_stream(content, audio_file.filename)

        evaluation_result = await evaluate_speaking_response(
            transcript=transcript,
            question=question,
            ielts_part=ielts_part,
            custom_system_prompt=system_prompt
        )

        return {
            "transcript": transcript,
            "evaluation": evaluation_result["evaluation"],
            "model_used": evaluation_result.get("model_used", OPENAI_EVAL_MODEL),
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Process error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.get("/{full_path:path}")
async def serve_spa_frontend(full_path: str = ""):
    clean = full_path.strip("/")
    if clean.startswith("api/") or clean.startswith("docs") or clean.startswith("openapi.json"):
        raise HTTPException(status_code=404, detail="Not Found")
    
    direct_file = os.path.join(BUILD_DIR, clean)
    if os.path.isfile(direct_file):
        return FileResponse(direct_file)
        
    index_path = os.path.join(BUILD_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path, media_type="text/html")
        
    raise HTTPException(status_code=404, detail="Not Found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
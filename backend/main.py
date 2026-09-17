from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
import httpx
import os
import io
import json
import logging
from datetime import datetime
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


@app.post("/verify-password")
@app.post("/api/verify-password")
async def verify_password_endpoint(payload: dict):
    password = payload.get("password", "").strip()
    if password == APP_PASSWORD:
        return {"valid": True, "message": "Authenticated successfully"}
    return JSONResponse(
        status_code=401,
        content={"valid": False, "message": "Invalid access password"}
    )


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


async def evaluate_speaking_response(
    transcript: str,
    question: str,
    ielts_part: str,
    custom_system_prompt: Optional[str] = None
) -> dict:
    if not transcript or not transcript.strip() or transcript.strip() == "[Empty Recording]":
        return {
            "transcript": "[Empty Recording]",
            "evaluation": "### **Overall Band Score: N/A**\n\nThe recording was empty or could not capture clear speech. Please ensure your microphone is enabled and speak clearly into your device."
        }

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
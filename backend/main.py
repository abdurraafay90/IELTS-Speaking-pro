from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from openai import OpenAI
import httpx
import os
import uuid
import json
from dotenv import load_dotenv
import asyncio
from datetime import datetime
import logging

# Load environment variables
load_dotenv()

# Configure OpenAI client with a custom httpx client to avoid proxy-related TypeErrors
# This happens in some environments where the OpenAI library tries to pass 'proxies' 
# to an underlying httpx version that doesn't expect it.
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=httpx.Client(proxy=None)
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="IELTS Speaking Practice API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories if they don't exist
UPLOAD_DIR = "uploads"
TRANSCRIPTS_DIR = "transcripts"
SCORES_DIR = "scores"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)
os.makedirs(SCORES_DIR, exist_ok=True)

async def score_transcript(transcript: str, question: str, ielts_part: str, system_prompt: str) -> dict:
    """
    Score the transcript using OpenAI's API with IELTS evaluation criteria
    """
    try:
        if not transcript.strip():
            logger.warning("Scoring aborted: Transcript is empty.")
            return {
                "transcript": "[Empty Recording]",
                "evaluation": "The transcript was empty. Please ensure your microphone is working and you spoke during the recording.",
                "timestamp": datetime.now().isoformat(),
                "question": question,
                "ielts_part": ielts_part
            }

        logger.info(f"Sending scoring request to gpt-5-nano for transcript of length {len(transcript)}...")

        evaluation = ""
        max_retries = 3
        
        for attempt in range(max_retries):
            response = client.chat.completions.create(
                model="gpt-5-nano",
                messages=[
                    {"role": "developer", "content": system_prompt},
                    {"role": "user", "content": f"CONTEXT: IELTS {ielts_part}\nQuestion: {question}\n\nTRANSCRIPT:\n{transcript}\n\nPlease evaluate."}
                ],
                max_completion_tokens=16000
            )

            # Log details for debugging
            finish_reason = response.choices[0].finish_reason
            usage = getattr(response, 'usage', None)
            logger.info(f"Attempt {attempt + 1}: finish_reason={finish_reason}, usage={usage}")
            
            evaluation = response.choices[0].message.content
            
            if evaluation is not None and str(evaluation).strip() != "":
                # We got a valid response, break out of the retry loop
                break
                
            logger.warning(f"Attempt {attempt + 1}: Model returned an empty evaluation string (Finish Reason: {finish_reason}). Retrying...")
            await asyncio.sleep(1) # Wait a second before retrying
        
        if evaluation is None or str(evaluation).strip() == "":
            logger.error("All retries failed. Model consistently returned empty responses.")
            last_finish_reason = response.choices[0].finish_reason if 'response' in locals() else "unknown"
            evaluation = f"Error: The model 'gpt-5-nano' processed the request {max_retries} times but consistently returned an empty response (Last Finish Reason: {last_finish_reason}). This usually means the prompt was rejected by a safety filter, tokens were exhausted by reasoning, or the model encountered an internal generation error."
        else:
            logger.info(f"Successfully generated evaluation. Length: {len(evaluation)} characters.")

        scores_data = {
            "transcript": transcript,
            "evaluation": evaluation,
            "timestamp": datetime.now().isoformat(),
            "question": question,
            "ielts_part": ielts_part
        }

        return scores_data

    except Exception as e:
        logger.error(f"Scoring error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scoring failed: {str(e)}")

async def score_essay(essay: str, question: str, task_type: str, system_prompt: str) -> dict:
    """
    Score the essay using OpenAI's API with IELTS evaluation criteria
    """
    try:
        if not essay.strip():
            logger.warning("Scoring aborted: Essay is empty.")
            return {
                "essay": "[Empty Essay]",
                "evaluation": "The essay was empty. Please write your response before submitting.",
                "timestamp": datetime.now().isoformat(),
                "question": question,
                "task_type": task_type
            }

        logger.info(f"Sending writing scoring request to gpt-4o-mini for essay of length {len(essay)}...")

        evaluation = ""
        max_retries = 3
        
        for attempt in range(max_retries):
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "developer", "content": system_prompt},
                    {"role": "user", "content": f"CONTEXT: IELTS Writing {task_type}\nQuestion: {question}\n\nESSAY:\n{essay}\n\nPlease evaluate."}
                ],
                max_completion_tokens=4000
            )

            evaluation = response.choices[0].message.content
            
            if evaluation is not None and str(evaluation).strip() != "":
                break
                
            logger.warning(f"Attempt {attempt + 1}: Model returned an empty evaluation string. Retrying...")
            await asyncio.sleep(1)
        
        if evaluation is None or str(evaluation).strip() == "":
            evaluation = f"Error: The model 'gpt-4o-mini' failed to return a response after {max_retries} attempts."

        scores_data = {
            "essay": essay,
            "evaluation": evaluation,
            "timestamp": datetime.now().isoformat(),
            "question": question,
            "task_type": task_type
        }

        return scores_data

    except Exception as e:
        logger.error(f"Writing scoring error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Writing scoring failed: {str(e)}")

@app.post("/evaluate-writing")
async def evaluate_writing(
    essay: str = Form(...),
    question: str = Form(...),
    task_type: str = Form(...),
    system_prompt: str = Form(...)
):
    """
    Evaluate an IELTS writing essay
    """
    try:
        scores_data = await score_essay(essay, question, task_type, system_prompt)

        # Save scoring results to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        score_filename = f"writing_score_{timestamp}.json"
        score_path = os.path.join(SCORES_DIR, score_filename)

        with open(score_path, "w", encoding="utf-8") as f:
            json.dump(scores_data, f, indent=2, ensure_ascii=False)

        return JSONResponse(content={
            "evaluation": scores_data["evaluation"],
            "filename": score_filename
        })

    except Exception as e:
        logger.error(f"Writing evaluation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Writing evaluation failed: {str(e)}")

@app.post("/config-api")
async def config_api(api_key: str = Form(...)):
    """
    Update the OpenAI API key in .env and re-initialize the client
    """
    try:
        # Validate the key with a simple test call
        test_client = OpenAI(api_key=api_key, http_client=httpx.Client(proxy=None))
        try:
            test_client.models.list()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid API Key: Could not connect to OpenAI")

        # Update .env file
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        with open(env_path, "w") as f:
            f.write(f'OPENAI_API_KEY="{api_key}"')
        
        # Live update the global client
        global client
        client = test_client
        
        logger.info("API Key updated and verified successfully.")
        return JSONResponse(content={"status": "success", "message": "API Key configured successfully!"})

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"API Config error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save API key: {str(e)}")

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return HTMLResponse(content="<h1>IELTS API Working</h1>")

@app.post("/transcribe")
async def transcribe_audio(audio_file: UploadFile = File(...)):
    # Original logic...
    pass

@app.post("/transcribe-and-score")
async def transcribe_and_score_audio(
    audio_file: UploadFile = File(...),
    question: str = Form(...),
    ielts_part: str = Form(...),
    system_prompt: str = Form(...)
):
    try:
        if not audio_file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")
        unique_filename = f"{uuid.uuid4()}_{audio_file.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        with open(file_path, "wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)
        import io
        with open(file_path, "rb") as audio_file_handle:
            audio_content = audio_file_handle.read()
        audio_file_io = io.BytesIO(audio_content)
        audio_file_io.name = os.path.basename(file_path)
        transcription = client.audio.transcriptions.create(
            model="gpt-4o-mini-transcribe",
            file=audio_file_io,
            response_format="text"
        )
        transcript = transcription
        scores_data = await score_transcript(transcript, question, ielts_part, system_prompt)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        score_filename = f"score_{timestamp}.json"
        score_path = os.path.join(SCORES_DIR, score_filename)
        with open(score_path, "w", encoding="utf-8") as f:
            json.dump(scores_data, f, indent=2, ensure_ascii=False)
        if os.path.exists(file_path):
            os.remove(file_path)
        return JSONResponse(content={
            "transcript": transcript,
            "evaluation": scores_data["evaluation"],
            "filename": score_filename
        })
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

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

        # Create the evaluation prompt
        evaluation_prompt = f"""
        IELTS Speaking Part: {ielts_part}
        Question: {question}
        
        Transcript of the candidate's response:
        "{transcript}"

        Please evaluate this response based on the provided criteria.
        """

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
                max_completion_tokens=4000
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

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return HTMLResponse(content="""
    <!DOCTYPE html>
    <html>
    <head>
        <title>IELTS Speaking Practice</title>
        <meta charset="utf-8">
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .container {
                background: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #2c3e50;
                text-align: center;
            }
            .recorder-container {
                text-align: center;
                margin: 30px 0;
            }
            #recordButton {
                background-color: #3498db;
                color: white;
                border: none;
                padding: 15px 30px;
                font-size: 18px;
                border-radius: 5px;
                cursor: pointer;
                margin: 10px;
            }
            #recordButton.recording {
                background-color: #e74c3c;
            }
            #status {
                margin: 20px 0;
                font-weight: bold;
            }
            #transcript {
                background-color: #f8f9fa;
                border: 1px solid #ddd;
                border-radius: 5px;
                padding: 15px;
                margin: 20px 0;
                min-height: 100px;
                white-space: pre-wrap;
                font-family: monospace;
            }
            .save-btn {
                background-color: #27ae60;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
            }
            .file-info {
                margin: 10px 0;
                color: #7f8c8d;
                font-style: italic;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>IELTS Speaking Practice Recorder</h1>
            <p>Record your speech and get it transcribed for IELTS practice and feedback.</p>

            <div class="recorder-container">
                <button id="recordButton">Start Recording</button>
                <div id="status">Ready to record</div>
                <div id="recorderInfo" class="file-info"></div>
            </div>

            <div id="transcript">Transcript will appear here...</div>
            <button id="saveButton" class="save-btn" onclick="saveTranscript()">Save Transcript</button>
        </div>

        <script>
            let mediaRecorder;
            let audioChunks = [];
            let isRecording = false;
            let audioContext;
            let audioBlob;

            const recordButton = document.getElementById('recordButton');
            const statusDiv = document.getElementById('status');
            const transcriptDiv = document.getElementById('transcript');
            const recorderInfo = document.getElementById('recorderInfo');

            recordButton.addEventListener('click', async () => {
                if (!isRecording) {
                    startRecording();
                } else {
                    stopRecording();
                }
            });

            async function startRecording() {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];

                    mediaRecorder.ondataavailable = event => {
                        audioChunks.push(event.data);
                    };

                    mediaRecorder.onstop = async () => {
                        audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                        stream.getTracks().forEach(track => track.stop());

                        statusDiv.textContent = 'Processing transcription...';
                        const transcript = await sendAudioForTranscription(audioBlob);
                        transcriptDiv.textContent = transcript;
                        statusDiv.textContent = 'Transcription complete!';

                        // Show file info
                        const sizeInMB = (audioBlob.size / (1024 * 1024)).toFixed(2);
                        recorderInfo.textContent = `Recorded: ${new Date().toLocaleString()}, Size: ${sizeInMB}MB`;
                    };

                    mediaRecorder.start();
                    isRecording = true;
                    recordButton.textContent = 'Stop Recording';
                    recordButton.classList.add('recording');
                    statusDiv.textContent = 'Recording...';
                } catch (error) {
                    console.error('Error accessing microphone:', error);
                    statusDiv.textContent = 'Error: Could not access microphone. Please check permissions.';
                }
            }

            function stopRecording() {
                if (mediaRecorder && isRecording) {
                    mediaRecorder.stop();
                    isRecording = false;
                    recordButton.textContent = 'Start Recording';
                    recordButton.classList.remove('recording');
                }
            }

            async function sendAudioForTranscription(blob) {
                const formData = new FormData();
                formData.append('audio_file', blob, 'recording.webm');

                try {
                    const response = await fetch('/transcribe', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        const error = await response.text();
                        throw new Error(error);
                    }

                    const data = await response.json();
                    return data.transcript;
                } catch (error) {
                    console.error('Transcription error:', error);
                    return `Error: ${error.message}`;
                }
            }

            function saveTranscript() {
                const content = transcriptDiv.textContent;
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `ielts_transcript_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        </script>
    </body>
    </html>
    """)


@app.post("/transcribe")
async def transcribe_audio(audio_file: UploadFile = File(...)):
    """
    Transcribe uploaded audio file using OpenAI's gpt-4o-mini-transcribe model
    """
    try:
        # Validate file type
        if not audio_file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")

        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}_{audio_file.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        # Save uploaded file
        with open(file_path, "wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)

        logger.info(f"Saved audio file: {file_path}")

        # Transcribe using OpenAI API with gpt-4o-mini-transcribe
        # Use a BytesIO object with a name to avoid external tool probing
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

        # Save transcript to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        transcript_filename = f"transcript_{timestamp}.txt"
        transcript_path = os.path.join(TRANSCRIPTS_DIR, transcript_filename)

        with open(transcript_path, "w", encoding="utf-8") as f:
            f.write(transcript)

        logger.info(f"Saved transcript: {transcript_path}")

        # Clean up the uploaded audio file after processing
        if os.path.exists(file_path):
            os.remove(file_path)

        return JSONResponse(content={"transcript": transcript, "filename": transcript_filename})

    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        # Clean up any files that were created before the error
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")


@app.post("/transcribe-and-score")
async def transcribe_and_score_audio(
    audio_file: UploadFile = File(...),
    question: str = Form(...),
    ielts_part: str = Form(...),
    system_prompt: str = Form(...)
):
    """
    Transcribe uploaded audio file and score it using OpenAI's models
    """
    try:
        # Validate file type
        if not audio_file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="File must be an audio file")

        # Generate unique filename
        unique_filename = f"{uuid.uuid4()}_{audio_file.filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        # Save uploaded file
        with open(file_path, "wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)

        logger.info(f"Saved audio file: {file_path}")

        # Transcribe using OpenAI API
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

        # Score the transcript
        scores_data = await score_transcript(transcript, question, ielts_part, system_prompt)

        # Save scoring results to file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        score_filename = f"score_{timestamp}.json"
        score_path = os.path.join(SCORES_DIR, score_filename)

        with open(score_path, "w", encoding="utf-8") as f:
            json.dump(scores_data, f, indent=2, ensure_ascii=False)

        logger.info(f"Saved score: {score_path}")

        # Clean up the uploaded audio file after processing
        if os.path.exists(file_path):
            os.remove(file_path)

        return JSONResponse(content={
            "transcript": transcript,
            "evaluation": scores_data["evaluation"],
            "filename": score_filename
        })

    except Exception as e:
        logger.error(f"Transcription and scoring error: {str(e)}")
        # Clean up any files that were created before the error
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Transcription and scoring failed: {str(e)}")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
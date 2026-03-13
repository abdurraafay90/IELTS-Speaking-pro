import os
import time
import json
from openai import OpenAI
from dotenv import load_dotenv
import httpx

# Load environment variables
load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=httpx.Client(proxy=None)
)

def test_model():
    print("Testing gpt-5-nano with reasoning_effort='low'...")
    start_time = time.time()
    try:
        response = client.chat.completions.create(
            model="gpt-5-nano",
            messages=[
                {"role": "user", "content": "Say hello in 5 words."}
            ],
            max_completion_tokens=10000,
            reasoning_effort="low"
        )
        end_time = time.time()
        print(f"Response Content: '{response.choices[0].message.content}'")
        print(f"Finish Reason: {response.choices[0].finish_reason}")
        print(f"Usage: {response.usage}")
        print(f"Time taken: {end_time - start_time:.2f} seconds")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_model()

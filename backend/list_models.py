import os
from openai import OpenAI
from dotenv import load_dotenv
import httpx

# Load environment variables
load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    http_client=httpx.Client(proxy=None)
)

def list_models():
    try:
        models = client.models.list()
        print("Available Models:")
        for model in models.data:
            print(f"- {model.id}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models()

from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

class ProcessRequest(BaseModel):
    text: str
    sourceLang: str = "en-IN"

class ProcessResponse(BaseModel):
    simplified: str
    language: str
    emotion: str
    islGloss: List[str]

@app.get("/health")
def health():
    return {"status": "ok", "service": "nlp-service"}


# ---------------------------------------------------
# TEXT SIMPLIFICATION (simple rule-based)
# ---------------------------------------------------

COMPLEX_TO_SIMPLE = {
    "approximately": "about",
    "utilize": "use",
    "individuals": "people",
    "numerous": "many",
    "commence": "start",
    "conclude": "end",
    "assistance": "help",
    "significant": "important",
    "objective": "goal",
}

def simplify_text(text: str) -> str:
    # Replace complex terms
    words = text.split()
    new_words = [
        COMPLEX_TO_SIMPLE.get(w.lower(), w)
        for w in words
    ]
    simplified = " ".join(new_words)

    # Split long sentences
    if len(simplified.split()) > 14:
        parts = simplified.split(" and ")
        simplified = ". ".join(parts)

    return simplified.strip()


# ---------------------------------------------------
# EMOTION DETECTION (simple lexicon-based)
# ---------------------------------------------------

EMOTION_KEYWORDS = {
    "anger": ["angry", "furious", "hate", "upset", "frustrated"],
    "happy": ["happy", "joy", "glad", "excited", "delighted"],
    "sad": ["sad", "unhappy", "cry", "depressed", "heartbroken"],
    "fear": ["afraid", "scared", "fearful", "terrified"],
}

def detect_emotion(text: str) -> str:
    lower = text.lower()
    for emotion, keywords in EMOTION_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return emotion
    return "neutral"


# ---------------------------------------------------
# ISL GLOSS (simple keyword extraction)
# ---------------------------------------------------

STOPWORDS = {"is", "am", "are", "the", "a", "an", "to", "of", "and", "for", "in"}

def generate_gloss(text: str) -> List[str]:
    words = text.upper().split()
    gloss = [w for w in words if w.lower() not in STOPWORDS]
    # Limit gloss tokens for now
    return gloss[:5]


# ---------------------------------------------------
# PROCESS ENDPOINT
# ---------------------------------------------------

@app.post("/process", response_model=ProcessResponse)
def process(req: ProcessRequest):
    original = req.text

    simplified = simplify_text(original)
    emotion = detect_emotion(original)
    gloss = generate_gloss(original)

    return ProcessResponse(
        simplified=simplified,
        language=req.sourceLang,
        emotion=emotion,
        islGloss=gloss
    )

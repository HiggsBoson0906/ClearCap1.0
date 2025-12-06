import argparse
import os
import time
import uuid
import subprocess
import json
import shutil

import boto3
import requests
from dotenv import load_dotenv

load_dotenv()

# === ENV ===
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
AUDIO_BUCKET = os.getenv("CLEARCAP_AUDIO_BUCKET")
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:5000")
NLP_BASE_URL = os.getenv("NLP_BASE_URL", "http://127.0.0.1:8000")

FFMPEG_EXE = os.getenv("FFMPEG_EXE", "ffmpeg")  # chocolatey ffmpeg


 # update if installed elsewhere

s3 = boto3.client("s3", region_name=AWS_REGION)
transcribe = boto3.client("transcribe", region_name=AWS_REGION)
translate = boto3.client("translate", region_name=AWS_REGION)
def normalize_lang_code(code: str) -> str:
    """
    Convert BCP-47 like 'en-IN' to 'en' for Translate/NLP.
    """
    if not code:
        return "en"
    return code.split("-")[0]


# --------------------------------------------------------
# 1) Download FIRST 30 seconds of audio using yt-dlp
# --------------------------------------------------------
def download_audio(url: str) -> str:
    """
    Download full YouTube audio as low-quality MP3 (fast),
    then trim it to the first 30 seconds using ffmpeg.
    Returns the path to the trimmed MP3.
    """
    os.makedirs("downloads", exist_ok=True)
    out_tmpl = os.path.join("downloads", "%(id)s.%(ext)s")

    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format", "mp3",
        "-f", "worstaudio",
        "-o", out_tmpl,
        url,
    ]

    print("RUN:", " ".join(cmd))
    subprocess.run(cmd, check=True)

    files = sorted(
        [
            os.path.join("downloads", f)
            for f in os.listdir("downloads")
            if f.lower().endswith(".mp3")
        ],
        key=os.path.getmtime,
    )
    if not files:
        raise RuntimeError("No MP3 file downloaded by yt-dlp")

    full_mp3 = files[-1]
    print("Full MP3 downloaded at:", full_mp3)

    base, ext = os.path.splitext(full_mp3)
    trimmed_mp3 = base + "_trimmed.mp3"

    print(f"Using ffmpeg executable: {FFMPEG_EXE}")
    print(f"Trimming first 30s → {trimmed_mp3}")

    subprocess.run([
        FFMPEG_EXE,      # ⭐ this is now just "ffmpeg"
        "-y",
        "-t", "30",
        "-i", full_mp3,
        "-acodec", "copy",
        trimmed_mp3
    ], check=True)

    print("Trimmed MP3 created:", trimmed_mp3)
    return trimmed_mp3
 

# --------------------------------------------------------
# 2) Upload MP3 to S3
# --------------------------------------------------------
def upload_to_s3(local_path: str, bucket: str) -> str:
    key = f"audio/{uuid.uuid4().hex}.mp3"
    print(f"Uploading {local_path} → s3://{bucket}/{key}")
    s3.upload_file(local_path, bucket, key)
    return f"s3://{bucket}/{key}"


# --------------------------------------------------------
# 3) Start Amazon Transcribe job
# --------------------------------------------------------

def start_transcribe_job(s3_uri: str, language_code: str) -> str:
    job_name = f"clearcap-{uuid.uuid4().hex}"
    print(f"Starting Transcribe job: {job_name}, language={language_code}")

    transcribe.start_transcription_job(
        TranscriptionJobName=job_name,
        Media={"MediaFileUri": s3_uri},
        MediaFormat="mp3",
        LanguageCode=language_code,  # e.g. "hi-IN"
    )

    return job_name


# --------------------------------------------------------
# 4) Wait for Transcribe to finish
# --------------------------------------------------------

def wait_for_job(job_name: str):
    print("Waiting for job:", job_name)
    while True:
        resp = transcribe.get_transcription_job(TranscriptionJobName=job_name)
        status = resp["TranscriptionJob"]["TranscriptionJobStatus"]
        print("Status:", status)
        if status in ("COMPLETED", "FAILED"):
            return resp
        time.sleep(3)


# --------------------------------------------------------
# 5) Download Transcribe JSON
# --------------------------------------------------------

def fetch_transcript_json(resp) -> dict:
    uri = resp["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
    print("Transcript URI:", uri)
    r = requests.get(uri)
    r.raise_for_status()
    return r.json()


# --------------------------------------------------------
# 6) Split transcript into ~3-sec segments with timestamps
# --------------------------------------------------------

def extract_segments(transcript_json: dict):
    """
    Use Transcribe's 'items' (per word with start_time/end_time) to build
    caption segments of about MAX_SEG_DURATION seconds, cut on punctuation.
    """
    items = transcript_json["results"]["items"]

    segments = []
    current_words = []
    seg_start = None
    last_time = None

    MAX_SEG_DURATION = 3.0  # seconds

    for item in items:
        item_type = item["type"]

        if item_type == "punctuation":
            # finalize segment at punctuation
            if current_words:
                segments.append({
                    "start": seg_start,
                    "end": last_time,
                    "text": " ".join(current_words),
                })
                current_words = []
                seg_start = None
            continue

        # pronunciation item
        start = float(item["start_time"])
        end = float(item["end_time"])
        word = item["alternatives"][0]["content"]

        if seg_start is None:
            seg_start = start

        # if duration exceeded, close current and start new segment
        if (end - seg_start) > MAX_SEG_DURATION:
            segments.append({
                "start": seg_start,
                "end": last_time,
                "text": " ".join(current_words),
            })
            current_words = [word]
            seg_start = start
        else:
            current_words.append(word)

        last_time = end

    # final segment
    if current_words:
        segments.append({
            "start": seg_start,
            "end": last_time,
            "text": " ".join(current_words),
        })

    print("Generated segments:", len(segments))
    return segments


# --------------------------------------------------------
# 7) Translate text from audio language → caption language
# --------------------------------------------------------

def translate_text(text: str, source_code: str, target_code: str) -> str:
    """
    Use Amazon Translate to translate text from source_code -> target_code.
    If anything fails, fall back to the original text so the worker keeps running.
    """
    if source_code == target_code:
        return text

    try:
        print(f"[Translate] {source_code} -> {target_code}, len={len(text)}")
        resp = translate.translate_text(
            Text=text,
            SourceLanguageCode=source_code,
            TargetLanguageCode=target_code,
        )
        return resp["TranslatedText"]
    except Exception as e:
        print("[Translate] ERROR, falling back to original text:", e)
        return text



# --------------------------------------------------------
# 8) Call NLP service /process (simplify, emotion, ISL)
# --------------------------------------------------------

def call_nlp_process(text: str, language_code: str):
    """
    Call your existing NLP /process endpoint to get:
      - simplified
      - emotion
      - islGloss
    language_code is a short code for NLP, e.g. "en", "hi", "ta".
    """
    payload = {
        "text": text,
        "sourceLang": language_code,
    }
    print(f"[NLP] Processing text ({len(text)} chars) lang={language_code}")

    r = requests.post(f"{NLP_BASE_URL}/process", json=payload)
    r.raise_for_status()
    return r.json()


# --------------------------------------------------------
# 9) Send each segment to Node backend
# --------------------------------------------------------

def send_segment_to_node(
    video_session_id: str,
    start: float,
    end: float,
    original: str,
    nlp_result: dict,
    caption_language_bcp47: str,
):
    """
    Send segment to Node:
      - original: original audio-language text
      - simplified: simplified translated caption
      - language: caption language BCP-47 (e.g. 'en-IN')
    """
    payload = {
        "videoSessionId": video_session_id,
        "start": float(start),
        "end": float(end),
        "original": original,
        "simplified": nlp_result.get("simplified", original),
        "language": caption_language_bcp47,
        "emotion": nlp_result.get("emotion", "neutral"),
        "islGloss": nlp_result.get("islGloss", []),
    }

    print(f"[Node] Sending segment (start={start:.2f}, end={end:.2f})")
    r = requests.post(f"{NODE_BACKEND_URL}/api/youtube/segment", json=payload)
    r.raise_for_status()
    return r.json()


# --------------------------------------------------------
# 10) Main worker pipeline
# --------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-session-id", required=True)
    parser.add_argument("--url", required=True)
    parser.add_argument("--audio-language-code", required=True)    # e.g. "hi-IN"
    parser.add_argument("--caption-language-code", required=True)  # e.g. "en-IN"
    args = parser.parse_args()

    if not AUDIO_BUCKET:
        raise RuntimeError("CLEARCAP_AUDIO_BUCKET env not set")

    video_session_id = args.video_session_id
    url = args.url
    audio_lang_code_raw = args.audio_language_code       # BCP-47, e.g. "hi-IN"
    caption_lang_code_raw = args.caption_language_code   # BCP-47, e.g. "en-IN"

    # For Transcribe, we use the full BCP-47 code
    transcribe_lang_code = audio_lang_code_raw

    # For Translate & NLP, we normalize to short codes: "hi-IN" -> "hi"
    audio_lang_simple = normalize_lang_code(audio_lang_code_raw)
    caption_lang_simple = normalize_lang_code(caption_lang_code_raw)

    print("=== Worker starting ===")
    print("Video session:", video_session_id)
    print("URL:", url)
    print("Audio language (Transcribe):", transcribe_lang_code)
    print("Audio language (simple):", audio_lang_simple)
    print("Caption language (BCP-47):", caption_lang_code_raw)
    print("Caption language (simple):", caption_lang_simple)

    # ---- Download + Trim ----
    mp3_path = download_audio(url)

    # ---- Upload to S3 ----
    s3_uri = upload_to_s3(mp3_path, AUDIO_BUCKET)

    # ---- Start Transcribe ----
    job_name = start_transcribe_job(s3_uri, transcribe_lang_code)
    job_resp = wait_for_job(job_name)

    if job_resp["TranscriptionJob"]["TranscriptionJobStatus"] == "FAILED":
        print("❌ Transcribe FAILED")
        return

    # ---- Parse transcript ----
    transcript_json = fetch_transcript_json(job_resp)
    segments = extract_segments(transcript_json)

    # ---- NLP + Send to Node ----
    for seg in segments:
        original = seg["text"]   # original in audio language
        start = seg["start"]
        end = seg["end"]

        # 1) Translate from audio-lang -> caption-lang
        translated = translate_text(original, audio_lang_simple, caption_lang_simple)

        # 2) Simplify / annotate in caption language
        nlp_result = call_nlp_process(translated, caption_lang_simple)

        # 3) Send to Node
        send_segment_to_node(
            video_session_id,
            start,
            end,
            original,
            nlp_result,
            caption_lang_code_raw,  # language for frontend (e.g. "en-IN")
        )

    print(f"✅ All segments sent for session {video_session_id}")


if __name__ == "__main__":
    main()
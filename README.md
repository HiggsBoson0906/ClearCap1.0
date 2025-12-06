🚀 ClearCap — Real-Time Multilingual Captioning for Everyone
Breaking sound barriers with AI-powered live captions.

ClearCap is an AI-driven accessibility tool that converts audio—especially from YouTube—into real-time, multilingual, deaf-friendly captions.
Designed for India and beyond, it supports 10+ languages, live YouTube processing, caption simplification, timestamp syncing, and optional ISL (Indian Sign Language) support.

🌟 Features
🎧 Real-Time Captioning

Captions appear instantly as the audio is processed

Sub-second latency through an optimized worker pipeline

Accurate timestamps synced to video playback

🌐 Multilingual Support

10+ major Indian languages

Automatic translation + simplified caption option

Perfect for accessibility and content creators

📺 YouTube Integration

Paste any YouTube URL and generate captions live

Worker downloads audio → processes → streams captions to frontend

Fully asynchronous, scalable, fault-tolerant

🦻 Deaf-Friendly Design

Simplified, easy-to-read captions

Optional “Original vs Simplified” display

High-visibility UI optimized for low-vision users

⚡ Modern UI / UX

Glassmorphism Tailwind UI

Gradient hero sections

Smooth scrolling, animations, tooltips, toast notifications

Custom ClearCap waveform logo icon

🧠 AI-Powered Backend

Audio chunking worker (yt-dlp → splitting → S3 → processing)

AWS Transcribe / Whisper / custom models (depending on setup)

Real-time socket streaming to frontend

🛠️ Tech Stack
Frontend

React + Vite

TailwindCSS

Lucide Icons

Socket.io client

Custom YouTube IFrame Player sync engine

Gradient / glass UI components

Backend

Node.js (Express)

Socket.io

AWS SDK (S3, Transcribe)

Environment-based session routing

Worker orchestration

Worker Pipeline

Python worker

yt-dlp for audio extraction

Python-dotenv

Uploads audio chunks to S3

Sends caption events → backend → socket → UI

📸 Screenshots

(Add images here once you take them)

📍 /screenshots/homepage.png
📍 /screenshots/demo.png
📍 /screenshots/captions.png

🚀 Setup & Installation
1. Clone the repository
git clone https://github.com/YOUR_USERNAME/ClearCap.git
cd ClearCap

2. Environment Variables

Create:

/backend/.env  
/nlp/.env  
/frontend/.env

Frontend (frontend/.env)
VITE_BACKEND_URL=http://localhost:5000

Backend (backend/.env)
AWS_ACCESS_KEY_ID=YOUR_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET
AWS_REGION=ap-south-1
CLEARCAP_AUDIO_BUCKET=your-bucket-name

Worker (nlp/.env)
AWS_ACCESS_KEY_ID=YOUR_KEY
AWS_SECRET_ACCESS_KEY=YOUR_SECRET
AWS_REGION=ap-south-1
CLEARCAP_AUDIO_BUCKET=your-bucket-name

3. Install frontend dependencies
cd frontend
npm install
npm run dev

4. Install backend dependencies
cd backend
npm install
npm run dev

5. Install worker dependencies
cd nlp
pip install -r requirements.txt
python worker.py

🔌 Running ClearCap

Once everything is running:

Frontend → http://localhost:5173

Backend → http://localhost:5000

Worker(s) → auto-process audio chunks

Paste a YouTube link → captions stream live

📡 Architecture Overview
YouTube URL
     ↓
Frontend (React) → /api/youtube/start
     ↓
Backend (Node.js)
     ↓
Worker (Python) → downloads audio → chunks → S3 → transcribes
     ↓
Backend emits caption events via Socket.io
     ↓
Frontend receives "caption_final" and syncs with YouTube player
     ↓
Live captions rendered on UI

👤 Author

Tejasvi Mahule

AI Developer • Accessibility Advocate
If you use ClearCap in your project, ⭐ star the repo!

📝 License

MIT — Free to use and modify.

🤝 Contributing

PRs are welcome!
Help expand:

More languages

More model support

Better accessibility modes

UI enhancements

⭐ Support the Project

If ClearCap helped you, consider starring the repo!
It means a lot and helps others discover the tool ❤️

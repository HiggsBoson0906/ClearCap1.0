#!/usr/bin/env bash
set -e

# Install OS-level dependencies
apt-get update
apt-get install -y python3 python3-pip ffmpeg

# Python dependencies required by worker.py
pip3 install boto3 python-dotenv yt-dlp requests
    
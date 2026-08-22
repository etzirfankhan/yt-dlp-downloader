# TubeFetch

Web UI for **yt-dlp** on Termux. Pick a video, choose Audio Only or Video + Audio, set save location, download directly to disk.

## Setup

```bash
pkg update && pkg install python python-pip -y
cd ~ && unzip ytdlp-web.zip && cd ytdlp-web
pip install -r requirements.txt
python app.py
```

Visit `http://<phone-ip>:5000` from any device on your hotspot.

## How It Works

```
Browser → POST /api/download → Flask → yt-dlp subprocess → disk
                              ↑                    ↓
                         poll /progress ←── stdout
```

- **Analyze**: Server extracts available formats
- **Select**: Pick ONE option per video — "Audio Only" or "Video + Audio"
- **Video + Audio**: If the video stream has no audio, server uses `format+bestaudio` and yt-dlp auto-merges
- **Save Location**: Type a path or click preset chips (Downloads, Movies, Music, Termux)
- **Download**: Server spawns yt-dlp, writes to your chosen path, streams progress back

## Save Path

Use yt-dlp output templates:

```
/sdcard/Download/TubeFetch/%(title)s.%(ext)s   ← default
/sdcard/Movies/%(title)s.%(ext)s
~/storage/downloads/%(title)s.%(ext)s
```

If path ends with `/`, `%(title)s.%(ext)s` is appended automatically.

## Background Run

```bash
# tmux (best)
tmux new -s tubefetch
python app.py
# Ctrl+B, D to detach

# nohup
nohup python app.py > /dev/null 2>&1 &
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| yt-dlp not found | `pip install yt-dlp` |
| Download fails at 0% | CDN link expired. Re-analyze. |
| Permission denied | `termux-setup-storage` |
| No folder picker on mobile | Browsers block filesystem access. Use preset chips or type the path. |

## Files

```
app.py       Flask + yt-dlp subprocess engine
templates/   HTML
static/      CSS, JS
```

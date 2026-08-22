#!/usr/bin/env python3
"""
TubeFetch - Simple yt-dlp web UI
Server runs yt-dlp, writes to disk, streams progress back.
"""

import os
import re
import subprocess
import threading
import uuid
from flask import Flask, render_template, request, jsonify
import yt_dlp

app = Flask(__name__)
jobs = {}


def human_size(b):
    if not b: return "Unknown"
    for u in ['B','KB','MB','GB']:
        if abs(b) < 1024: return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} TB"


def fmt_dur(s):
    if not s: return ""
    s = int(s)
    h, r = divmod(s, 3600)
    m, sec = divmod(r, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m:02d}:{sec:02d}"


def get_info(url):
    """Extract video info and build unified format list."""
    ydl_opts = {'quiet': True, 'no_warnings': False, 'extract_flat': False, 'playlistend': 50}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info: return None

        is_pl = info.get('_type') == 'playlist'
        raw = info.get('entries', []) if is_pl else [info]
        raw = [e for e in raw if e]

        entries = []
        for e in raw:
            fmts = e.get('formats', [])
            audio_opts = []
            video_opts = []

            for f in fmts:
                fid = f.get('format_id','')
                ext = f.get('ext','')
                vc = f.get('vcodec','')
                ac = f.get('acodec','')
                sz = f.get('filesize') or f.get('filesize_approx',0)
                h = f.get('height',0) or 0
                w = f.get('width',0) or 0

                if (vc == 'none' or not vc) and ac and ac != 'none':
                    abr = f.get('abr') or f.get('tbr',0)
                    q = f"{int(abr)}kbps" if abr else f.get('format_note','Audio')
                    audio_opts.append({'id':fid, 'label':q, 'ext':ext, 'size':human_size(sz), 'raw_size':sz or 0})

                elif vc and vc != 'none':
                    has_aud = ac and ac != 'none'
                    q = f"{h}p" if h else f.get('format_note','Video')
                    if w and h:
                        q += f" ({w}x{h})"
                    video_opts.append({'id':fid, 'label':q, 'ext':ext, 'size':human_size(sz), 'raw_size':sz or 0, 'has_audio':has_aud, 'height':h})

            # Sort video by resolution (height) descending so 4K/2K/1080p appear
            video_opts.sort(key=lambda x: x['height'], reverse=True)

            # Deduplicate by label, keep highest-res first
            seen = set()
            audio_opts = [x for x in audio_opts if not (x['label'] in seen or seen.add(x['label']))][:6]
            seen = set()
            video_opts = [x for x in video_opts if not (x['label'] in seen or seen.add(x['label']))][:10]

            if audio_opts or video_opts:
                entries.append({
                    'id': e.get('id',''),
                    'title': e.get('title','Unknown'),
                    'thumbnail': e.get('thumbnail',''),
                    'duration': fmt_dur(e.get('duration')),
                    'url': e.get('webpage_url') or e.get('url') or url,
                    'uploader': e.get('uploader',''),
                    'audio_options': audio_opts,
                    'video_options': video_opts,
                })

        if not entries: return None
        return {
            'success': True,
            'is_playlist': is_pl,
            'playlist_title': info.get('title','Playlist') if is_pl else '',
            'entry_count': len(entries),
            'entries': entries
        }


def run_job(job_id, url, fmt_spec, out_path):
    """Run yt-dlp and capture progress."""
    jobs[job_id] = {'status':'starting','progress':0,'message':'Starting...','error':None,'done':False}

    cmd = ['yt-dlp', '-f', fmt_spec, '-o', out_path, '--no-playlist', '--newline', '--progress', '--no-warnings', url]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in proc.stdout:
            line = line.strip()
            if not line: continue
            job = jobs.get(job_id)
            if not job: proc.terminate(); return

            if '[download]' in line:
                m = re.search(r'(\d+\.?\d*)%', line)
                if m:
                    job['progress'] = float(m.group(1))
                    speed = re.search(r'at\s+([\d.]+\s*(?:KiB|MiB|GiB)/s)', line)
                    eta = re.search(r'ETA\s+(\d+:\d+)', line)
                    parts = []
                    if speed: parts.append(speed.group(1))
                    if eta: parts.append(f"ETA {eta.group(1)}")
                    job['message'] = f"Downloading... {', '.join(parts)}" if parts else line
                elif '100%' in line or 'Already downloaded' in line:
                    job['progress'] = 100
                    job['message'] = 'Complete!'
            elif '[Merger]' in line:
                job['message'] = 'Merging audio + video...'
                job['progress'] = 99
            elif 'Extracting URL' in line or 'Downloading webpage' in line:
                job['message'] = 'Fetching info...'

        proc.wait()
        job = jobs.get(job_id)
        if job:
            if proc.returncode == 0:
                job['status'] = 'complete'
                job['progress'] = 100
                job['message'] = 'Download complete!'
            else:
                job['status'] = 'error'
                job['error'] = f'yt-dlp exited {proc.returncode}'
            job['done'] = True
    except FileNotFoundError:
        jobs[job_id] = {'status':'error','progress':0,'message':'yt-dlp not found','error':'Install: pip install yt-dlp','done':True}
    except Exception as e:
        jobs[job_id] = {'status':'error','progress':0,'message':str(e),'error':str(e),'done':True}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/info', methods=['POST'])
def api_info():
    url = request.json.get('url','').strip()
    if not url: return jsonify({'success':False,'error':'Enter a URL'}), 400
    try:
        data = get_info(url)
        if not data: return jsonify({'success':False,'error':'No formats found'}), 400
        return jsonify(data)
    except yt_dlp.utils.DownloadError as e:
        return jsonify({'success':False,'error':str(e)}), 400
    except Exception as e:
        return jsonify({'success':False,'error':str(e)}), 500


@app.route('/api/download', methods=['POST'])
def start_download():
    d = request.json
    url = d.get('url','').strip()
    fmt_id = d.get('format_id','')
    dl_type = d.get('type','')
    has_audio = d.get('has_audio', False)
    out_path = d.get('output_path','').strip()

    if not url or not fmt_id or not out_path:
        return jsonify({'success':False,'error':'Missing params'}), 400

    # Build format spec
    if dl_type == 'video':
        fmt_spec = fmt_id if has_audio else f"{fmt_id}+bestaudio/best"
    else:
        fmt_spec = fmt_id

    # Ensure template if directory
    if out_path.endswith('/') or os.path.isdir(out_path):
        out_path = os.path.join(out_path, '%(title)s.%(ext)s')

    job_id = str(uuid.uuid4())[:8]
    threading.Thread(target=run_job, args=(job_id, url, fmt_spec, out_path), daemon=True).start()
    return jsonify({'success':True, 'job_id':job_id})


@app.route('/api/progress/<job_id>')
def progress(job_id):
    job = jobs.get(job_id, {'status':'unknown','progress':0,'message':'Not found','error':None,'done':False})
    return jsonify(job)


@app.route('/api/health')
def health():
    return jsonify({'status':'ok'})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"TubeFetch: http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)

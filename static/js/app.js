const App = {
    state: {
        theme: localStorage.getItem('theme') || 'light',
        data: null,
        selections: new Map(), // videoId -> {type, formatId, label, ext, hasAudio}
        path: localStorage.getItem('dlPath') || '/sdcard/Download/TubeFetch/%(title)s.%(ext)s',
        jobPoll: null,
    },

    init() {
        this.cache();
        this.bind();
        this.applyTheme();
        this.detectTheme();
        this.el.pathInput.value = this.state.path;
        this.highlightPreset(this.state.path);
    },

    cache() {
        this.el = {
            themeToggle: document.getElementById('themeToggle'),
            urlInput: document.getElementById('urlInput'),
            pasteBtn: document.getElementById('pasteBtn'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            pathInput: document.getElementById('pathInput'),
            dirPicker: document.getElementById('dirPicker'),
            pickDirBtn: document.getElementById('pickDirBtn'),
            pathPresets: document.getElementById('pathPresets'),
            loadingState: document.getElementById('loadingState'),
            errorState: document.getElementById('errorState'),
            errorMessage: document.getElementById('errorMessage'),
            errorClose: document.getElementById('errorClose'),
            resultsSection: document.getElementById('resultsSection'),
            playlistHeader: document.getElementById('playlistHeader'),
            playlistTitle: document.getElementById('playlistTitle'),
            playlistCount: document.getElementById('playlistCount'),
            selectAll: document.getElementById('selectAll'),
            entriesGrid: document.getElementById('entriesGrid'),
            downloadBar: document.getElementById('downloadBar'),
            downloadCount: document.getElementById('downloadCount'),
            downloadBtn: document.getElementById('downloadBtn'),
            confirmModal: document.getElementById('confirmModal'),
            confirmClose: document.getElementById('confirmClose'),
            confirmCancel: document.getElementById('confirmCancel'),
            confirmDownload: document.getElementById('confirmDownload'),
            confirmList: document.getElementById('confirmList'),
            
            progressModal: document.getElementById('progressModal'),
            progressFile: document.getElementById('progressFile'),
            progressStatus: document.getElementById('progressStatus'),
            progressFill: document.getElementById('progressFill'),
            progressPct: document.getElementById('progressPct'),
            progressClose: document.getElementById('progressClose'),
        };
    },

    bind() {
        this.el.themeToggle.onclick = () => this.toggleTheme();
        this.el.pasteBtn.onclick = () => this.paste();
        this.el.analyzeBtn.onclick = () => this.analyze();
        this.el.urlInput.onkeypress = e => { if (e.key === 'Enter') this.analyze(); };
        this.el.errorClose.onclick = () => this.hideError();
        this.el.selectAll.onchange = e => this.toggleAll(e.target.checked);
        this.el.downloadBtn.onclick = () => this.openConfirm();
        this.el.confirmClose.onclick = () => this.hideConfirm();
        this.el.confirmCancel.onclick = () => this.hideConfirm();
        this.el.confirmDownload.onclick = () => this.startDownload();
        this.el.progressClose.onclick = () => this.hideProgress();
        this.el.pickDirBtn.onclick = () => this.el.dirPicker.click();
        this.el.dirPicker.onchange = e => this.onDirPick(e);
        this.el.pathInput.onchange = e => { this.state.path = e.target.value; localStorage.setItem('dlPath', e.target.value); this.highlightPreset(e.target.value); };
        this.el.pathPresets.onclick = e => {
            if (e.target.classList.contains('preset-chip')) {
                const p = e.target.dataset.path;
                this.el.pathInput.value = p;
                this.state.path = p;
                localStorage.setItem('dlPath', p);
                this.highlightPreset(p);
            }
        };
    },

    detectTheme() {
        if (!localStorage.getItem('theme')) {
            this.state.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            this.applyTheme();
        }
    },
    applyTheme() { document.documentElement.setAttribute('data-theme', this.state.theme); localStorage.setItem('theme', this.state.theme); },
    toggleTheme() { this.state.theme = this.state.theme === 'light' ? 'dark' : 'light'; this.applyTheme(); },

    async paste() { try { const t = await navigator.clipboard.readText(); this.el.urlInput.value = t; this.el.urlInput.focus(); } catch { this.el.urlInput.focus(); } },

    async analyze() {
        const url = this.el.urlInput.value.trim();
        if (!url) { this.showError('Enter a URL'); return; }
        this.setLoading(true); this.hideError(); this.hideResults();
        try {
            const r = await fetch('/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.error || 'Failed');
            this.state.data = d;
            this.state.selections.clear();
            this.render(d);
            this.el.resultsSection.classList.add('active');
        } catch (e) { this.showError(e.message); }
        finally { this.setLoading(false); }
    },

    setLoading(v) { this.el.analyzeBtn.disabled = v; this.el.loadingState.classList.toggle('active', v); },
    showError(m) { this.el.errorMessage.textContent = m; this.el.errorState.classList.add('active'); },
    hideError() { this.el.errorState.classList.remove('active'); },
    hideResults() { this.el.resultsSection.classList.remove('active'); this.el.downloadBar.classList.remove('active'); },

    render(data) {
        const { is_playlist, playlist_title, entry_count, entries } = data;
        this.el.playlistHeader.style.display = is_playlist ? 'flex' : 'none';
        if (is_playlist) {
            this.el.playlistTitle.textContent = playlist_title || 'Playlist';
            this.el.playlistCount.textContent = entry_count + ' videos';
            this.el.selectAll.checked = true;
        }
        this.el.entriesGrid.innerHTML = entries.map((e, i) => this.card(e, i, is_playlist)).join('');
        this.bindCards();
        this.updateBar();
    },

    card(e, i, isPlaylist) {
        const audioChips = e.audio_options.length
            ? e.audio_options.map(o => `<button class="format-chip audio-chip" data-vid="${e.id}" data-type="audio" data-fid="${o.id}" data-ext="${o.ext}" data-label="${o.label}">${o.label}<span class="chip-size">${o.ext.toUpperCase()} · ${o.size}</span></button>`).join('')
            : '<span class="no-formats">No audio</span>';
        const videoChips = e.video_options.length
            ? e.video_options.map(o => `<button class="format-chip" data-vid="${e.id}" data-type="video" data-fid="${o.id}" data-ext="${o.ext}" data-label="${o.label}" data-has-audio="${o.has_audio}">${o.label}<span class="chip-size">${o.ext.toUpperCase()} · ${o.size}</span></button>`).join('')
            : '<span class="no-formats">No video</span>';
        const cb = isPlaylist ? `<label class="card-checkbox"><input type="checkbox" data-vid="${e.id}" checked><span class="checkmark"></span></label>` : '';
        return `
            <div class="video-card" data-vid="${e.id}">
                <div class="card-header">
                    <div class="thumbnail-wrapper"><img src="${e.thumbnail || ''}" alt="" loading="lazy" onerror="this.style.display='none'"></div>
                    ${e.duration ? `<span class="duration-badge">${e.duration}</span>` : ''}
                    ${cb}
                </div>
                <div class="card-body">
                    <h3 class="card-title">${this.esc(e.title)}</h3>
                    ${e.uploader ? `<p class="card-uploader">${this.esc(e.uploader)}</p>` : ''}
                    <div class="format-group">
                        <div class="format-group-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                            Audio Only
                        </div>
                        <div class="format-chips">${audioChips}</div>
                    </div>
                    <div class="format-group">
                        <div class="format-group-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>
                            Video + Audio
                            <span class="merge-note">auto-merges if needed</span>
                        </div>
                        <div class="format-chips">${videoChips}</div>
                    </div>
                </div>
            </div>`;
    },

    esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; },

    bindCards() {
        document.querySelectorAll('.format-chip').forEach(chip => {
            chip.onclick = () => {
                const vid = chip.dataset.vid;
                const type = chip.dataset.type;
                const sel = chip.classList.contains('selected');
                // Deselect ALL chips for this video (audio and video)
                document.querySelectorAll(`.format-chip[data-vid="${vid}"]`).forEach(c => c.classList.remove('selected'));
                if (!sel) {
                    chip.classList.add('selected');
                    this.state.selections.set(vid, {
                        type,
                        formatId: chip.dataset.fid,
                        label: chip.dataset.label,
                        ext: chip.dataset.ext,
                        hasAudio: chip.dataset.hasAudio === 'true'
                    });
                } else {
                    this.state.selections.delete(vid);
                }
                this.updateBar();
            };
        });
        document.querySelectorAll('.card-checkbox input').forEach(cb => {
            cb.onchange = () => {
                const card = document.querySelector(`.video-card[data-vid="${cb.dataset.vid}"]`);
                if (card) card.classList.toggle('disabled', !cb.checked);
                this.updateAllState();
                this.updateBar();
            };
        });
    },

    toggleAll(checked) {
        document.querySelectorAll('.card-checkbox input').forEach(cb => {
            cb.checked = checked;
            const card = document.querySelector(`.video-card[data-vid="${cb.dataset.vid}"]`);
            if (card) card.classList.toggle('disabled', !checked);
        });
        this.updateBar();
    },

    updateAllState() {
        const cbs = document.querySelectorAll('.card-checkbox input');
        this.el.selectAll.checked = cbs.length > 0 && Array.from(cbs).every(c => c.checked);
    },

    updateBar() {
        const entries = this.state.data?.entries || [];
        let count = 0;
        entries.forEach(e => {
            const card = document.querySelector(`.video-card[data-vid="${e.id}"]`);
            if (card?.classList.contains('disabled')) return;
            if (this.state.selections.has(e.id)) count++;
        });
        this.el.downloadBar.classList.toggle('active', count > 0);
        this.el.downloadCount.textContent = count + ' selected';
        this.el.downloadBtn.disabled = count === 0;
    },

    onDirPick(e) {
        const files = e.target.files;
        if (!files.length) return;
        // webkitdirectory gives relative paths; we can't get absolute path
        // Best we can do is use the folder name as a hint
        const first = files[0];
        const path = first.webkitRelativePath || '';
        const folder = path.split('/')[0];
        if (folder) {
            // Prepend to current path or suggest
            const current = this.el.pathInput.value;
            const base = current.substring(0, current.lastIndexOf('/') + 1);
            this.el.pathInput.value = base + folder + '/%(title)s.%(ext)s';
            this.state.path = this.el.pathInput.value;
            localStorage.setItem('dlPath', this.state.path);
        }
    },

    highlightPreset(path) {
        document.querySelectorAll('.preset-chip').forEach(c => {
            c.classList.toggle('active', c.dataset.path === path);
        });
    },

    /* ===== Download Flow ===== */
    openConfirm() {
        const entries = this.state.data?.entries || [];
        const items = [];
        entries.forEach(e => {
            const card = document.querySelector(`.video-card[data-vid="${e.id}"]`);
            if (card?.classList.contains('disabled')) return;
            const s = this.state.selections.get(e.id);
            if (s) items.push({ entry: e, sel: s });
        });
        if (!items.length) { this.showError('Nothing selected'); return; }

        this.el.confirmList.innerHTML = items.map(it => `
            <div class="confirm-item">
                <span class="confirm-item-type ${it.sel.type}">${it.sel.type}</span>
                <span class="confirm-item-name">${this.esc(it.entry.title)}</span>
                <span class="confirm-item-fmt">${it.sel.label}</span>
            </div>
        `).join('');
        this.el.confirmModal.classList.add('active');
    },

    hideConfirm() { this.el.confirmModal.classList.remove('active'); },

    async startDownload() {
        const path = this.el.pathInput.value.trim();
        if (!path) { this.showError('Set save path first'); return; }
        this.hideConfirm();

        const entries = this.state.data?.entries || [];
        const queue = [];
        entries.forEach(e => {
            const card = document.querySelector(`.video-card[data-vid="${e.id}"]`);
            if (card?.classList.contains('disabled')) return;
            const s = this.state.selections.get(e.id);
            if (s) queue.push({ entry: e, sel: s });
        });

        this.showProgress();
        for (const item of queue) {
            await this.downloadOne(item, path);
        }
        this.el.progressStatus.textContent = 'All done!';
        this.el.progressStatus.style.color = 'var(--success)';
        this.el.progressFill.style.width = '100%';
        this.el.progressPct.textContent = '100%';
        setTimeout(() => this.hideProgress(), 1500);
    },

    async downloadOne(item, path) {
        const { entry, sel } = item;
        this.el.progressFile.textContent = entry.title;
        this.el.progressStatus.textContent = 'Starting...';
        this.el.progressStatus.style.color = '';
        this.el.progressFill.style.width = '0%';
        this.el.progressPct.textContent = '0%';

        try {
            const r = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: entry.url,
                    format_id: sel.formatId,
                    type: sel.type,
                    has_audio: sel.hasAudio,
                    output_path: path,
                    title: entry.title
                })
            });
            const d = await r.json();
            if (!r.ok || !d.success) throw new Error(d.error || 'Failed to start');

            await this.poll(d.job_id, entry.title);
        } catch (e) {
            this.el.progressStatus.textContent = e.message;
            this.el.progressStatus.style.color = 'var(--danger)';
        }
    },

    async poll(jobId, title) {
        return new Promise(resolve => {
            const iv = setInterval(async () => {
                try {
                    const r = await fetch(`/api/progress/${jobId}`);
                    const j = await r.json();
                    this.el.progressFile.textContent = title;
                    this.el.progressStatus.textContent = j.message || '...';
                    this.el.progressFill.style.width = (j.progress || 0) + '%';
                    this.el.progressPct.textContent = Math.round(j.progress || 0) + '%';

                    if (j.status === 'complete' || j.status === 'error' || j.done) {
                        clearInterval(iv);
                        resolve();
                    }
                } catch { /* keep polling */ }
            }, 500);
        });
    },

    showProgress() { this.el.progressModal.classList.add('active'); document.body.style.overflow = 'hidden'; },
    hideProgress() { this.el.progressModal.classList.remove('active'); document.body.style.overflow = ''; },
};

document.addEventListener('DOMContentLoaded', () => App.init());

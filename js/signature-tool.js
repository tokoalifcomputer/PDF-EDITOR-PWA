/**
 * Signature Tool - Draw signatures on PDF pages with transparent background
 */
class SignatureTool {
    constructor(pdfEditor) {
        this.editor = pdfEditor;
        this.signatures = [];
        this.selectedSignature = null;
        this.isPlacing = false;
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.startPos = { x: 0, y: 0 };
        this.startBox = null;
        this.boxCounter = 0;
        this.pendingSignature = null;
        this.penColor = '#000000';
        this.penSize = 2;
        this.init();
    }

    init() {
        this.editor.onPageRendered = (pageWrapper, pageNum) => {
            this.createLayer(pageWrapper, pageNum);
        };
    }

    createLayer(pageWrapper, pageNum) {
        let layer = pageWrapper.querySelector('.signature-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'signature-layer';
            layer.dataset.page = pageNum;
            pageWrapper.appendChild(layer);
        }
        layer.addEventListener('click', (e) => this.onClick(e, pageNum));
        layer.addEventListener('mousedown', (e) => this.onMouseDown(e));
        layer.addEventListener('mousemove', (e) => this.onMouseMove(e));
        layer.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    setActive(active) {
        document.querySelectorAll('.signature-layer').forEach(layer => {
            active ? layer.classList.add('active') : layer.classList.remove('active');
        });
    }

    openSignaturePad() {
        const existing = document.querySelector('.signature-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay signature-modal';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <h3>✍️ Buat Tanda Tangan</h3>
                <p>Gambar tanda tangan Anda di bawah ini</p>
                <div class="signature-pad-container">
                    <canvas id="sigPad" class="signature-pad" width="450" height="200"></canvas>
                    <div class="signature-controls">
                        <div class="pen-size">
                            <span>✏️</span>
                            <input type="range" id="penSize" min="1" max="5" value="2">
                            <span id="penSizeVal">2px</span>
                        </div>
                        <div class="color-picker-wrapper">
                            <input type="color" id="penColor" value="#000000">
                        </div>
                        <button class="btn" onclick="editor.signatureTool.clearPad()">🗑️ Hapus</button>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn" onclick="this.closest('.modal-overlay').remove()">Batal</button>
                    <button class="btn btn-success" id="btnConfirmSig">✅ Gunakan</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Setup canvas with transparent background
        const canvas = document.getElementById('sigPad');
        const ctx = canvas.getContext('2d');

        // Clear with transparent background
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let drawing = false;
        let lastX = 0, lastY = 0;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const startDraw = (e) => {
            e.preventDefault();
            drawing = true;
            const pos = getPos(e);
            lastX = pos.x;
            lastY = pos.y;
        };

        const draw = (e) => {
            e.preventDefault();
            if (!drawing) return;
            const pos = getPos(e);

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.strokeStyle = this.penColor;
            ctx.lineWidth = this.penSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            lastX = pos.x;
            lastY = pos.y;
        };

        const endDraw = () => { drawing = false; };

        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('mouseout', endDraw);
        canvas.addEventListener('touchstart', startDraw, {passive: false});
        canvas.addEventListener('touchmove', draw, {passive: false});
        canvas.addEventListener('touchend', endDraw);

        // Controls
        document.getElementById('penSize').addEventListener('input', (e) => {
            this.penSize = parseInt(e.target.value);
            document.getElementById('penSizeVal').textContent = this.penSize + 'px';
        });

        document.getElementById('penColor').addEventListener('change', (e) => {
            this.penColor = e.target.value;
        });

        document.getElementById('btnConfirmSig').addEventListener('click', () => {
            // Export as PNG with transparent background
            const dataUrl = canvas.toDataURL('image/png');
            if (this.isCanvasBlank(canvas)) {
                alert('Tanda tangan masih kosong!');
                return;
            }
            this.pendingSignature = dataUrl;
            this.isPlacing = true;
            overlay.remove();
            document.getElementById('modeText').textContent = 'Mode: Signature - Klik di PDF untuk menempatkan tanda tangan';
        });
    }

    isCanvasBlank(canvas) {
        const ctx = canvas.getContext('2d');
        const pixelBuffer = new Uint32Array(
            ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
        );
        return !pixelBuffer.some(color => color !== 0);
    }

    clearPad() {
        const canvas = document.getElementById('sigPad');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    onClick(e, pageNum) {
        if (!this.editor.isSignatureMode || !this.isPlacing || !this.pendingSignature) return;
        if (e.target.closest('.signature-box')) return;

        const layer = e.currentTarget;
        const rect = layer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.createSignatureBox(x, y, pageNum, layer, this.pendingSignature);
        this.pendingSignature = null;
        this.isPlacing = false;
        document.getElementById('modeText').textContent = 'Mode: Signature - Klik tanda tangan untuk select';
    }

    createSignatureBox(x, y, pageNum, layer, sigData) {
        this.boxCounter++;
        const id = `signature_${Date.now()}_${this.boxCounter}`;

        const el = document.createElement('div');
        el.className = 'signature-box';
        el.dataset.id = id;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = '200px';
        el.style.height = '80px';

        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 80;
        const ctx = canvas.getContext('2d');

        // Transparent background
        ctx.clearRect(0, 0, 200, 80);

        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, 200, 80);
        };
        img.src = sigData;
        el.appendChild(canvas);

        ['nw','n','ne','w','e','sw','s','se'].forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });

        layer.appendChild(el);

        const sigData_obj = {
            id, x, y, width: 200, height: 80,
            src: sigData, page: pageNum,
            element: el
        };

        this.signatures.push(sigData_obj);
        this.selectSignature(id);

        this.editor.history.push('add', 'signature', {
            signature: { ...sigData_obj, element: undefined }
        });
    }

    onMouseDown(e) {
        if (!this.editor.isSignatureMode) return;

        const handle = e.target.closest('.resize-handle');
        if (handle) {
            this.isResizing = true;
            this.resizeHandle = handle.classList[1];
            this.selectedSignature = this.signatures.find(s => s.id === handle.parentElement.dataset.id);
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedSignature };
            e.stopPropagation();
            return;
        }

        const boxEl = e.target.closest('.signature-box');
        if (boxEl) {
            this.selectSignature(boxEl.dataset.id);
            this.isDragging = true;
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedSignature };
            e.stopPropagation();
        }
    }

    onMouseMove(e) {
        if (!this.editor.isSignatureMode) return;
        if (this.isDragging && this.selectedSignature) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.moveSignature(dx, dy);
        } else if (this.isResizing && this.selectedSignature) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.resizeSignature(dx, dy);
        }
    }

    onMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            if (this.selectedSignature && this.startBox) {
                const dx = this.selectedSignature.x - this.startBox.x;
                const dy = this.selectedSignature.y - this.startBox.y;
                if (dx !== 0 || dy !== 0) {
                    this.editor.history.push('move', 'signature', {
                        id: this.selectedSignature.id,
                        from: { x: this.startBox.x, y: this.startBox.y },
                        to: { x: this.selectedSignature.x, y: this.selectedSignature.y }
                    });
                }
            }
        } else if (this.isResizing) {
            this.isResizing = false;
            if (this.selectedSignature && this.startBox) {
                this.editor.history.push('resize', 'signature', {
                    id: this.selectedSignature.id,
                    from: { x: this.startBox.x, y: this.startBox.y, width: this.startBox.width, height: this.startBox.height },
                    to: { x: this.selectedSignature.x, y: this.selectedSignature.y, width: this.selectedSignature.width, height: this.selectedSignature.height }
                });
            }
        }
        this.startBox = null;
    }

    selectSignature(id) {
        this.signatures.forEach(s => s.element.classList.remove('selected'));
        if (id) {
            const sig = this.signatures.find(s => s.id === id);
            if (sig) {
                sig.element.classList.add('selected');
                this.selectedSignature = sig;
            }
        } else {
            this.selectedSignature = null;
        }
    }

    moveSignature(dx, dy) {
        if (!this.selectedSignature || !this.startBox) return;
        const newX = this.startBox.x + dx;
        const newY = this.startBox.y + dy;
        this.selectedSignature.x = newX;
        this.selectedSignature.y = newY;
        this.selectedSignature.element.style.left = newX + 'px';
        this.selectedSignature.element.style.top = newY + 'px';
    }

    resizeSignature(dx, dy) {
        if (!this.selectedSignature || !this.startBox) return;
        let { x, y, width, height } = this.startBox;
        switch (this.resizeHandle) {
            case 'se': width = Math.max(50, this.startBox.width + dx); height = Math.max(30, this.startBox.height + dy); break;
            case 'sw': width = Math.max(50, this.startBox.width - dx); height = Math.max(30, this.startBox.height + dy); x = this.startBox.x + (this.startBox.width - width); break;
            case 'ne': width = Math.max(50, this.startBox.width + dx); height = Math.max(30, this.startBox.height - dy); y = this.startBox.y + (this.startBox.height - height); break;
            case 'nw': width = Math.max(50, this.startBox.width - dx); height = Math.max(30, this.startBox.height - dy); x = this.startBox.x + (this.startBox.width - width); y = this.startBox.y + (this.startBox.height - height); break;
            case 'n': height = Math.max(30, this.startBox.height - dy); y = this.startBox.y + (this.startBox.height - height); break;
            case 's': height = Math.max(30, this.startBox.height + dy); break;
            case 'e': width = Math.max(50, this.startBox.width + dx); break;
            case 'w': width = Math.max(50, this.startBox.width - dx); x = this.startBox.x + (this.startBox.width - width); break;
        }
        this.selectedSignature.x = x;
        this.selectedSignature.y = y;
        this.selectedSignature.width = width;
        this.selectedSignature.height = height;
        const el = this.selectedSignature.element;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';
    }

    deleteSignature(id, recordHistory = true) {
        const idx = this.signatures.findIndex(s => s.id === id);
        if (idx === -1) return;
        const sig = this.signatures[idx];
        sig.element.remove();
        if (recordHistory) {
            this.editor.history.push('delete', 'signature', { signature: { ...sig, element: undefined } });
        }
        this.signatures.splice(idx, 1);
        if (this.selectedSignature && this.selectedSignature.id === id) {
            this.selectedSignature = null;
        }
    }

    deleteSelected() {
        if (this.selectedSignature) this.deleteSignature(this.selectedSignature.id);
    }

    getAllSignatures() {
        return this.signatures.map(s => ({
            id: s.id, x: s.x, y: s.y,
            width: s.width, height: s.height,
            src: s.src, page: s.page
        }));
    }

    clear() {
        this.signatures.forEach(s => s.element.remove());
        this.signatures = [];
        this.selectedSignature = null;
    }

    lockAll() {
        this.signatures.forEach(s => {
            s.element.style.pointerEvents = 'none';
            s.element.classList.remove('selected');
        });
        this.selectedSignature = null;
        this.setActive(false);
    }

    unlockAll() {
        this.signatures.forEach(s => {
            s.element.style.pointerEvents = 'auto';
        });
        this.setActive(true);
    }

    applyHistoryAction(action, isUndo) {
        const { type, data } = action;
        switch (type) {
            case 'add':
                if (isUndo) this.deleteSignature(data.signature.id, false);
                else this.restoreSignature(data.signature);
                break;
            case 'delete':
                if (isUndo) this.restoreSignature(data.signature);
                else this.deleteSignature(data.signature.id, false);
                break;
            case 'move':
                this.applyMove(data.id, isUndo ? data.from : data.to);
                break;
            case 'resize':
                this.applyResize(data.id, isUndo ? data.from : data.to);
                break;
        }
    }

    restoreSignature(data) {
        const layer = document.querySelector(`.signature-layer[data-page="${data.page}"]`);
        if (!layer) return;
        const el = document.createElement('div');
        el.className = 'signature-box';
        el.dataset.id = data.id;
        el.style.left = data.x + 'px';
        el.style.top = data.y + 'px';
        el.style.width = data.width + 'px';
        el.style.height = data.height + 'px';

        const canvas = document.createElement('canvas');
        canvas.width = data.width;
        canvas.height = data.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, data.width, data.height); // Transparent background

        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, data.width, data.height);
        img.src = data.src;
        el.appendChild(canvas);

        ['nw','n','ne','w','e','sw','s','se'].forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });
        layer.appendChild(el);
        this.signatures.push({ ...data, element: el });
    }

    applyMove(id, pos) {
        const sig = this.signatures.find(s => s.id === id);
        if (!sig) return;
        sig.x = pos.x; sig.y = pos.y;
        sig.element.style.left = pos.x + 'px';
        sig.element.style.top = pos.y + 'px';
    }

    applyResize(id, dims) {
        const sig = this.signatures.find(s => s.id === id);
        if (!sig) return;
        sig.x = dims.x; sig.y = dims.y; sig.width = dims.width; sig.height = dims.height;
        sig.element.style.left = dims.x + 'px';
        sig.element.style.top = dims.y + 'px';
        sig.element.style.width = dims.width + 'px';
        sig.element.style.height = dims.height + 'px';
    }
}

window.SignatureTool = SignatureTool;

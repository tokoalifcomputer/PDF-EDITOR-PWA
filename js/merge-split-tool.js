/**
 * Merge & Split Tool - Merge multiple PDFs and split pages
 */
class MergeSplitTool {
    constructor(pdfEditor) {
        this.editor = pdfEditor;
        this.mergeQueue = [];
        this.pdfLibLoaded = false;
    }

    async loadPDFLib() {
        if (this.pdfLibLoaded) return;

        // Polyfill Promise.withResolvers
        if (typeof Promise.withResolvers === 'undefined') {
            Promise.withResolvers = function() {
                let resolve, reject;
                const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
                return { promise, resolve, reject };
            };
        }

        if (typeof PDFLib === 'undefined') {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js');
        }
        if (typeof download === 'undefined') {
            await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/downloadjs/1.4.8/download.min.js');
        }

        this.pdfLibLoaded = true;
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load: ' + src));
            document.head.appendChild(script);
        });
    }

    // ===== MERGE PDFs =====
    openMergeModal() {
        const existing = document.querySelector('.merge-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay merge-modal';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <h3>📑 Gabung PDF</h3>
                <p>Tambahkan file PDF untuk digabung</p>
                <div class="image-upload-zone" id="mergeDropZone" style="margin: 16px 0;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📁</div>
                    <p>Drag & drop PDF di sini</p>
                    <p>atau</p>
                    <button class="btn-primary" onclick="document.getElementById('mergeFileInput').click()">Pilih File PDF</button>
                    <input type="file" id="mergeFileInput" accept=".pdf" multiple hidden>
                </div>
                <div class="pdf-list" id="mergeList"></div>
                <div class="modal-actions">
                    <button class="btn" onclick="this.closest('.modal-overlay').remove()">Batal</button>
                    <button class="btn btn-success" onclick="editor.mergeSplitTool.mergePDFs()">🔗 Gabung & Download</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const dropZone = document.getElementById('mergeDropZone');
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleMergeFiles(e.dataTransfer.files);
        });

        document.getElementById('mergeFileInput').addEventListener('change', (e) => {
            this.handleMergeFiles(e.target.files);
        });

        // Add current PDF to queue
        const currentName = sessionStorage.getItem('pdfName') || localStorage.getItem('pdfName') || 'Current PDF';
        const currentData = sessionStorage.getItem('pdfData') || localStorage.getItem('pdfData');
        if (currentData) {
            this.getPageCount(currentData).then(count => {
                this.addToMergeQueue(currentName, currentData, count);
            }).catch(() => {
                this.addToMergeQueue(currentName, currentData, 1);
            });
        }
    }

    async handleMergeFiles(files) {
        for (const file of files) {
            if (file.type !== 'application/pdf') continue;
            const reader = new FileReader();
            reader.onload = (e) => {
                this.getPageCount(e.target.result).then(count => {
                    this.addToMergeQueue(file.name, e.target.result, count);
                }).catch(() => {
                    this.addToMergeQueue(file.name, e.target.result, 1);
                });
            };
            reader.readAsDataURL(file);
        }
    }

    async getPageCount(dataUrl) {
        try {
            if (typeof pdfjsLib === 'undefined') {
                await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            const pdf = await pdfjsLib.getDocument(dataUrl).promise;
            return pdf.numPages;
        } catch {
            return 1;
        }
    }

    addToMergeQueue(name, dataUrl, pageCount) {
        const id = 'merge_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        this.mergeQueue.push({ id, name, dataUrl, pageCount });
        this.updateMergeList();
    }

    removeFromMergeQueue(id) {
        this.mergeQueue = this.mergeQueue.filter(item => item.id !== id);
        this.updateMergeList();
    }

    moveQueueItem(id, direction) {
        const idx = this.mergeQueue.findIndex(item => item.id === id);
        if (idx === -1) return;
        if (direction === 'up' && idx > 0) {
            [this.mergeQueue[idx], this.mergeQueue[idx - 1]] = [this.mergeQueue[idx - 1], this.mergeQueue[idx]];
        } else if (direction === 'down' && idx < this.mergeQueue.length - 1) {
            [this.mergeQueue[idx], this.mergeQueue[idx + 1]] = [this.mergeQueue[idx + 1], this.mergeQueue[idx]];
        }
        this.updateMergeList();
    }

    updateMergeList() {
        const list = document.getElementById('mergeList');
        if (!list) return;

        if (this.mergeQueue.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--gray-400);">Belum ada file PDF</div>';
            return;
        }

        list.innerHTML = this.mergeQueue.map((item, idx) => `
            <div class="pdf-list-item" draggable="true" data-id="${item.id}">
                <span class="drag-handle">⋮⋮</span>
                <span style="flex: 1;">${idx + 1}. ${item.name}</span>
                <span class="page-count">${item.pageCount} halaman</span>
                <button class="btn" style="padding: 4px 8px;" onclick="editor.mergeSplitTool.moveQueueItem('${item.id}', 'up')" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button class="btn" style="padding: 4px 8px;" onclick="editor.mergeSplitTool.moveQueueItem('${item.id}', 'down')" ${idx === this.mergeQueue.length - 1 ? 'disabled' : ''}>▼</button>
                <button class="btn btn-danger" style="padding: 4px 8px;" onclick="editor.mergeSplitTool.removeFromMergeQueue('${item.id}')">✕</button>
            </div>
        `).join('');

        list.querySelectorAll('.pdf-list-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.id);
                item.classList.add('dragging');
            });
            item.addEventListener('dragend', () => item.classList.remove('dragging'));
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = list.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    if (e.clientY < mid) item.before(dragging);
                    else item.after(dragging);
                }
            });
        });
    }

    async mergePDFs() {
        if (this.mergeQueue.length < 2) {
            alert('Minimal 2 file PDF untuk digabung!');
            return;
        }

        await this.loadPDFLib();

        try {
            const mergedPdf = await PDFLib.PDFDocument.create();

            for (const item of this.mergeQueue) {
                const pdfBytes = this.dataUrlToBytes(item.dataUrl);
                const pdf = await PDFLib.PDFDocument.load(pdfBytes);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            }

            const mergedBytes = await mergedPdf.save();
            const blob = new Blob([mergedBytes], { type: 'application/pdf' });

            if (typeof download !== 'undefined') {
                download(blob, 'merged_document.pdf', 'application/pdf');
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'merged_document.pdf';
                a.click();
                URL.revokeObjectURL(url);
            }

            alert(`✅ Berhasil menggabung ${this.mergeQueue.length} PDF!`);
            this.mergeQueue = [];
            document.querySelector('.merge-modal')?.remove();
        } catch (error) {
            console.error('Merge error:', error);
            alert('Gagal menggabung PDF: ' + error.message);
        }
    }

    // ===== SPLIT PDF =====
    openSplitModal() {
        const existing = document.querySelector('.split-modal');
        if (existing) existing.remove();

        const totalPages = this.editor.pdfEngine.totalPages;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay split-modal';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 450px;">
                <h3>✂️ Pisah PDF</h3>
                <p>Total halaman: ${totalPages}</p>
                <div style="margin: 16px 0;">
                    <label style="font-size: 13px; color: var(--gray-600); display: block; margin-bottom: 8px;">Pilih range halaman yang ingin dipisah:</label>
                    <div class="split-range">
                        <input type="number" id="splitFrom" value="1" min="1" max="${totalPages}">
                        <span>sampai</span>
                        <input type="number" id="splitTo" value="${totalPages}" min="1" max="${totalPages}">
                    </div>
                </div>
                <div class="crop-info">
                    💡 Tips: Masukkan range halaman yang ingin dijadikan file PDF baru.
                    Contoh: Halaman 1-3 akan membuat file baru dengan 3 halaman.
                </div>
                <div class="modal-actions">
                    <button class="btn" onclick="this.closest('.modal-overlay').remove()">Batal</button>
                    <button class="btn btn-success" onclick="editor.mergeSplitTool.splitPDF()">✂️ Pisah & Download</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    async splitPDF() {
        const from = parseInt(document.getElementById('splitFrom').value);
        const to = parseInt(document.getElementById('splitTo').value);
        const totalPages = this.editor.pdfEngine.totalPages;

        if (from < 1 || to > totalPages || from > to) {
            alert('Range halaman tidak valid!');
            return;
        }

        await this.loadPDFLib();

        try {
            const pdfData = sessionStorage.getItem('pdfData') || localStorage.getItem('pdfData');
            const pdfBytes = this.dataUrlToBytes(pdfData);
            const pdf = await PDFLib.PDFDocument.load(pdfBytes);
            const newPdf = await PDFLib.PDFDocument.create();

            const pageIndices = [];
            for (let i = from - 1; i < to; i++) pageIndices.push(i);

            const pages = await newPdf.copyPages(pdf, pageIndices);
            pages.forEach(page => newPdf.addPage(page));

            const newBytes = await newPdf.save();
            const blob = new Blob([newBytes], { type: 'application/pdf' });

            const originalName = sessionStorage.getItem('pdfName') || localStorage.getItem('pdfName') || 'document';
            const newName = originalName.replace('.pdf', `_pages_${from}-${to}.pdf`);

            if (typeof download !== 'undefined') {
                download(blob, newName, 'application/pdf');
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = newName;
                a.click();
                URL.revokeObjectURL(url);
            }

            alert(`✅ Berhasil memisah halaman ${from}-${to}!`);
            document.querySelector('.split-modal')?.remove();
        } catch (error) {
            console.error('Split error:', error);
            alert('Gagal memisah PDF: ' + error.message);
        }
    }

    dataUrlToBytes(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
}

window.MergeSplitTool = MergeSplitTool;

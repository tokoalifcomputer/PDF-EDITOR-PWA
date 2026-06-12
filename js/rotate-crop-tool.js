/**
 * Rotate & Crop Tool - Rotate and crop PDF pages
 */
class RotateCropTool {
    constructor(pdfEditor) {
        this.editor = pdfEditor;
        this.pageRotations = {}; // pageNum -> degrees
        this.pageCrops = {};     // pageNum -> {x, y, width, height}
    }

    // Rotate single page
    rotatePage(pageNum, degrees) {
        const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
        if (!wrapper) return;

        const currentRotation = this.pageRotations[pageNum] || 0;
        const newRotation = (currentRotation + degrees) % 360;
        this.pageRotations[pageNum] = newRotation;

        wrapper.style.transform = `rotate(${newRotation}deg)`;

        // Adjust wrapper size for 90/270 degree rotations
        if (newRotation === 90 || newRotation === 270) {
            const canvas = wrapper.querySelector('.pdf-canvas');
            const w = canvas.width;
            const h = canvas.height;
            wrapper.style.width = h + 'px';
            wrapper.style.height = w + 'px';
        }

        this.editor.history.push('rotate', 'page', {
            page: pageNum,
            from: currentRotation,
            to: newRotation
        });
    }

    // Reset rotation
    resetRotation(pageNum) {
        const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
        if (!wrapper) return;

        const currentRotation = this.pageRotations[pageNum] || 0;
        if (currentRotation === 0) return;

        this.editor.history.push('rotate', 'page', {
            page: pageNum,
            from: currentRotation,
            to: 0
        });

        delete this.pageRotations[pageNum];
        wrapper.style.transform = '';

        // Restore original size
        const canvas = wrapper.querySelector('.pdf-canvas');
        wrapper.style.width = canvas.width + 'px';
        wrapper.style.height = canvas.height + 'px';
    }

    // Open rotate modal
    openRotateModal() {
        const existing = document.querySelector('.rotate-modal');
        if (existing) existing.remove();

        const currentPage = this.editor.pdfEngine.currentPage;
        const currentRotation = this.pageRotations[currentPage] || 0;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay rotate-modal';
        overlay.innerHTML = `
            <div class="modal">
                <h3>🔄 Putar Halaman</h3>
                <p>Halaman ${currentPage} (Saat ini: ${currentRotation}°)</p>
                <div class="rotate-options">
                    <button class="rotate-btn" onclick="editor.rotateCropTool.rotatePage(${currentPage}, -90)">↺ 90° Kiri</button>
                    <button class="rotate-btn" onclick="editor.rotateCropTool.rotatePage(${currentPage}, 90)">↻ 90° Kanan</button>
                    <button class="rotate-btn" onclick="editor.rotateCropTool.rotatePage(${currentPage}, 180)">🔄 180°</button>
                    <button class="rotate-btn" onclick="editor.rotateCropTool.resetRotation(${currentPage})">⏹️ Reset</button>
                </div>
                <div class="modal-actions">
                    <button class="btn" onclick="this.closest('.modal-overlay').remove()">Tutup</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    // Open crop modal
    openCropModal() {
        const existing = document.querySelector('.crop-modal');
        if (existing) existing.remove();

        const currentPage = this.editor.pdfEngine.currentPage;
        const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${currentPage}"]`);
        if (!wrapper) return;

        const canvas = wrapper.querySelector('.pdf-canvas');
        const currentCrop = this.pageCrops[currentPage];

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay crop-modal';
        overlay.innerHTML = `
            <div class="modal" style="max-width: 450px;">
                <h3>✂️ Crop Halaman ${currentPage}</h3>
                <div class="crop-info">
                    Ukuran halaman: ${canvas.width} x ${canvas.height} px<br>
                    Masukkan koordinat crop (dalam pixel):
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;">
                    <div>
                        <label style="font-size: 12px; color: var(--gray-500);">X (dari kiri)</label>
                        <input type="number" id="cropX" value="${currentCrop ? currentCrop.x : 0}" min="0" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: var(--radius);">
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--gray-500);">Y (dari atas)</label>
                        <input type="number" id="cropY" value="${currentCrop ? currentCrop.y : 0}" min="0" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: var(--radius);">
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--gray-500);">Lebar</label>
                        <input type="number" id="cropW" value="${currentCrop ? currentCrop.width : canvas.width}" min="1" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: var(--radius);">
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--gray-500);">Tinggi</label>
                        <input type="number" id="cropH" value="${currentCrop ? currentCrop.height : canvas.height}" min="1" style="width: 100%; padding: 8px; border: 1px solid var(--gray-300); border-radius: var(--radius);">
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn" onclick="this.closest('.modal-overlay').remove()">Batal</button>
                    <button class="btn btn-danger" onclick="editor.rotateCropTool.resetCrop(${currentPage}); this.closest('.modal-overlay').remove();">Reset Crop</button>
                    <button class="btn btn-success" onclick="editor.rotateCropTool.applyCrop(${currentPage}); this.closest('.modal-overlay').remove();">✅ Terapkan</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    applyCrop(pageNum) {
        const x = parseInt(document.getElementById('cropX').value) || 0;
        const y = parseInt(document.getElementById('cropY').value) || 0;
        const w = parseInt(document.getElementById('cropW').value) || 0;
        const h = parseInt(document.getElementById('cropH').value) || 0;

        const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
        if (!wrapper) return;

        const canvas = wrapper.querySelector('.pdf-canvas');

        // Validate
        if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > canvas.width || y + h > canvas.height) {
            alert('Koordinat crop tidak valid!');
            return;
        }

        const oldCrop = this.pageCrops[pageNum] ? { ...this.pageCrops[pageNum] } : null;

        this.pageCrops[pageNum] = { x, y, width: w, height: h };

        // Apply visual crop using clip-path
        wrapper.style.clipPath = `inset(${y}px ${canvas.width - x - w}px ${canvas.height - y - h}px ${x}px)`;

        this.editor.history.push('crop', 'page', {
            page: pageNum,
            from: oldCrop,
            to: { x, y, width: w, height: h }
        });
    }

    resetCrop(pageNum) {
        const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
        if (!wrapper) return;

        const oldCrop = this.pageCrops[pageNum] ? { ...this.pageCrops[pageNum] } : null;
        if (!oldCrop) return;

        delete this.pageCrops[pageNum];
        wrapper.style.clipPath = '';

        this.editor.history.push('crop', 'page', {
            page: pageNum,
            from: oldCrop,
            to: null
        });
    }

    getPageRotation(pageNum) {
        return this.pageRotations[pageNum] || 0;
    }

    getPageCrop(pageNum) {
        return this.pageCrops[pageNum] || null;
    }

    applyHistoryAction(action, isUndo) {
        const { type, data } = action;
        if (type === 'rotate') {
            const targetRotation = isUndo ? data.from : data.to;
            this.pageRotations[data.page] = targetRotation;
            const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${data.page}"]`);
            if (wrapper) {
                wrapper.style.transform = targetRotation ? `rotate(${targetRotation}deg)` : '';
            }
        } else if (type === 'crop') {
            const targetCrop = isUndo ? data.from : data.to;
            const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${data.page}"]`);
            if (wrapper) {
                const canvas = wrapper.querySelector('.pdf-canvas');
                if (targetCrop) {
                    this.pageCrops[data.page] = targetCrop;
                    wrapper.style.clipPath = `inset(${targetCrop.y}px ${canvas.width - targetCrop.x - targetCrop.width}px ${canvas.height - targetCrop.y - targetCrop.height}px ${targetCrop.x}px)`;
                } else {
                    delete this.pageCrops[data.page];
                    wrapper.style.clipPath = '';
                }
            }
        }
    }
}

window.RotateCropTool = RotateCropTool;

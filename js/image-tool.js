/**
 * Image Tool - Add images to PDF pages
 */
class ImageTool {
    constructor(pdfEditor) {
        this.editor = pdfEditor;
        this.images = [];
        this.selectedImage = null;
        this.isAdding = false;
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.startPos = { x: 0, y: 0 };
        this.startBox = null;
        this.boxCounter = 0;
        this.pendingImage = null;
        this.init();
    }

    init() {
        this.editor.onPageRendered = (pageWrapper, pageNum) => {
            this.createLayer(pageWrapper, pageNum);
        };
    }

    createLayer(pageWrapper, pageNum) {
        let layer = pageWrapper.querySelector('.image-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'image-layer';
            layer.dataset.page = pageNum;
            pageWrapper.appendChild(layer);
        }
        layer.addEventListener('click', (e) => this.onClick(e, pageNum));
        layer.addEventListener('mousedown', (e) => this.onMouseDown(e));
        layer.addEventListener('mousemove', (e) => this.onMouseMove(e));
        layer.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    setActive(active) {
        document.querySelectorAll('.image-layer').forEach(layer => {
            active ? layer.classList.add('active') : layer.classList.remove('active');
        });
    }

    openImageUpload() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = (ev) => {
                    this.pendingImage = ev.target.result;
                    this.isAdding = true;
                    document.getElementById('modeText').textContent = 'Mode: Image - Klik di PDF untuk menempatkan gambar';
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }

    onClick(e, pageNum) {
        if (!this.editor.isImageMode || !this.isAdding || !this.pendingImage) return;
        if (e.target.closest('.image-box')) return;

        const layer = e.currentTarget;
        const rect = layer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.createImageBox(x, y, pageNum, layer, this.pendingImage);
        this.pendingImage = null;
        this.isAdding = false;
        document.getElementById('modeText').textContent = 'Mode: Image - Klik gambar untuk select, drag untuk pindah';
    }

    createImageBox(x, y, pageNum, layer, imageSrc) {
        this.boxCounter++;
        const id = `image_${Date.now()}_${this.boxCounter}`;

        const el = document.createElement('div');
        el.className = 'image-box';
        el.dataset.id = id;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = '150px';
        el.style.height = '150px';

        const img = document.createElement('img');
        img.src = imageSrc;
        img.draggable = false;
        el.appendChild(img);

        ['nw','n','ne','w','e','sw','s','se'].forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });

        layer.appendChild(el);

        const imageData = {
            id, x, y, width: 150, height: 150,
            src: imageSrc, page: pageNum,
            element: el
        };

        this.images.push(imageData);
        this.selectImage(id);

        this.editor.history.push('add', 'image', {
            image: { ...imageData, element: undefined }
        });
    }

    onMouseDown(e) {
        if (!this.editor.isImageMode) return;

        const handle = e.target.closest('.resize-handle');
        if (handle) {
            this.isResizing = true;
            this.resizeHandle = handle.classList[1];
            this.selectedImage = this.images.find(img => img.id === handle.parentElement.dataset.id);
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedImage };
            e.stopPropagation();
            return;
        }

        const boxEl = e.target.closest('.image-box');
        if (boxEl) {
            this.selectImage(boxEl.dataset.id);
            this.isDragging = true;
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedImage };
            e.stopPropagation();
        }
    }

    onMouseMove(e) {
        if (!this.editor.isImageMode) return;
        if (this.isDragging && this.selectedImage) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.moveImage(dx, dy);
        } else if (this.isResizing && this.selectedImage) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.resizeImage(dx, dy);
        }
    }

    onMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            if (this.selectedImage && this.startBox) {
                const dx = this.selectedImage.x - this.startBox.x;
                const dy = this.selectedImage.y - this.startBox.y;
                if (dx !== 0 || dy !== 0) {
                    this.editor.history.push('move', 'image', {
                        id: this.selectedImage.id,
                        from: { x: this.startBox.x, y: this.startBox.y },
                        to: { x: this.selectedImage.x, y: this.selectedImage.y }
                    });
                }
            }
        } else if (this.isResizing) {
            this.isResizing = false;
            if (this.selectedImage && this.startBox) {
                this.editor.history.push('resize', 'image', {
                    id: this.selectedImage.id,
                    from: { x: this.startBox.x, y: this.startBox.y, width: this.startBox.width, height: this.startBox.height },
                    to: { x: this.selectedImage.x, y: this.selectedImage.y, width: this.selectedImage.width, height: this.selectedImage.height }
                });
            }
        }
        this.startBox = null;
    }

    selectImage(id) {
        this.images.forEach(img => img.element.classList.remove('selected'));
        if (id) {
            const img = this.images.find(i => i.id === id);
            if (img) {
                img.element.classList.add('selected');
                this.selectedImage = img;
            }
        } else {
            this.selectedImage = null;
        }
    }

    moveImage(dx, dy) {
        if (!this.selectedImage || !this.startBox) return;
        const newX = this.startBox.x + dx;
        const newY = this.startBox.y + dy;
        this.selectedImage.x = newX;
        this.selectedImage.y = newY;
        this.selectedImage.element.style.left = newX + 'px';
        this.selectedImage.element.style.top = newY + 'px';
    }

    resizeImage(dx, dy) {
        if (!this.selectedImage || !this.startBox) return;
        let { x, y, width, height } = this.startBox;
        switch (this.resizeHandle) {
            case 'se': width = Math.max(20, this.startBox.width + dx); height = Math.max(20, this.startBox.height + dy); break;
            case 'sw': width = Math.max(20, this.startBox.width - dx); height = Math.max(20, this.startBox.height + dy); x = this.startBox.x + (this.startBox.width - width); break;
            case 'ne': width = Math.max(20, this.startBox.width + dx); height = Math.max(20, this.startBox.height - dy); y = this.startBox.y + (this.startBox.height - height); break;
            case 'nw': width = Math.max(20, this.startBox.width - dx); height = Math.max(20, this.startBox.height - dy); x = this.startBox.x + (this.startBox.width - width); y = this.startBox.y + (this.startBox.height - height); break;
            case 'n': height = Math.max(20, this.startBox.height - dy); y = this.startBox.y + (this.startBox.height - height); break;
            case 's': height = Math.max(20, this.startBox.height + dy); break;
            case 'e': width = Math.max(20, this.startBox.width + dx); break;
            case 'w': width = Math.max(20, this.startBox.width - dx); x = this.startBox.x + (this.startBox.width - width); break;
        }
        this.selectedImage.x = x;
        this.selectedImage.y = y;
        this.selectedImage.width = width;
        this.selectedImage.height = height;
        const el = this.selectedImage.element;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';
    }

    deleteImage(id, recordHistory = true) {
        const idx = this.images.findIndex(i => i.id === id);
        if (idx === -1) return;
        const img = this.images[idx];
        img.element.remove();
        if (recordHistory) {
            this.editor.history.push('delete', 'image', { image: { ...img, element: undefined } });
        }
        this.images.splice(idx, 1);
        if (this.selectedImage && this.selectedImage.id === id) {
            this.selectedImage = null;
        }
    }

    deleteSelected() {
        if (this.selectedImage) this.deleteImage(this.selectedImage.id);
    }

    getAllImages() {
        return this.images.map(img => ({
            id: img.id, x: img.x, y: img.y,
            width: img.width, height: img.height,
            src: img.src, page: img.page
        }));
    }

    clear() {
        this.images.forEach(img => img.element.remove());
        this.images = [];
        this.selectedImage = null;
    }

    lockAll() {
        this.images.forEach(img => {
            img.element.style.pointerEvents = 'none';
            img.element.classList.remove('selected');
        });
        this.selectedImage = null;
        this.setActive(false);
    }

    unlockAll() {
        this.images.forEach(img => {
            img.element.style.pointerEvents = 'auto';
        });
        this.setActive(true);
    }

    applyHistoryAction(action, isUndo) {
        const { type, data } = action;
        switch (type) {
            case 'add':
                if (isUndo) this.deleteImage(data.image.id, false);
                else this.restoreImage(data.image);
                break;
            case 'delete':
                if (isUndo) this.restoreImage(data.image);
                else this.deleteImage(data.image.id, false);
                break;
            case 'move':
                this.applyMove(data.id, isUndo ? data.from : data.to);
                break;
            case 'resize':
                this.applyResize(data.id, isUndo ? data.from : data.to);
                break;
        }
    }

    restoreImage(data) {
        const layer = document.querySelector(`.image-layer[data-page="${data.page}"]`);
        if (!layer) return;
        const el = document.createElement('div');
        el.className = 'image-box';
        el.dataset.id = data.id;
        el.style.left = data.x + 'px';
        el.style.top = data.y + 'px';
        el.style.width = data.width + 'px';
        el.style.height = data.height + 'px';
        const img = document.createElement('img');
        img.src = data.src;
        img.draggable = false;
        el.appendChild(img);
        ['nw','n','ne','w','e','sw','s','se'].forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });
        layer.appendChild(el);
        this.images.push({ ...data, element: el });
    }

    applyMove(id, pos) {
        const img = this.images.find(i => i.id === id);
        if (!img) return;
        img.x = pos.x; img.y = pos.y;
        img.element.style.left = pos.x + 'px';
        img.element.style.top = pos.y + 'px';
    }

    applyResize(id, dims) {
        const img = this.images.find(i => i.id === id);
        if (!img) return;
        img.x = dims.x; img.y = dims.y; img.width = dims.width; img.height = dims.height;
        img.element.style.left = dims.x + 'px';
        img.element.style.top = dims.y + 'px';
        img.element.style.width = dims.width + 'px';
        img.element.style.height = dims.height + 'px';
    }
}

window.ImageTool = ImageTool;

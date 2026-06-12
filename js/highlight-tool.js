/**
 * Highlight Tool - Semi-transparent highlight boxes
 */
class HighlightTool {
    constructor(pdfEditor) {
        this.editor = pdfEditor;
        this.highlights = [];
        this.selectedHighlight = null;
        this.isDrawing = false;
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.startPos = { x: 0, y: 0 };
        this.startBox = null;
        this.currentColor = '#FFFF00';
        this.currentOpacity = 0.4;
        this.boxCounter = 0;
        this.init();
    }

    init() {
        this.editor.onPageRendered = (pageWrapper, pageNum) => {
            this.createLayer(pageWrapper, pageNum);
        };
    }

    createLayer(pageWrapper, pageNum) {
        let layer = pageWrapper.querySelector('.highlight-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'highlight-layer';
            layer.dataset.page = pageNum;
            pageWrapper.appendChild(layer);
        }
        layer.addEventListener('mousedown', (e) => this.onMouseDown(e, pageNum));
        layer.addEventListener('mousemove', (e) => this.onMouseMove(e));
        layer.addEventListener('mouseup', (e) => this.onMouseUp(e));
    }

    setActive(active) {
        document.querySelectorAll('.highlight-layer').forEach(layer => {
            active ? layer.classList.add('active') : layer.classList.remove('active');
        });
    }

    setColor(color) {
        this.currentColor = color;
        if (this.selectedHighlight) {
            const oldColor = this.selectedHighlight.color;
            this.selectedHighlight.color = color;
            this.selectedHighlight.element.style.backgroundColor = color;
            this.editor.history.push('color', 'highlight', {
                id: this.selectedHighlight.id,
                from: oldColor,
                to: color
            });
        }
    }

    setOpacity(opacity) {
        this.currentOpacity = opacity;
        if (this.selectedHighlight) {
            this.selectedHighlight.opacity = opacity;
            this.selectedHighlight.element.style.opacity = opacity;
        }
    }

    onMouseDown(e, pageNum) {
        if (!this.editor.isHighlightMode) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const handle = e.target.closest('.resize-handle');
        if (handle) {
            this.isResizing = true;
            this.resizeHandle = handle.classList[1];
            this.selectedHighlight = this.highlights.find(h => h.id === handle.parentElement.dataset.id);
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedHighlight };
            e.stopPropagation();
            return;
        }

        const boxEl = e.target.closest('.highlight-box');
        if (boxEl) {
            this.selectHighlight(boxEl.dataset.id);
            this.isDragging = true;
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedHighlight };
            e.stopPropagation();
            return;
        }

        this.isDrawing = true;
        this.startPos = { x, y };
        this.createNewHighlight(x, y, pageNum, e.currentTarget);
    }

    onMouseMove(e) {
        if (!this.editor.isHighlightMode) return;
        if (this.isDrawing && this.selectedHighlight) {
            const layer = e.currentTarget;
            const rect = layer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.updateDrawingHighlight(x, y);
        } else if (this.isDragging && this.selectedHighlight) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.moveHighlight(dx, dy);
        } else if (this.isResizing && this.selectedHighlight) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.resizeHighlight(dx, dy);
        }
    }

    onMouseUp(e) {
        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.selectedHighlight) {
                const { width, height } = this.selectedHighlight;
                if (width < 10 || height < 10) {
                    this.deleteHighlight(this.selectedHighlight.id, false);
                    this.selectedHighlight = null;
                } else {
                    this.editor.history.push('add', 'highlight', { highlight: { ...this.selectedHighlight, element: undefined } });
                }
            }
        } else if (this.isDragging) {
            this.isDragging = false;
            if (this.selectedHighlight && this.startBox) {
                const dx = this.selectedHighlight.x - this.startBox.x;
                const dy = this.selectedHighlight.y - this.startBox.y;
                if (dx !== 0 || dy !== 0) {
                    this.editor.history.push('move', 'highlight', {
                        id: this.selectedHighlight.id,
                        from: { x: this.startBox.x, y: this.startBox.y },
                        to: { x: this.selectedHighlight.x, y: this.selectedHighlight.y }
                    });
                }
            }
        } else if (this.isResizing) {
            this.isResizing = false;
            if (this.selectedHighlight && this.startBox) {
                this.editor.history.push('resize', 'highlight', {
                    id: this.selectedHighlight.id,
                    from: { x: this.startBox.x, y: this.startBox.y, width: this.startBox.width, height: this.startBox.height },
                    to: { x: this.selectedHighlight.x, y: this.selectedHighlight.y, width: this.selectedHighlight.width, height: this.selectedHighlight.height }
                });
            }
        }
        this.startBox = null;
    }

    createNewHighlight(x, y, pageNum, layer) {
        this.boxCounter++;
        const id = `highlight_${Date.now()}_${this.boxCounter}`;
        const highlightData = {
            id, x, y, width: 0, height: 0,
            color: this.currentColor,
            opacity: this.currentOpacity,
            page: pageNum
        };
        const el = document.createElement('div');
        el.className = 'highlight-box';
        el.dataset.id = id;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = '0px';
        el.style.height = '0px';
        el.style.backgroundColor = this.currentColor;
        el.style.opacity = this.currentOpacity;
        ['nw','n','ne','w','e','sw','s','se'].forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });
        layer.appendChild(el);
        highlightData.element = el;
        this.highlights.push(highlightData);
        this.selectedHighlight = highlightData;
        this.selectHighlight(id);
    }

    updateDrawingHighlight(x, y) {
        if (!this.selectedHighlight) return;
        const startX = this.startPos.x;
        const startY = this.startPos.y;
        const newX = Math.min(startX, x);
        const newY = Math.min(startY, y);
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        this.selectedHighlight.x = newX;
        this.selectedHighlight.y = newY;
        this.selectedHighlight.width = width;
        this.selectedHighlight.height = height;
        const el = this.selectedHighlight.element;
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';
    }

    selectHighlight(id) {
        this.highlights.forEach(h => h.element.classList.remove('selected'));
        if (id) {
            const h = this.highlights.find(hl => hl.id === id);
            if (h) {
                h.element.classList.add('selected');
                this.selectedHighlight = h;
                const cp = document.getElementById('highlightColorPicker');
                if (cp) cp.value = h.color;
                const op = document.getElementById('highlightOpacity');
                if (op) op.value = h.opacity;
            }
        } else {
            this.selectedHighlight = null;
        }
    }

    moveHighlight(dx, dy) {
        if (!this.selectedHighlight || !this.startBox) return;
        const newX = this.startBox.x + dx;
        const newY = this.startBox.y + dy;
        this.selectedHighlight.x = newX;
        this.selectedHighlight.y = newY;
        this.selectedHighlight.element.style.left = newX + 'px';
        this.selectedHighlight.element.style.top = newY + 'px';
    }

    resizeHighlight(dx, dy) {
        if (!this.selectedHighlight || !this.startBox) return;
        let { x, y, width, height } = this.startBox;
        switch (this.resizeHandle) {
            case 'se': width = Math.max(10, this.startBox.width + dx); height = Math.max(10, this.startBox.height + dy); break;
            case 'sw': width = Math.max(10, this.startBox.width - dx); height = Math.max(10, this.startBox.height + dy); x = this.startBox.x + (this.startBox.width - width); break;
            case 'ne': width = Math.max(10, this.startBox.width + dx); height = Math.max(10, this.startBox.height - dy); y = this.startBox.y + (this.startBox.height - height); break;
            case 'nw': width = Math.max(10, this.startBox.width - dx); height = Math.max(10, this.startBox.height - dy); x = this.startBox.x + (this.startBox.width - width); y = this.startBox.y + (this.startBox.height - height); break;
            case 'n': height = Math.max(10, this.startBox.height - dy); y = this.startBox.y + (this.startBox.height - height); break;
            case 's': height = Math.max(10, this.startBox.height + dy); break;
            case 'e': width = Math.max(10, this.startBox.width + dx); break;
            case 'w': width = Math.max(10, this.startBox.width - dx); x = this.startBox.x + (this.startBox.width - width); break;
        }
        this.selectedHighlight.x = x;
        this.selectedHighlight.y = y;
        this.selectedHighlight.width = width;
        this.selectedHighlight.height = height;
        const el = this.selectedHighlight.element;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';
    }

    deleteHighlight(id, recordHistory = true) {
        const idx = this.highlights.findIndex(h => h.id === id);
        if (idx === -1) return;
        const h = this.highlights[idx];
        h.element.remove();
        if (recordHistory) {
            this.editor.history.push('delete', 'highlight', { highlight: { ...h, element: undefined } });
        }
        this.highlights.splice(idx, 1);
        if (this.selectedHighlight && this.selectedHighlight.id === id) {
            this.selectedHighlight = null;
        }
    }

    deleteSelected() {
        if (this.selectedHighlight) this.deleteHighlight(this.selectedHighlight.id);
    }

    getAllHighlights() {
        return this.highlights.map(h => ({
            id: h.id, x: h.x, y: h.y, width: h.width, height: h.height,
            color: h.color, opacity: h.opacity, page: h.page
        }));
    }

    clear() {
        this.highlights.forEach(h => h.element.remove());
        this.highlights = [];
        this.selectedHighlight = null;
    }

    lockAll() {
        this.highlights.forEach(h => {
            h.element.style.pointerEvents = 'none';
            h.element.classList.remove('selected');
        });
        this.selectedHighlight = null;
        this.setActive(false);
    }

    unlockAll() {
        this.highlights.forEach(h => {
            h.element.style.pointerEvents = 'auto';
        });
        this.setActive(true);
    }

    applyHistoryAction(action, isUndo) {
        const { type, data } = action;
        switch (type) {
            case 'add':
                if (isUndo) this.deleteHighlight(data.highlight.id, false);
                else this.restoreHighlight(data.highlight);
                break;
            case 'delete':
                if (isUndo) this.restoreHighlight(data.highlight);
                else this.deleteHighlight(data.highlight.id, false);
                break;
            case 'move':
                this.applyMove(data.id, isUndo ? data.from : data.to);
                break;
            case 'resize':
                this.applyResize(data.id, isUndo ? data.from : data.to);
                break;
            case 'color':
                this.applyColor(data.id, isUndo ? data.from : data.to);
                break;
        }
    }

    restoreHighlight(data) {
        const layer = document.querySelector(`.highlight-layer[data-page="${data.page}"]`);
        if (!layer) return;
        const el = document.createElement('div');
        el.className = 'highlight-box';
        el.dataset.id = data.id;
        el.style.left = data.x + 'px';
        el.style.top = data.y + 'px';
        el.style.width = data.width + 'px';
        el.style.height = data.height + 'px';
        el.style.backgroundColor = data.color;
        el.style.opacity = data.opacity;
        ['nw','n','ne','w','e','sw','s','se'].forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });
        layer.appendChild(el);
        this.highlights.push({ ...data, element: el });
    }

    applyMove(id, pos) {
        const h = this.highlights.find(hl => hl.id === id);
        if (!h) return;
        h.x = pos.x; h.y = pos.y;
        h.element.style.left = pos.x + 'px';
        h.element.style.top = pos.y + 'px';
    }

    applyResize(id, dims) {
        const h = this.highlights.find(hl => hl.id === id);
        if (!h) return;
        h.x = dims.x; h.y = dims.y; h.width = dims.width; h.height = dims.height;
        h.element.style.left = dims.x + 'px';
        h.element.style.top = dims.y + 'px';
        h.element.style.width = dims.width + 'px';
        h.element.style.height = dims.height + 'px';
    }

    applyColor(id, color) {
        const h = this.highlights.find(hl => hl.id === id);
        if (!h) return;
        h.color = color;
        h.element.style.backgroundColor = color;
    }
}

window.HighlightTool = HighlightTool;

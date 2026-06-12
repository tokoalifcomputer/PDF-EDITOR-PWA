/**
 * Redaction Tool - Create, resize, drag, color redaction boxes
 */
class RedactionTool {
    constructor(pdfEditor) {
        this.editor = pdfEditor;
        this.boxes = [];           // Array of redaction box data
        this.selectedBox = null;   // Currently selected box
        this.isDrawing = false;    // Drawing new box
        this.isDragging = false;   // Dragging existing box
        this.isResizing = false;   // Resizing box
        this.resizeHandle = null;  // Which handle is being dragged
        this.startPos = { x: 0, y: 0 };
        this.startBox = null;      // Box state at start of drag/resize
        this.currentColor = '#FFFFFF';
        this.boxCounter = 0;

        this.layer = null;         // DOM element for redaction layer
        this.init();
    }

    init() {
        // Create redaction layer on each page
        this.editor.onPageRendered = (pageWrapper, pageNum) => {
            this.createLayer(pageWrapper, pageNum);
        };
    }

    createLayer(pageWrapper, pageNum) {
        const layer = document.createElement('div');
        layer.className = 'redaction-layer';
        layer.dataset.page = pageNum;
        pageWrapper.appendChild(layer);

        // Event listeners for drawing
        layer.addEventListener('mousedown', (e) => this.onMouseDown(e, pageNum));
        layer.addEventListener('mousemove', (e) => this.onMouseMove(e));
        layer.addEventListener('mouseup', (e) => this.onMouseUp(e));

        // Touch support
        layer.addEventListener('touchstart', (e) => this.onTouchStart(e, pageNum), {passive: false});
        layer.addEventListener('touchmove', (e) => this.onTouchMove(e), {passive: false});
        layer.addEventListener('touchend', (e) => this.onTouchEnd(e));
    }

    setActive(active) {
        const layers = document.querySelectorAll('.redaction-layer');
        layers.forEach(layer => {
            if (active) {
                layer.classList.add('active');
            } else {
                layer.classList.remove('active');
            }
        });
    }

    setColor(color) {
        this.currentColor = color;
        if (this.selectedBox) {
            const oldColor = this.selectedBox.color;
            this.selectedBox.color = color;
            this.selectedBox.element.style.backgroundColor = color;

            // Push to history
            this.editor.history.push('color', 'redaction', {
                id: this.selectedBox.id,
                from: oldColor,
                to: color
            });
        }
    }

    // Mouse Events
    onMouseDown(e, pageNum) {
        if (!this.editor.isRedactMode) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking on resize handle
        const handle = e.target.closest('.resize-handle');
        if (handle) {
            this.isResizing = true;
            this.resizeHandle = handle.classList[1]; // nw, n, ne, etc.
            this.selectedBox = this.boxes.find(b => b.id === handle.parentElement.dataset.id);
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedBox };
            e.stopPropagation();
            return;
        }

        // Check if clicking on existing box
        const boxEl = e.target.closest('.redaction-box');
        if (boxEl) {
            this.selectBox(boxEl.dataset.id);
            this.isDragging = true;
            this.startPos = { x: e.clientX, y: e.clientY };
            this.startBox = { ...this.selectedBox };
            e.stopPropagation();
            return;
        }

        // Start drawing new box
        this.isDrawing = true;
        this.startPos = { x, y };
        this.createNewBox(x, y, pageNum, e.currentTarget);
    }

    onMouseMove(e) {
        if (!this.editor.isRedactMode) return;

        if (this.isDrawing && this.selectedBox) {
            const layer = e.currentTarget;
            const rect = layer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.updateDrawingBox(x, y);
        } else if (this.isDragging && this.selectedBox) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.moveBox(dx, dy);
        } else if (this.isResizing && this.selectedBox) {
            const dx = e.clientX - this.startPos.x;
            const dy = e.clientY - this.startPos.y;
            this.resizeBox(dx, dy);
        }
    }

    onMouseUp(e) {
        if (this.isDrawing) {
            this.isDrawing = false;
            if (this.selectedBox) {
                const { width, height } = this.selectedBox;
                // Delete if too small
                if (width < 10 || height < 10) {
                    this.deleteBox(this.selectedBox.id, false);
                    this.selectedBox = null;
                } else {
                    this.editor.history.push('add', 'redaction', {
                        box: { ...this.selectedBox }
                    });
                }
            }
        } else if (this.isDragging) {
            this.isDragging = false;
            if (this.selectedBox && this.startBox) {
                const dx = this.selectedBox.x - this.startBox.x;
                const dy = this.selectedBox.y - this.startBox.y;
                if (dx !== 0 || dy !== 0) {
                    this.editor.history.push('move', 'redaction', {
                        id: this.selectedBox.id,
                        from: { x: this.startBox.x, y: this.startBox.y },
                        to: { x: this.selectedBox.x, y: this.selectedBox.y }
                    });
                }
            }
        } else if (this.isResizing) {
            this.isResizing = false;
            if (this.selectedBox && this.startBox) {
                this.editor.history.push('resize', 'redaction', {
                    id: this.selectedBox.id,
                    from: { 
                        x: this.startBox.x, y: this.startBox.y,
                        width: this.startBox.width, height: this.startBox.height 
                    },
                    to: { 
                        x: this.selectedBox.x, y: this.selectedBox.y,
                        width: this.selectedBox.width, height: this.selectedBox.height 
                    }
                });
            }
        }
        this.startBox = null;
    }

    // Touch Events (mobile support)
    onTouchStart(e, pageNum) {
        if (!this.editor.isRedactMode) return;
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.onMouseDown(mouseEvent, pageNum);
    }

    onTouchMove(e) {
        if (!this.editor.isRedactMode) return;
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.onMouseMove(mouseEvent);
    }

    onTouchEnd(e) {
        const mouseEvent = new MouseEvent('mouseup', {});
        this.onMouseUp(mouseEvent);
    }

    // Box Creation
    createNewBox(x, y, pageNum, layer) {
        this.boxCounter++;
        const id = `redact_${Date.now()}_${this.boxCounter}`;

        const boxData = {
            id,
            x, y,
            width: 0, height: 0,
            color: this.currentColor,
            opacity: 1.0,
            page: pageNum
        };

        const el = document.createElement('div');
        el.className = 'redaction-box';
        el.dataset.id = id;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = '0px';
        el.style.height = '0px';
        el.style.backgroundColor = this.currentColor;

        // Add resize handles
        const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
        handles.forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });

        layer.appendChild(el);

        boxData.element = el;
        this.boxes.push(boxData);
        this.selectedBox = boxData;
        this.selectBox(id);
    }

    updateDrawingBox(x, y) {
        if (!this.selectedBox) return;

        const startX = this.startPos.x;
        const startY = this.startPos.y;

        const newX = Math.min(startX, x);
        const newY = Math.min(startY, y);
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);

        this.selectedBox.x = newX;
        this.selectedBox.y = newY;
        this.selectedBox.width = width;
        this.selectedBox.height = height;

        const el = this.selectedBox.element;
        el.style.left = newX + 'px';
        el.style.top = newY + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';
    }

    // Selection
    selectBox(id) {
        // Deselect all
        this.boxes.forEach(b => {
            b.element.classList.remove('selected');
        });

        if (id) {
            const box = this.boxes.find(b => b.id === id);
            if (box) {
                box.element.classList.add('selected');
                this.selectedBox = box;
                // Update color picker
                const colorPicker = document.getElementById('colorPicker');
                if (colorPicker) colorPicker.value = box.color;
            }
        } else {
            this.selectedBox = null;
        }
    }

    // Move
    moveBox(dx, dy) {
        if (!this.selectedBox || !this.startBox) return;

        const newX = this.startBox.x + dx;
        const newY = this.startBox.y + dy;

        this.selectedBox.x = newX;
        this.selectedBox.y = newY;
        this.selectedBox.element.style.left = newX + 'px';
        this.selectedBox.element.style.top = newY + 'px';
    }

    // Resize
    resizeBox(dx, dy) {
        if (!this.selectedBox || !this.startBox) return;

        let { x, y, width, height } = this.startBox;

        switch (this.resizeHandle) {
            case 'se':
                width = Math.max(10, this.startBox.width + dx);
                height = Math.max(10, this.startBox.height + dy);
                break;
            case 'sw':
                width = Math.max(10, this.startBox.width - dx);
                height = Math.max(10, this.startBox.height + dy);
                x = this.startBox.x + (this.startBox.width - width);
                break;
            case 'ne':
                width = Math.max(10, this.startBox.width + dx);
                height = Math.max(10, this.startBox.height - dy);
                y = this.startBox.y + (this.startBox.height - height);
                break;
            case 'nw':
                width = Math.max(10, this.startBox.width - dx);
                height = Math.max(10, this.startBox.height - dy);
                x = this.startBox.x + (this.startBox.width - width);
                y = this.startBox.y + (this.startBox.height - height);
                break;
            case 'n':
                height = Math.max(10, this.startBox.height - dy);
                y = this.startBox.y + (this.startBox.height - height);
                break;
            case 's':
                height = Math.max(10, this.startBox.height + dy);
                break;
            case 'e':
                width = Math.max(10, this.startBox.width + dx);
                break;
            case 'w':
                width = Math.max(10, this.startBox.width - dx);
                x = this.startBox.x + (this.startBox.width - width);
                break;
        }

        this.selectedBox.x = x;
        this.selectedBox.y = y;
        this.selectedBox.width = width;
        this.selectedBox.height = height;

        const el = this.selectedBox.element;
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.width = width + 'px';
        el.style.height = height + 'px';
    }

    // Delete
    deleteBox(id, recordHistory = true) {
        const index = this.boxes.findIndex(b => b.id === id);
        if (index === -1) return;

        const box = this.boxes[index];
        box.element.remove();

        if (recordHistory) {
            this.editor.history.push('delete', 'redaction', {
                box: { ...box, element: undefined }
            });
        }

        this.boxes.splice(index, 1);
        if (this.selectedBox && this.selectedBox.id === id) {
            this.selectedBox = null;
        }
    }

    deleteSelected() {
        if (this.selectedBox) {
            this.deleteBox(this.selectedBox.id);
        }
    }

    // Get all boxes for export
    getAllBoxes() {
        return this.boxes.map(b => ({
            id: b.id,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            color: b.color,
            page: b.page
        }));
    }

    // Clear all
    clear() {
        this.boxes.forEach(b => b.element.remove());
        this.boxes = [];
        this.selectedBox = null;
    }

    // Apply history action (undo/redo)
    applyHistoryAction(action, isUndo) {
        const { type, data } = action;

        switch (type) {
            case 'add':
                if (isUndo) {
                    this.deleteBox(data.box.id, false);
                } else {
                    this.restoreBox(data.box);
                }
                break;
            case 'delete':
                if (isUndo) {
                    this.restoreBox(data.box);
                } else {
                    this.deleteBox(data.box.id, false);
                }
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

    restoreBox(boxData) {
        const layer = document.querySelector(`.redaction-layer[data-page="${boxData.page}"]`);
        if (!layer) return;

        const el = document.createElement('div');
        el.className = 'redaction-box';
        el.dataset.id = boxData.id;
        el.style.left = boxData.x + 'px';
        el.style.top = boxData.y + 'px';
        el.style.width = boxData.width + 'px';
        el.style.height = boxData.height + 'px';
        el.style.backgroundColor = boxData.color;

        const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
        handles.forEach(h => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${h}`;
            el.appendChild(handle);
        });

        layer.appendChild(el);

        const newBox = { ...boxData, element: el };
        this.boxes.push(newBox);
    }

    applyMove(id, pos) {
        const box = this.boxes.find(b => b.id === id);
        if (!box) return;
        box.x = pos.x;
        box.y = pos.y;
        box.element.style.left = pos.x + 'px';
        box.element.style.top = pos.y + 'px';
    }

    applyResize(id, dims) {
        const box = this.boxes.find(b => b.id === id);
        if (!box) return;
        box.x = dims.x;
        box.y = dims.y;
        box.width = dims.width;
        box.height = dims.height;
        box.element.style.left = dims.x + 'px';
        box.element.style.top = dims.y + 'px';
        box.element.style.width = dims.width + 'px';
        box.element.style.height = dims.height + 'px';
    }

    applyColor(id, color) {
        const box = this.boxes.find(b => b.id === id);
        if (!box) return;
        box.color = color;
        box.element.style.backgroundColor = color;
    }

    // Lock all boxes (when switching to text mode)
    lockAll() {
        this.boxes.forEach(b => {
            b.element.style.pointerEvents = 'none';
            b.element.classList.remove('selected');
        });
        this.selectedBox = null;
        this.setActive(false);
    }

    // Unlock (when switching back to redact mode - not used in this workflow)
    unlockAll() {
        this.boxes.forEach(b => {
            b.element.style.pointerEvents = 'auto';
        });
        this.setActive(true);
    }
}

window.RedactionTool = RedactionTool;

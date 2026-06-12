/**
 * Text Tool - Add text boxes with font family, size, and color
 * FIXED: 
 * 1. Text always visible and interactive even when text mode is inactive
 * 2. Text boxes preserved when zoom/scale changes (re-rendering)
 * 3. Proper lock/unlock behavior
 */
class TextTool {
  constructor(pdfEditor) {
    this.editor = pdfEditor;
    this.texts = [];
    this.selectedText = null;
    this.isAdding = false;
    this.isDragging = false;
    this.isResizing = false;
    this.resizeHandle = null;
    this.startPos = { x: 0, y: 0 };
    this.startBox = null;
    this.boxCounter = 0;
    this.init();
  }

  init() {
    // Register callbacks with PDF engine for save/restore during re-render
    if (this.editor.pdfEngine) {
      this.editor.pdfEngine.onBeforeRender = () => this.saveAnnotations();
      this.editor.pdfEngine.onAfterRender = (data) => this.restoreAnnotations(data);
    }

    this.editor.onPageRendered = (pageWrapper, pageNum) => {
      this.createLayer(pageWrapper, pageNum);
    };
  }

  // NEW: Save all text annotations before PDF re-renders (zoom change)
  saveAnnotations() {
    return {
      texts: this.getAllTexts(),
      selectedId: this.selectedText ? this.selectedText.id : null
    };
  }

  // NEW: Restore text annotations after PDF re-renders
  restoreAnnotations(data) {
    if (!data || !data.texts) return;

    // Clear current DOM elements (they were destroyed during re-render)
    this.texts.forEach(t => {
      if (t.element && t.element.parentNode) {
        t.element.remove();
      }
    });
    this.texts = [];

    // Recreate text boxes from saved data
    data.texts.forEach(textData => {
      const layer = document.querySelector(`.text-layer[data-page="${textData.page}"]`);
      if (!layer) return;

      const el = document.createElement('div');
      el.className = 'text-box';
      if (data.selectedId === textData.id) {
        el.classList.add('selected');
      }
      el.dataset.id = textData.id;
      el.contentEditable = true;
      el.style.left = textData.x + 'px';
      el.style.top = textData.y + 'px';
      el.style.fontSize = textData.fontSize + 'px';
      el.style.color = textData.color;
      el.style.fontFamily = textData.fontFamily || 'Arial, sans-serif';
      el.style.width = (textData.width || 50) + 'px';
      el.style.height = (textData.height || 20) + 'px';
      el.innerText = textData.text || '';

      // Add resize handles
      const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
      handles.forEach(h => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${h}`;
        el.appendChild(handle);
      });

      // Events
      el.addEventListener('focus', () => this.selectText(textData.id));
      el.addEventListener('blur', () => this.onBlur(textData.id));
      el.addEventListener('keydown', (e) => this.onKeyDown(e, textData.id));
      el.addEventListener('input', () => this.onInput(textData.id));

      layer.appendChild(el);

      const newText = { ...textData, element: el };
      this.texts.push(newText);

      if (data.selectedId === textData.id) {
        this.selectedText = newText;
      }
    });
  }

  createLayer(pageWrapper, pageNum) {
    let layer = pageWrapper.querySelector('.text-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'text-layer';
      layer.dataset.page = pageNum;
      pageWrapper.appendChild(layer);
    }
    layer.addEventListener('click', (e) => this.onClick(e, pageNum));
    layer.addEventListener('mousedown', (e) => this.onMouseDown(e));
    layer.addEventListener('mousemove', (e) => this.onMouseMove(e));
    layer.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }

  setActive(active) {
    document.querySelectorAll('.text-layer').forEach(layer => {
      active ? layer.classList.add('active') : layer.classList.remove('active');
    });
  }

  // NEW: Lock all text boxes (when switching to other modes)
  lockAll() {
    this.texts.forEach(t => {
      t.element.classList.remove('selected');
      // Don't set pointer-events: none - text boxes should always be interactive!
      // t.element.style.pointerEvents = 'none';  // REMOVED
    });
    this.selectedText = null;
    this.setActive(false);
  }

  // NEW: Unlock text boxes (when switching back to text mode)
  unlockAll() {
    this.setActive(true);
  }

  onClick(e, pageNum) {
    if (!this.editor.isTextMode) return;
    if (e.target.closest('.text-box')) return;

    const layer = e.currentTarget;
    const rect = layer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.createTextBox(x, y, pageNum, layer);
  }

  createTextBox(x, y, pageNum, layer) {
    this.boxCounter++;
    const id = `text_${Date.now()}_${this.boxCounter}`;

    const el = document.createElement('div');
    el.className = 'text-box selected';
    el.dataset.id = id;
    el.contentEditable = true;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.fontSize = this.editor.textSize + 'px';
    el.style.color = this.editor.textColor;
    el.style.fontFamily = this.editor.textFont || 'Arial, sans-serif';
    el.style.minWidth = '50px';
    el.style.minHeight = '20px';
    el.style.width = 'auto';
    el.style.height = 'auto';

    // Add resize handles
    const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    handles.forEach(h => {
      const handle = document.createElement('div');
      handle.className = `resize-handle ${h}`;
      el.appendChild(handle);
    });

    // Focus immediately
    setTimeout(() => {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);

    // Events
    el.addEventListener('focus', () => this.selectText(id));
    el.addEventListener('blur', () => this.onBlur(id));
    el.addEventListener('keydown', (e) => this.onKeyDown(e, id));
    el.addEventListener('input', () => this.onInput(id));

    layer.appendChild(el);

    const textData = {
      id,
      x, y,
      text: '',
      fontSize: this.editor.textSize,
      fontFamily: this.editor.textFont || 'Arial, sans-serif',
      color: this.editor.textColor,
      page: pageNum,
      width: 50,
      height: 20,
      element: el
    };

    this.texts.push(textData);
    this.selectedText = textData;
    this.isAdding = true;

    this.editor.history.push('add', 'text', {
      text: { ...textData, element: undefined }
    });
  }

  onMouseDown(e) {
    if (!this.editor.isTextMode) return;

    const handle = e.target.closest('.resize-handle');
    if (handle) {
      this.isResizing = true;
      this.resizeHandle = handle.classList[1];
      this.selectedText = this.texts.find(t => t.id === handle.parentElement.dataset.id);
      this.startPos = { x: e.clientX, y: e.clientY };
      this.startBox = { ...this.selectedText };
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    const boxEl = e.target.closest('.text-box');
    if (boxEl) {
      if (e.target === boxEl || e.target.classList.contains('resize-handle')) {
        this.selectText(boxEl.dataset.id);
        this.isDragging = true;
        this.startPos = { x: e.clientX, y: e.clientY };
        this.startBox = { ...this.selectedText };
        e.stopPropagation();
      }
    }
  }

  onMouseMove(e) {
    if (!this.editor.isTextMode) return;
    if (this.isDragging && this.selectedText) {
      const dx = e.clientX - this.startPos.x;
      const dy = e.clientY - this.startPos.y;
      this.moveText(dx, dy);
    } else if (this.isResizing && this.selectedText) {
      const dx = e.clientX - this.startPos.x;
      const dy = e.clientY - this.startPos.y;
      this.resizeText(dx, dy);
    }
  }

  onMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      if (this.selectedText && this.startBox) {
        const dx = this.selectedText.x - this.startBox.x;
        const dy = this.selectedText.y - this.startBox.y;
        if (dx !== 0 || dy !== 0) {
          this.editor.history.push('move', 'text', {
            id: this.selectedText.id,
            from: { x: this.startBox.x, y: this.startBox.y },
            to: { x: this.selectedText.x, y: this.selectedText.y }
          });
        }
      }
    } else if (this.isResizing) {
      this.isResizing = false;
      if (this.selectedText && this.startBox) {
        this.editor.history.push('resize', 'text', {
          id: this.selectedText.id,
          from: {
            x: this.startBox.x, y: this.startBox.y,
            width: this.startBox.width, height: this.startBox.height,
            fontSize: this.startBox.fontSize
          },
          to: {
            x: this.selectedText.x, y: this.selectedText.y,
            width: this.selectedText.width, height: this.selectedText.height,
            fontSize: this.selectedText.fontSize
          }
        });
      }
    }
    this.startBox = null;
  }

  moveText(dx, dy) {
    if (!this.selectedText || !this.startBox) return;
    const newX = this.startBox.x + dx;
    const newY = this.startBox.y + dy;
    this.selectedText.x = newX;
    this.selectedText.y = newY;
    this.selectedText.element.style.left = newX + 'px';
    this.selectedText.element.style.top = newY + 'px';
  }

  resizeText(dx, dy) {
    if (!this.selectedText || !this.startBox) return;
    let { x, y, width, height, fontSize } = this.startBox;

    switch (this.resizeHandle) {
      case 'se':
        width = Math.max(50, this.startBox.width + dx);
        height = Math.max(20, this.startBox.height + dy);
        break;
      case 'sw':
        width = Math.max(50, this.startBox.width - dx);
        height = Math.max(20, this.startBox.height + dy);
        x = this.startBox.x + (this.startBox.width - width);
        break;
      case 'ne':
        width = Math.max(50, this.startBox.width + dx);
        height = Math.max(20, this.startBox.height - dy);
        y = this.startBox.y + (this.startBox.height - height);
        break;
      case 'nw':
        width = Math.max(50, this.startBox.width - dx);
        height = Math.max(20, this.startBox.height - dy);
        x = this.startBox.x + (this.startBox.width - width);
        y = this.startBox.y + (this.startBox.height - height);
        break;
      case 'n':
        height = Math.max(20, this.startBox.height - dy);
        y = this.startBox.y + (this.startBox.height - height);
        break;
      case 's':
        height = Math.max(20, this.startBox.height + dy);
        break;
      case 'e':
        width = Math.max(50, this.startBox.width + dx);
        break;
      case 'w':
        width = Math.max(50, this.startBox.width - dx);
        x = this.startBox.x + (this.startBox.width - width);
        break;
    }

    const newFontSize = Math.max(8, Math.round(height * 0.6));

    this.selectedText.x = x;
    this.selectedText.y = y;
    this.selectedText.width = width;
    this.selectedText.height = height;
    this.selectedText.fontSize = newFontSize;

    const el = this.selectedText.element;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.style.fontSize = newFontSize + 'px';
  }

  onInput(id) {
    const text = this.texts.find(t => t.id === id);
    if (text) {
      text.text = text.element.innerText;
      const newWidth = Math.max(text.width || 50, text.element.scrollWidth + 16);
      text.element.style.width = newWidth + 'px';
      text.width = newWidth;
      text.height = text.element.offsetHeight;
    }
  }

  selectText(id) {
    this.texts.forEach(t => {
      t.element.classList.remove('selected');
    });

    if (id) {
      const text = this.texts.find(t => t.id === id);
      if (text) {
        text.element.classList.add('selected');
        this.selectedText = text;
        this.editor.updateTextToolbar(text);
      }
    } else {
      this.selectedText = null;
    }
  }

  onBlur(id) {
    const text = this.texts.find(t => t.id === id);
    if (!text) return;

    text.text = text.element.innerText;
    text.width = text.element.offsetWidth;
    text.height = text.element.offsetHeight;

    text.element.classList.remove('selected');
    this.selectedText = null;
    this.isAdding = false;
  }

  onKeyDown(e, id) {
    if (e.key === 'Escape') {
      e.target.blur();
    }
    if (e.key === 'Delete' && e.target.innerText.trim() === '') {
      this.deleteText(id);
      e.preventDefault();
    }
  }

  deleteText(id, recordHistory = true) {
    const index = this.texts.findIndex(t => t.id === id);
    if (index === -1) return;

    const text = this.texts[index];
    text.element.remove();

    if (recordHistory) {
      this.editor.history.push('delete', 'text', {
        text: { ...text, element: undefined }
      });
    }

    this.texts.splice(index, 1);
    if (this.selectedText && this.selectedText.id === id) {
      this.selectedText = null;
    }
  }

  deleteSelected() {
    if (this.selectedText) {
      this.deleteText(this.selectedText.id);
    }
  }

  setFontSize(size) {
    this.editor.textSize = size;
    if (this.selectedText) {
      this.selectedText.fontSize = size;
      this.selectedText.element.style.fontSize = size + 'px';
      const newHeight = Math.max(20, Math.round(size / 0.6));
      this.selectedText.height = newHeight;
      this.selectedText.element.style.height = newHeight + 'px';
    }
  }

  setFontFamily(font) {
    this.editor.textFont = font;
    if (this.selectedText) {
      this.selectedText.fontFamily = font;
      this.selectedText.element.style.fontFamily = font;
    }
  }

  setColor(color) {
    this.editor.textColor = color;
    if (this.selectedText) {
      this.selectedText.color = color;
      this.selectedText.element.style.color = color;
    }
  }

  getAllTexts() {
    return this.texts.map(t => ({
      id: t.id,
      x: t.x,
      y: t.y,
      text: t.text,
      fontSize: t.fontSize,
      fontFamily: t.fontFamily,
      color: t.color,
      page: t.page,
      width: t.width,
      height: t.height
    }));
  }

  clear() {
    this.texts.forEach(t => t.element.remove());
    this.texts = [];
    this.selectedText = null;
  }

  applyHistoryAction(action, isUndo) {
    const { type, data } = action;

    switch (type) {
      case 'add':
        if (isUndo) {
          this.deleteText(data.text.id, false);
        } else {
          this.restoreText(data.text);
        }
        break;
      case 'delete':
        if (isUndo) {
          this.restoreText(data.text);
        } else {
          this.deleteText(data.text.id, false);
        }
        break;
      case 'move':
        this.applyMove(data.id, isUndo ? data.from : data.to);
        break;
      case 'resize':
        this.applyResize(data.id, isUndo ? data.from : data.to);
        break;
    }
  }

  restoreText(textData) {
    const layer = document.querySelector(`.text-layer[data-page="${textData.page}"]`);
    if (!layer) return;

    const el = document.createElement('div');
    el.className = 'text-box';
    el.dataset.id = textData.id;
    el.contentEditable = true;
    el.style.left = textData.x + 'px';
    el.style.top = textData.y + 'px';
    el.style.fontSize = textData.fontSize + 'px';
    el.style.color = textData.color;
    el.style.fontFamily = textData.fontFamily || 'Arial, sans-serif';
    el.style.width = (textData.width || 50) + 'px';
    el.style.height = (textData.height || 20) + 'px';
    el.innerText = textData.text || '';

    const handles = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'];
    handles.forEach(h => {
      const handle = document.createElement('div');
      handle.className = `resize-handle ${h}`;
      el.appendChild(handle);
    });

    el.addEventListener('focus', () => this.selectText(textData.id));
    el.addEventListener('blur', () => this.onBlur(textData.id));
    el.addEventListener('input', () => this.onInput(textData.id));

    layer.appendChild(el);

    const newText = { ...textData, element: el };
    this.texts.push(newText);
  }

  applyMove(id, pos) {
    const text = this.texts.find(t => t.id === id);
    if (!text) return;
    text.x = pos.x;
    text.y = pos.y;
    text.element.style.left = pos.x + 'px';
    text.element.style.top = pos.y + 'px';
  }

  applyResize(id, dims) {
    const text = this.texts.find(t => t.id === id);
    if (!text) return;
    text.x = dims.x;
    text.y = dims.y;
    text.width = dims.width;
    text.height = dims.height;
    text.fontSize = dims.fontSize || text.fontSize;
    text.element.style.left = dims.x + 'px';
    text.element.style.top = dims.y + 'px';
    text.element.style.width = dims.width + 'px';
    text.element.style.height = dims.height + 'px';
    text.element.style.fontSize = (dims.fontSize || text.fontSize) + 'px';
  }
}

window.TextTool = TextTool;

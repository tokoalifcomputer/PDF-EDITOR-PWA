/**
 * History Manager - Undo/Redo System
 */
class HistoryManager {
    constructor() {
        this.stack = [];
        this.index = -1;
        this.maxSize = 100;
    }

    /**
     * Push a new action to history
     * @param {string} type - Action type: 'add', 'delete', 'move', 'resize', 'color', 'batch'
     * @param {string} targetType - 'redaction', 'text', 'image'
     * @param {Object} data - Action data
     */
    push(type, targetType, data) {
        // Remove any redo states
        if (this.index < this.stack.length - 1) {
            this.stack = this.stack.slice(0, this.index + 1);
        }

        this.stack.push({
            type,
            targetType,
            data,
            timestamp: Date.now()
        });

        // Limit history size
        if (this.stack.length > this.maxSize) {
            this.stack.shift();
        } else {
            this.index++;
        }

        this.updateUI();
    }

    /**
     * Undo last action
     * @returns {Object|null} The undone action or null
     */
    undo() {
        if (this.index < 0) return null;

        const action = this.stack[this.index];
        this.index--;
        this.updateUI();
        return action;
    }

    /**
     * Redo last undone action
     * @returns {Object|null} The redone action or null
     */
    redo() {
        if (this.index >= this.stack.length - 1) return null;

        this.index++;
        const action = this.stack[this.index];
        this.updateUI();
        return action;
    }

    /**
     * Check if can undo
     */
    canUndo() {
        return this.index >= 0;
    }

    /**
     * Check if can redo
     */
    canRedo() {
        return this.index < this.stack.length - 1;
    }

    /**
     * Clear all history
     */
    clear() {
        this.stack = [];
        this.index = -1;
        this.updateUI();
    }

    /**
     * Update undo/redo button states
     */
    updateUI() {
        const undoBtn = document.getElementById('btnUndo');
        const redoBtn = document.getElementById('btnRedo');

        if (undoBtn) undoBtn.disabled = !this.canUndo();
        if (redoBtn) redoBtn.disabled = !this.canRedo();
    }

    /**
     * Get current state for debugging
     */
    getState() {
        return {
            stackLength: this.stack.length,
            index: this.index,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }
}

// Export for use in other modules
window.HistoryManager = HistoryManager;

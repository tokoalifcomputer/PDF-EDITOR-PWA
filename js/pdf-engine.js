/**
 * PDF Engine - Render PDF pages using PDF.js
 */
class PDFEngine {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.5;
        this.pageWrappers = [];
        this.onPageRendered = null;
        this.currentDataUrl = null;
    }

    async loadPDF(dataUrl) {
        this.currentDataUrl = dataUrl;

        try {
            // Polyfill Promise.withResolvers for older browsers
            if (typeof Promise.withResolvers === 'undefined') {
                Promise.withResolvers = function() {
                    let resolve, reject;
                    const promise = new Promise((res, rej) => {
                        resolve = res;
                        reject = rej;
                    });
                    return { promise, resolve, reject };
                };
            }

            // Load PDF.js from CDN
            if (typeof pdfjsLib === 'undefined') {
                await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
                if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
            }

            // Convert data URL to Uint8Array for PDF.js
            const pdfData = this.dataUrlToUint8Array(dataUrl);

            // Load PDF document
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;

            this.container.innerHTML = '';
            this.pageWrappers = [];

            // Render all pages
            for (let i = 1; i <= this.totalPages; i++) {
                await this.renderPage(i);
            }

            return true;
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.container.innerHTML = '<div class="loading">❌ Gagal memuat PDF.<br><small>' + error.message + '</small><br><br><button class="btn-primary" onclick="location.reload()">Coba Lagi</button></div>';
            return false;
        }
    }

    async renderPage(pageNum) {
        const page = await this.pdfDoc.getPage(pageNum);

        // Calculate scale to fit container width (with padding)
        const containerWidth = this.container.clientWidth - 48; // 24px padding each side
        const viewportUnscaled = page.getViewport({ scale: 1.0 });

        // Auto-scale to fit width, but not smaller than 0.5
        let autoScale = containerWidth / viewportUnscaled.width;
        autoScale = Math.max(autoScale, 0.5);
        autoScale = Math.min(autoScale, 2.0); // Max 2x

        // Use user zoom or auto-scale
        const finalScale = this.scale !== 1.5 ? this.scale : autoScale;

        const viewport = page.getViewport({ scale: finalScale });

        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-page-wrapper';
        wrapper.style.width = viewport.width + 'px';
        wrapper.style.height = viewport.height + 'px';
        wrapper.style.maxWidth = '100%';
        wrapper.dataset.page = pageNum;

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        canvas.style.maxWidth = '100%';
        const ctx = canvas.getContext('2d');

        wrapper.appendChild(canvas);
        this.container.appendChild(wrapper);
        this.pageWrappers.push(wrapper);

        // Render PDF page to canvas
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // Callback for tool initialization
        if (this.onPageRendered) {
            this.onPageRendered(wrapper, pageNum);
        }

        return wrapper;
    }

    dataUrlToUint8Array(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    setScale(newScale) {
        this.scale = newScale;
        if (this.pdfDoc && this.currentDataUrl) {
            this.loadPDF(this.currentDataUrl);
        }
    }

    zoomIn() {
        this.setScale(Math.min(this.scale + 0.25, 3.0));
    }

    zoomOut() {
        this.setScale(Math.max(this.scale - 0.25, 0.5));
    }

    goToPage(pageNum) {
        if (pageNum >= 1 && pageNum <= this.totalPages) {
            this.currentPage = pageNum;
            const wrapper = this.pageWrappers[pageNum - 1];
            if (wrapper) {
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    nextPage() {
        this.goToPage(this.currentPage + 1);
    }

    prevPage() {
        this.goToPage(this.currentPage - 1);
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

    getPageDimensions(pageNum) {
        const wrapper = this.pageWrappers[pageNum - 1];
        if (!wrapper) return null;
        return {
            width: wrapper.offsetWidth,
            height: wrapper.offsetHeight
        };
    }
}

window.PDFEngine = PDFEngine;

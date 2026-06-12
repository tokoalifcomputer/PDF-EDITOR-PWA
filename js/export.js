/**
 * Export Module - Burn all annotations into PDF
 */
class PDFExporter {
    constructor() {
        this.pdfLibLoaded = false;
    }

    async loadPDFLib() {
        if (this.pdfLibLoaded) return;

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

    async exportPDF(originalDataUrl, redactions, highlights, images, signatures, texts, rotateCropTool) {
        await this.loadPDFLib();

        try {
            const pdfBytes = await this.dataUrlToBytes(originalDataUrl);
            const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
            const pages = pdfDoc.getPages();

            // Embed fonts
            const fonts = {};
            fonts['Helvetica'] = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
            fonts['Helvetica-Bold'] = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
            fonts['TimesRoman'] = await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
            fonts['Courier'] = await pdfDoc.embedFont(PDFLib.StandardFonts.Courier);

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const pageNum = i + 1;
                const { width: pageWidth, height: pageHeight } = page.getSize();

                const wrapper = document.querySelector(`.pdf-page-wrapper[data-page="${pageNum}"]`);
                if (!wrapper) continue;

                const wrapperWidth = wrapper.offsetWidth;
                const wrapperHeight = wrapper.offsetHeight;

                const scaleX = pageWidth / wrapperWidth;
                const scaleY = pageHeight / wrapperHeight;

                const rotation = rotateCropTool ? rotateCropTool.getPageRotation(pageNum) : 0;
                const crop = rotateCropTool ? rotateCropTool.getPageCrop(pageNum) : null;

                // Redactions
                const pageRedactions = redactions.filter(r => r.page === pageNum);
                for (const redact of pageRedactions) {
                    const coords = this.transformCoords(redact.x, redact.y, redact.width, redact.height, 
                                                        wrapperWidth, wrapperHeight, pageWidth, pageHeight, rotation, crop);
                    const rgb = this.hexToRgb(redact.color);

                    page.drawRectangle({
                        x: coords.x,
                        y: coords.y,
                        width: coords.w,
                        height: coords.h,
                        color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                        opacity: redact.opacity || 1.0
                    });
                }

                // Highlights
                const pageHighlights = highlights.filter(h => h.page === pageNum);
                for (const hl of pageHighlights) {
                    const coords = this.transformCoords(hl.x, hl.y, hl.width, hl.height,
                                                        wrapperWidth, wrapperHeight, pageWidth, pageHeight, rotation, crop);
                    const rgb = this.hexToRgb(hl.color);

                    page.drawRectangle({
                        x: coords.x,
                        y: coords.y,
                        width: coords.w,
                        height: coords.h,
                        color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255),
                        opacity: hl.opacity || 0.4
                    });
                }

                // Images
                const pageImages = images.filter(img => img.page === pageNum);
                for (const img of pageImages) {
                    try {
                        const imgBytes = await this.dataUrlToBytes(img.src);
                        let embeddedImg;
                        if (img.src.includes('image/png')) {
                            embeddedImg = await pdfDoc.embedPng(imgBytes);
                        } else if (img.src.includes('image/jpeg') || img.src.includes('image/jpg')) {
                            embeddedImg = await pdfDoc.embedJpg(imgBytes);
                        } else {
                            continue;
                        }

                        const coords = this.transformCoords(img.x, img.y, img.width, img.height,
                                                              wrapperWidth, wrapperHeight, pageWidth, pageHeight, rotation, crop);

                        page.drawImage(embeddedImg, {
                            x: coords.x,
                            y: coords.y,
                            width: coords.w,
                            height: coords.h
                        });
                    } catch (imgError) {
                        console.warn('Failed to embed image:', imgError);
                    }
                }

                // Signatures
                const pageSignatures = signatures.filter(s => s.page === pageNum);
                for (const sig of pageSignatures) {
                    try {
                        const sigBytes = await this.dataUrlToBytes(sig.src);
                        const embeddedSig = await pdfDoc.embedPng(sigBytes);

                        const coords = this.transformCoords(sig.x, sig.y, sig.width, sig.height,
                                                              wrapperWidth, wrapperHeight, pageWidth, pageHeight, rotation, crop);

                        page.drawImage(embeddedSig, {
                            x: coords.x,
                            y: coords.y,
                            width: coords.w,
                            height: coords.h
                        });
                    } catch (sigError) {
                        console.warn('Failed to embed signature:', sigError);
                    }
                }

                // Texts
                const pageTexts = texts.filter(t => t.page === pageNum);
                for (const text of pageTexts) {
                    const coords = this.transformCoords(text.x, text.y, text.width, text.height,
                                                        wrapperWidth, wrapperHeight, pageWidth, pageHeight, rotation, crop);
                    const rgb = this.hexToRgb(text.color);

                    // Map font family
                    let font = fonts['Helvetica'];
                    const fontFamily = text.fontFamily || 'Arial, sans-serif';
                    if (fontFamily.includes('Times')) font = fonts['TimesRoman'];
                    else if (fontFamily.includes('Courier')) font = fonts['Courier'];

                    const pdfFontSize = text.fontSize * scaleY;

                    page.drawText(text.text, {
                        x: coords.x,
                        y: coords.y + pdfFontSize * 0.8,
                        size: pdfFontSize,
                        font: font,
                        color: PDFLib.rgb(rgb.r / 255, rgb.g / 255, rgb.b / 255)
                    });
                }
            }

            // Save and download
            const modifiedPdfBytes = await pdfDoc.save();
            const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });

            const originalName = sessionStorage.getItem('pdfName') || localStorage.getItem('pdfName') || 'document.pdf';
            const newName = originalName.replace('.pdf', '_edited.pdf');

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

            return true;
        } catch (error) {
            console.error('Export error:', error);
            alert('Gagal mengekspor PDF: ' + error.message);
            return false;
        }
    }

    transformCoords(x, y, w, h, wrapperW, wrapperH, pageW, pageH, rotation, crop) {
        let sx = pageW / wrapperW;
        let sy = pageH / wrapperH;

        let px = x * sx;
        let py = pageH - (y + h) * sy;
        let pw = w * sx;
        let ph = h * sy;

        if (crop) {
            px -= crop.x * sx;
            py -= (wrapperH - crop.y - crop.height) * sy;
        }

        if (rotation === 90) {
            const temp = px;
            px = py;
            py = pw - temp;
            const tempWH = pw;
            pw = ph;
            ph = tempWH;
        } else if (rotation === 180) {
            px = pw - px;
            py = ph - py;
        } else if (rotation === 270) {
            const temp = px;
            px = ph - py;
            py = temp;
            const tempWH = pw;
            pw = ph;
            ph = tempWH;
        }

        return { x: px, y: py, w: pw, h: ph };
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

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
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
}

window.PDFExporter = PDFExporter;

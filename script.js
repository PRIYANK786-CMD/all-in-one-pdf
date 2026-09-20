// Tab Switching Utility
function switchTab(tabName) {
    ['merge', 'split', 'cut', 'pdf2jpg', 'jpg2pdf', 'watermark'].forEach(t => {
        document.getElementById(`section-${t}`).classList.add('hidden');
        document.getElementById(`tab-${t}`).className = "py-3 px-4 font-semibold text-slate-500 hover:text-slate-700 focus:outline-none transition";
    });
    document.getElementById(`section-${tabName}`).classList.remove('hidden');
    document.getElementById(`tab-${tabName}`).className = "py-3 px-4 font-semibold text-indigo-600 border-b-2 border-indigo-600 focus:outline-none transition";
}

// 1. MERGE PDF FUNCTIONALITY
async function mergePDFs() {
    const fileInput = document.getElementById('merge-files');
    if (fileInput.files.length < 2) {
        alert('Please select at least 2 PDF files to merge.');
        return;
    }
    const filesArray = Array.from(fileInput.files);
    filesArray.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const mergedPdf = await PDFLib.PDFDocument.create();
    for (let file of filesArray) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    const mergedPdfFileBytes = await mergedPdf.save();
    downloadBlob(mergedPdfFileBytes, "merged-document.pdf", "application/pdf");
}

// 2. SPLIT & EXTRACT SPECIFIC PAGES
async function splitPDF() {
    const fileInput = document.getElementById('split-file');
    const pagesInput = document.getElementById('split-pages-input').value.trim();

    if (fileInput.files.length === 0 || !pagesInput) {
        alert('Please select a PDF file and specify pages.');
        return;
    }

    const pageNumbers = pagesInput.split(',').map(num => parseInt(num.trim(), 10)).filter(num => !isNaN(num));
    const file = fileInput.files[0];
    const pdf = await PDFLib.PDFDocument.load(await file.arrayBuffer());
    const totalPages = pdf.getPageCount();

    const indicesToExtract = [];
    for (let pNum of pageNumbers) {
        const index = pNum - 1;
        if (index >= 0 && index < totalPages) indicesToExtract.push(index);
    }

    const newPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, indicesToExtract);
    copiedPages.forEach((page) => newPdf.addPage(page));

    downloadBlob(await newPdf.save(), "extracted-custom-pages.pdf", "application/pdf");
}

// 3. CUT & REORDER FUNCTIONALITY
async function cutPDF() {
    const fileInput = document.getElementById('cut-file');
    const pagesInput = document.getElementById('cut-pages-input').value.trim();

    if (fileInput.files.length === 0 || !pagesInput) {
        alert('Please select a PDF file and specify pages.');
        return;
    }

    const loadedPdfDoc = await PDFLib.PDFDocument.load(await fileInput.files[0].arrayBuffer());
    const finalIndices = parsePageRanges(pagesInput, loadedPdfDoc.getPageCount());

    const newPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await newPdf.copyPages(loadedPdfDoc, finalIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));

    downloadBlob(await newPdf.save(), "cut-and-sequenced-utility.pdf", "application/pdf");
}

// 4. PDF TO JPG CONVERSION (Bundled into a single ZIP file download)
async function convertPdfToJpg() {
    const fileInput = document.getElementById('pdf2jpg-file');
    const btn = document.getElementById('pdf2jpg-btn');
    if (fileInput.files.length === 0) {
        alert('Please select a PDF file.');
        return;
    }

    btn.innerText = "Converting & Packaging ZIP...";
    btn.disabled = true;

    try {
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;

        const zip = new JSZip();
        const folderName = file.name.replace('.pdf', '');
        const imgFolder = zip.folder(folderName);

        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); 
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            
            // Convert canvas data to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            imgFolder.file(`page_${i}.jpg`, blob);
        }

        // Generate ZIP content and trigger download
        const zipContent = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipContent, `${folderName}_images.zip`, 'application/zip');
    } catch (error) {
        console.error(error);
        alert('An error occurred while converting the PDF.');
    } finally {
        btn.innerText = "Convert & Download ZIP";
        btn.disabled = false;
    }
}

// 5. JPG TO PDF CONVERSION (Strict Auto-Sequencing: e.g., 2,4,6,1 becomes 1,2,4,6 & b,n,g,a becomes a,b,g,n)
async function convertJpgToPdf() {
    const fileInput = document.getElementById('jpg2pdf-files');
    if (fileInput.files.length === 0) {
        alert('Please select image files.');
        return;
    }

    const filesArray = Array.from(fileInput.files);
    
    // Automatically sort files strictly by filename sequence (numeric-aware and alphabetical)
    filesArray.sort((a, b) => {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    const pdfDoc = await PDFLib.PDFDocument.create();

    for (let file of filesArray) {
        const arrayBuffer = await file.arrayBuffer();
        let image;
        if (file.type === 'image/png') {
            image = await pdfDoc.embedPng(arrayBuffer);
        } else {
            image = await pdfDoc.embedJpg(arrayBuffer);
        }

        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: image.width,
            height: image.height,
        });
    }

    downloadBlob(await pdfDoc.save(), "sequenced-images.pdf", "application/pdf");
}

// 6. WATERMARK PDF FUNCTIONALITY
async function addWatermark() {
    const fileInput = document.getElementById('watermark-file');
    const text = document.getElementById('watermark-text').value.trim();
    const pagesInput = document.getElementById('watermark-pages').value.trim();
    const size = parseInt(document.getElementById('watermark-size').value, 10);
    const colorTheme = document.getElementById('watermark-color').value;
    const isBold = document.getElementById('watermark-bold').checked;
    const isItalic = document.getElementById('watermark-italic').checked;

    if (fileInput.files.length === 0 || !text) {
        alert('Please upload a PDF file and specify watermark text.');
        return;
    }

    const pdfDoc = await PDFLib.PDFDocument.load(await fileInput.files[0].arrayBuffer());
    const totalPages = pdfDoc.getPageCount();

    let fontName = PDFLib.StandardFonts.Helvetica;
    if (isBold && isItalic) fontName = PDFLib.StandardFonts.HelveticaBoldOblique;
    else if (isBold) fontName = PDFLib.StandardFonts.HelveticaBold;
    else if (isItalic) fontName = PDFLib.StandardFonts.Oblique;

    const font = await pdfDoc.embedFont(fontName);

    let rgbColor = PDFLib.rgb(0.75, 0.75, 0.75); // Light Gray
    if (colorTheme === 'light-red') rgbColor = PDFLib.rgb(0.9, 0.6, 0.6);
    else if (colorTheme === 'light-blue') rgbColor = PDFLib.rgb(0.6, 0.75, 0.9);
    else if (colorTheme === 'dark') rgbColor = PDFLib.rgb(0.2, 0.2, 0.2);

    let targetIndices = [];
    if (pagesInput) {
        targetIndices = parsePageRanges(pagesInput, totalPages);
    } else {
        targetIndices = pdfDoc.getPageIndices();
    }

    for (let idx of targetIndices) {
        const page = pdfDoc.getPage(idx);
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(text, size);

        page.drawText(text, {
            x: (width / 2) - (textWidth / 2),
            y: height / 2,
            size: size,
            font: font,
            color: rgbColor,
            opacity: 0.4,
            rotate: PDFLib.degrees(45),
        });
    }

    downloadBlob(await pdfDoc.save(), "watermarked-document.pdf", "application/pdf");
}

// Helper utility to parse numbers and ranges like "10, 15-25, 32"
function parsePageRanges(inputStr, maxPages) {
    let indices = [];
    let parts = inputStr.split(',');

    for (let part of parts) {
        part = part.trim();
        if (!part) continue;

        if (part.includes('-')) {
            let rangeBounds = part.split('-');
            if (rangeBounds.length === 2) {
                let start = parseInt(rangeBounds[0].trim(), 10);
                let end = parseInt(rangeBounds[1].trim(), 10);
                if (!isNaN(start) && !isNaN(end)) {
                    let step = start <= end ? 1 : -1;
                    for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
                        let idx = i - 1; 
                        if (idx >= 0 && idx < maxPages) indices.push(idx);
                    }
                }
            }
        } else {
            let pageNum = parseInt(part, 10);
            if (!isNaN(pageNum)) {
                let idx = pageNum - 1;
                if (idx >= 0 && idx < maxPages) indices.push(idx);
            }
        }
    }
    return indices;
}

// Helper utility for client-side download
function downloadBlob(data, filename, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
}
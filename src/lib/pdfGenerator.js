import html2pdf from 'html2pdf.js';

/**
 * pdfGenerator.js — Utility for generating official PDF downloads.
 * Supports portrait & landscape orientations, custom filenames,
 * and page-break avoidance for weighment tables and images.
 */
export async function downloadPDF(elementOrId, options = {}) {
  const element = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;

  if (!element) {
    console.error('PDF Generator: Element not found', elementOrId);
    return false;
  }

  const {
    filename = 'Document.pdf',
    orientation = 'portrait', // 'portrait' | 'landscape'
    format = 'a4',
    margin = [10, 10, 10, 10], // [top, left, bottom, right] in mm
    // If true, the function returns a Blob of the generated PDF instead of
    // saving it directly to the user's machine. Useful when the caller wants
    // to upload or persist the PDF programmatically.
    returnBlob = false,
  } = options;

  const opt = {
    margin: margin,
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: orientation === 'landscape' ? 1280 : 800,
    },
    jsPDF: {
      unit: 'mm',
      format: format,
      orientation: orientation,
      compress: true,
    },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: [
        '.weighment-table-block',
        '.pdf-avoid-break',
        'table',
        'tr',
        'img',
        '.official-header',
        '.official-footer',
        '.signature-block',
      ],
    },
  };

  try {
    const worker = html2pdf().set(opt).from(element);
    if (returnBlob) {
      // html2pdf exposes a `toPdf()` step which provides access to the jsPDF
      // instance. We ask for a blob output so callers can upload or store it.
      // Note: different html2pdf versions expose slightly different helpers;
      // this approach matches supported usage in the bundled html2pdf.js.
      // eslint-disable-next-line no-undef
      const pdfBlob = await worker.toPdf().output('blob');
      return pdfBlob;
    }
    await worker.save();
    return true;
  } catch (err) {
    console.error('html2pdf error, falling back to window.print', err);
    window.print();
    return false;
  }
}

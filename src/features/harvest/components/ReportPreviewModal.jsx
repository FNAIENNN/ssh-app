import React, { useEffect, useMemo, useRef, useState } from 'react';
import OfficialBillDocument from './OfficialBillDocument';
import { downloadPDF } from '../../../lib/pdfGenerator';
import { supabase, TABLES } from '../../../lib/supabaseClient';

const TABS = {
  bill: { label: '📄 Harvest Bill', reportType: 'bill', docType: 'bill' },
  report: { label: '📊 Harvest Report', reportType: 'report', docType: 'report' },
  uasf: { label: '🏷️ UASF Rates', reportType: 'uasf', docType: 'uasf' },
};

const normalizeTab = (incomingType) => {
  const type = incomingType || 'bill';
  if (['middle_report', 'full_report', 'report'].includes(type)) return 'report';
  if (['uasf_rates', 'full_uasf_rates', 'uasf', 'full_uasf'].includes(type)) return 'uasf';
  return 'bill';
};

export default function ReportPreviewModal({ visible, onClose, docData, docType, rawDoc }) {
  const modalRootRef = useRef(null);
  const activeTabRef = useRef(null);
  const initialTab = normalizeTab(docType || rawDoc?.report_type || 'bill');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [storedDocs, setStoredDocs] = useState({ bill: null, report: null, uasf: null });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let isMounted = true;

    const loadStoredDocs = async () => {
      const siteId = rawDoc?.site_id || rawDoc?.siteId || docData?.site_id || null;

      try {
        let rows = [];
        const billNumber = rawDoc?.bill_number || docData?.bill_number || null;
        const candidateBillId = rawDoc?.bill_id || docData?.bill_id || rawDoc?.id || null;

        // 1) Fetch all stored bills rows matching this record's bill_number
        if (billNumber) {
          let query = supabase.from(TABLES.bills).select('*').eq('bill_number', billNumber);
          if (siteId) query = query.eq('site_id', siteId);
          const { data: byNumber } = await query;
          if (byNumber && byNumber.length > 0) {
            rows = byNumber;
          }
        }

        // 2) Fallback to candidate bill id or rawDoc id
        if (rows.length === 0 && candidateBillId) {
          const { data: byId } = await supabase.from(TABLES.bills).select('*').eq('id', candidateBillId).maybeSingle();
          if (byId) rows = [byId];
        }

        if (rows.length === 0 && rawDoc?.id) {
          const { data: byId2 } = await supabase.from(TABLES.bills).select('*').eq('id', rawDoc.id).maybeSingle();
          if (byId2) rows = [byId2];
        }

        // If still nothing and rawDoc has an id, try to find harvest_entries that reference it
        if (rows.length === 0 && rawDoc?.id) {
          const { data: entries } = await supabase.from(TABLES.harvestEntries).select('bill_id').eq('site_id', siteId).eq('bill_id', rawDoc.id);
          const ids = (entries || []).map((e) => e.bill_id).filter(Boolean);
          if (ids.length > 0) {
            const { data: byIds } = await supabase.from(TABLES.bills).select('*').in('id', ids);
            rows = byIds || [];
          }
        }

        const docs = { bill: null, report: null, uasf: null };
        (rows || []).forEach((row) => {
          if (!row?.report_type) return;
          const norm = normalizeTab(row.report_type);
          if (norm === 'bill' && !docs.bill) docs.bill = row;
          if (norm === 'report' && !docs.report) docs.report = row;
          if (norm === 'uasf' && !docs.uasf) docs.uasf = row;
        });

        if (isMounted) setStoredDocs(docs);
      } catch (err) {
        console.warn('loadStoredDocs failed', err);
        if (isMounted) setStoredDocs({ bill: null, report: null, uasf: null });
      }
    };

    loadStoredDocs();
    return () => { isMounted = false; };
  }, [rawDoc, docData]);

  const selectedRecord = useMemo(() => {
    // Prefer the explicitly stored document for the active tab (bill/report/uasf)
    const stored = storedDocs[activeTab];
    if (stored) return stored.document_data || stored;

    // If rawDoc or docData explicitly matches activeTab, use it
    const rawType = normalizeTab(rawDoc?.report_type || rawDoc?.reportType || rawDoc?.type);
    if (rawDoc && rawType === activeTab) return rawDoc.document_data || rawDoc;

    const dataType = normalizeTab(docData?.report_type || docData?.reportType || docData?.type || docType);
    if (docData && dataType === activeTab) return docData.document_data || docData;

    // Fallback base data: return underlying document_data from rawDoc or docData or any available stored doc
    const baseObj = rawDoc?.document_data || rawDoc || docData?.document_data || docData || storedDocs.bill?.document_data || storedDocs.bill;
    return baseObj;
  }, [storedDocs, activeTab, rawDoc, docData, docType]);

  const selectedPdfUrl = useMemo(() => {
    // ONLY return a stored PDF URL if there is a stored document FOR THIS SPECIFIC TAB with a pdf_base64
    const row = storedDocs[activeTab];
    if (row) {
      const rowType = normalizeTab(row.report_type);
      if (rowType === activeTab) {
        const pdfBase64 = row.document_data?.pdf_base64 || row.pdf_base64;
        if (pdfBase64) return `data:application/pdf;base64,${pdfBase64}`;
      }
    }

    const rawType = normalizeTab(rawDoc?.report_type || rawDoc?.reportType || rawDoc?.type);
    if (rawDoc && rawType === activeTab) {
      const pdfBase64 = rawDoc.document_data?.pdf_base64 || rawDoc.pdf_base64;
      if (pdfBase64) return `data:application/pdf;base64,${pdfBase64}`;
    }

    const dataType = normalizeTab(docData?.report_type || docData?.reportType || docData?.type || docType);
    if (docData && dataType === activeTab) {
      const pdfBase64 = docData.document_data?.pdf_base64 || docData.pdf_base64;
      if (pdfBase64) return `data:application/pdf;base64,${pdfBase64}`;
    }

    // Do NOT fall back to another tab's pdf_base64 (e.g. Harvest Bill's PDF)
    return null;
  }, [storedDocs, activeTab, rawDoc, docData, docType]);

  const selectedDocumentId = 'report-preview-selected-document';
  const selectedDocumentType = TABS[activeTab].docType;
  const fileName = `${rawDoc?.bill_number || docData?.bill_number || 'Harvest_Document'}_${activeTab}.pdf`;

  // Hooks are complete — it is now safe to conditionally render nothing.
  if (!visible) return null;

  const handleDownload = async () => {
    if (selectedPdfUrl) {
      try {
        const response = await fetch(selectedPdfUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      } catch (err) {
        console.warn('Stored PDF fallback download failed, trying render export instead.', err);
      }
    }

    const target = document.getElementById(selectedDocumentId);
    if (!target) return;
    await downloadPDF(target, {
      filename: fileName,
      orientation: activeTab === 'report' ? 'landscape' : 'portrait',
    });
  };

  const renderSelectedDocument = () => {
    if (selectedPdfUrl) {
      return (
        <div className="w-full h-[760px] rounded-2xl border border-slate-200 overflow-hidden bg-white">
          <iframe title={TABS[activeTab].label} src={selectedPdfUrl} className="w-full h-full border-0" />
        </div>
      );
    }

    return (
      <div id={selectedDocumentId} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <OfficialBillDocument documentData={selectedRecord || docData || rawDoc} docType={selectedDocumentType} />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full border border-slate-200 overflow-hidden my-8">
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-xl">🧾</span>
            <div>
              <div className="font-extrabold text-sm tracking-wide">Official Document Preview — #{rawDoc?.bill_number || docData?.bill_number}</div>
              <div className="text-xs text-slate-300">Selected document only — no combined bill export</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition flex items-center gap-1.5"
            >
              📥 Download PDF / Print
            </button>
            <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition">✕ Close</button>
          </div>
        </div>

        <div className="p-4 bg-slate-100 print:py-6">
          <div className="flex items-center justify-center gap-4 mb-4 print:hidden">
            {Object.entries(TABS).map(([key, tab]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-4 py-2 rounded-xl border text-sm font-extrabold shadow-sm transition ${
                  activeTab === key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div ref={modalRootRef} className="bg-white p-4 rounded-2xl border border-slate-200">
            {renderSelectedDocument()}
          </div>
        </div>
      </div>
    </div>
  );
}

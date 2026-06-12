"use client";

import React, { useState } from "react";
import { X, FileText, ChevronRight } from "lucide-react";

interface KycTermsModalProps {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
}

type Citizenship = "us" | "international" | null;

interface DocItem {
  id: string;
  label: string;
  path: string;
}

const US_DOCS: DocItem[] = [
  { id: "us_cardholder", label: "SD3 Technologies Cardholder Agreement", path: "/sd3-docs/US_Consumer_Agreement.pdf" },
  { id: "privacy_notice", label: "Privacy Notice", path: "/sd3-docs/Privacy_Notice.pdf" },
  { id: "privacy_policy", label: "SD3 Technologies Privacy Policy", path: "/sd3-docs/SD3_Technologies_Privacy_Policy.pdf" },
  { id: "esign", label: "E-Sign Disclosure and Consent", path: "/sd3-docs/ESign.pdf" },
];

const INTL_DOCS: DocItem[] = [
  { id: "intl_cardholder", label: "SD3 Technologies International Cardholder Agreement", path: "/sd3-docs/International_Consumer_Agreement.pdf" },
  { id: "privacy_notice", label: "Privacy Notice", path: "/sd3-docs/Privacy_Notice.pdf" },
  { id: "privacy_policy", label: "SD3 Technologies Privacy Policy", path: "/sd3-docs/SD3_Technologies_Privacy_Policy.pdf" },
  { id: "esign", label: "E-Sign Disclosure and Consent", path: "/sd3-docs/ESign.pdf" },
];

export function KycTermsModal({ open, onClose, onAccept }: KycTermsModalProps) {
  const [citizenship, setCitizenship] = useState<Citizenship>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  if (!open) return null;

  const docs = citizenship === "us" ? US_DOCS : citizenship === "international" ? INTL_DOCS : [];
  const allChecked = docs.length > 0 && docs.every((d) => checked[d.id]);

  const handleClose = () => { setCitizenship(null); setChecked({}); onClose(); };
  const handleAccept = () => { if (!allChecked) return; setCitizenship(null); setChecked({}); onClose(); onAccept(); };
  const toggleDoc = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg mx-4 bg-[#0f1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h2 className="text-white text-lg font-semibold">Identity Verification</h2>
            <p className="text-white/50 text-sm mt-0.5">Review and accept the required agreements before proceeding</p>
          </div>
          <button onClick={handleClose} className="text-white/40 hover:text-white/80 transition-colors p-1 rounded-lg hover:bg-white/5">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div>
            <p className="text-white/70 text-sm font-medium mb-3">Are you a US citizen or resident?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setCitizenship("us"); setChecked({}); }} className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-medium transition-all ${citizenship === "us" ? "border-[#6C63FF] bg-[#6C63FF]/15 text-white" : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80"}`}>🇺🇸 Yes, US</button>
              <button onClick={() => { setCitizenship("international"); setChecked({}); }} className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-medium transition-all ${citizenship === "international" ? "border-[#6C63FF] bg-[#6C63FF]/15 text-white" : "border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80"}`}>🌍 International</button>
            </div>
          </div>
          {citizenship && (
            <div>
              <p className="text-white/70 text-sm font-medium mb-3">Please review and accept each document:</p>
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${checked[doc.id] ? "border-[#6C63FF]/40 bg-[#6C63FF]/10" : "border-white/8 bg-white/3 hover:border-white/15"}`}>
                    <button onClick={() => toggleDoc(doc.id)} className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${checked[doc.id] ? "border-[#6C63FF] bg-[#6C63FF]" : "border-white/30 bg-transparent"}`}>
                      {checked[doc.id] && (<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>)}
                    </button>
                    <FileText size={14} className="text-white/40 flex-shrink-0" />
                    <span onClick={() => toggleDoc(doc.id)} className="flex-1 text-white/80 text-sm leading-tight cursor-pointer">{doc.label}</span>
                    <a href={doc.path} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center gap-1 text-[#6C63FF] text-xs hover:text-[#8B83FF] transition-colors">View <ChevronRight size={12} /></a>
                  </div>
                ))}
              </div>
              <p className="text-white/30 text-xs mt-3">By checking each box you confirm you have read and agree to the document.</p>
            </div>
          )}
        </div>
        <div className="px-6 pb-6">
          <button onClick={handleAccept} disabled={!allChecked} className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all ${allChecked ? "bg-[#6C63FF] hover:bg-[#7B73FF] text-white shadow-lg shadow-[#6C63FF]/25" : "bg-white/8 text-white/30 cursor-not-allowed"}`}>
            {!citizenship ? "Select citizenship status above" : !allChecked ? `Accept all ${docs.length} documents to continue` : "Continue to Identity Verification →"}
          </button>
        </div>
      </div>
    </div>
  );
}

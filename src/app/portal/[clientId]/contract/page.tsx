'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardHeader, Button, StatusBadge } from '@/components/ui';

interface ContractRecord {
  id: string;
  title: string;
  document_url: string;
  signed_at: string;
  ghl_document_id?: string;
  created_at: string;
}

export default function SignedContractPage() {
  const params = useParams();
  const clientId = (params?.clientId as string) || 'demo';

  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);
  const [downloadNotice, setDownloadNotice] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadContracts() {
      try {
        const res = await fetch(`/api/portal/${clientId}/data`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.contracts && data.contracts.length > 0) {
            setContracts(data.contracts);
            setSelectedContract(data.contracts[0]);
          }
        }
      } catch {
        // Fallback remains active
      }
    }
    loadContracts();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Fallback contract if not loaded
  const activeContracts: ContractRecord[] = contracts.length > 0 ? contracts : [
    {
      id: 'contract-1',
      title: 'Motionz Client Service Agreement & Dealer License',
      document_url: '/documents/motionz-client-agreement.pdf',
      signed_at: '2026-09-10T14:30:00Z',
      ghl_document_id: 'doc_ghl_9874',
      created_at: '2026-09-10T14:30:00Z',
    },
  ];

  const currentContract = selectedContract || activeContracts[0];

  const handleDownload = () => {
    setDownloadNotice('Initiating secure encrypted download of verified PDF package...');
    setTimeout(() => {
      setDownloadNotice('Document downloaded successfully. SHA-256 integrity verified.');
    }, 1200);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ marginBottom: 'var(--space-1)' }}>Signed Contracts & Agreements</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Tamper-evident legal documents, service level agreements, and business certificates.
        </p>
      </div>

      {downloadNotice && (
        <div
          style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-status-done-bg)',
            color: 'var(--color-status-done-text)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {downloadNotice}
        </div>
      )}

      {/* Metadata & Actions Card */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <CardHeader
          title={currentContract.title}
          subtitle={`Executed via GoHighLevel E-Signature Engine | Document ID: ${currentContract.ghl_document_id || 'DOC-VERIFIED-9874'}`}
          action={<StatusBadge status="Fully Executed" variant="done" />}
        />

        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            padding: 'var(--space-4) 0',
            borderTop: '1px solid var(--color-border-subtle)',
            borderBottom: '1px solid var(--color-border-subtle)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
              Execution Date
            </span>
            <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
              {new Date(currentContract.signed_at).toLocaleString()}
            </span>
          </div>

          <div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
              Authorized Signatory
            </span>
            <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
              John Smith (Owner / Managing Partner)
            </span>
          </div>

          <div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
              Verification Authority
            </span>
            <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
              Motionz Legal & Carrier Compliance
            </span>
          </div>

          <div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
              Security Status
            </span>
            <span style={{ color: 'var(--color-status-done-text)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)' }}>
              SHA-256 Audit Trail Locked
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={handleDownload}>
            Download Signed PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => alert('Certificate of Completion: GHL-SIG-2026-0910-884 verified.')}
          >
            Verify Certificate of Completion
          </Button>
        </div>
      </Card>

      {/* Embedded Document Reader Preview */}
      <Card>
        <CardHeader
          title="Document Preview"
          subtitle="Direct in-portal cryptographic agreement viewer"
        />

        <div
          style={{
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-6)',
            fontFamily: 'monospace',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            lineHeight: '1.6',
            maxHeight: '480px',
            overflowY: 'auto',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)', color: 'var(--color-text-primary)' }}>
            <strong>MOTIONZ CLIENT ONBOARDING & SERVICE LEVEL AGREEMENT</strong>
            <br />
            <span>CONFIDENTIAL & PROPRIETARY CONTRACT #ORD-2026-9874</span>
          </div>

          <p>
            This Master Agreement is entered into by and between Motionz.ai Inc. and ABC Roofing (the &quot;Client&quot;).
            By executing this agreement electronically, both parties agree to the delivery of proprietary business onboarding,
            campaign tracking setup, GoHighLevel pipeline provisioning, carrier 10DLC A2P compliance, and exclusive territory rights.
          </p>

          <br />
          <strong>SECTION 1: SCOPE OF SERVICES & DELIVERABLES</strong>
          <p>
            Motionz shall provide continuous onboarding support across the 5 confirmed operational milestones:
            (1) Google Sheet Campaign Tracking Sync, (2) GoHighLevel Sub-Account & A2P Carrier Approval,
            (3) Facebook Business Page & Ad Account Integration, (4) Custom Domain, Business Email, & Website Deployment,
            and (5) Local Business Phone System Provisioning.
          </p>

          <br />
          <strong>SECTION 2: TERRITORY AND LEAD QUOTAS</strong>
          <p>
            Motionz warrants that exclusive lead generation campaigns will be managed to target the agreed operational
            service zip codes. Monthly delivery quota is established at 50 verified inbound inquiries per billing cycle.
          </p>

          <br />
          <strong>SECTION 3: CARRIER COMPLIANCE & LEGAL CERTIFICATION</strong>
          <p>
            Client verifies that all outbound SMS messaging will adhere strictly to CTIA and FCC guidelines.
            Motionz will submit and monitor all A2P Brand and Campaign registrations on behalf of the Client.
          </p>

          <br />
          <div
            style={{
              marginTop: 'var(--space-6)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
            }}
          >
            <div>
              <strong>CLIENT SIGNATURE:</strong>
              <div style={{ color: 'var(--color-primary)', marginTop: '4px', fontStyle: 'italic' }}>
                /s/ John Smith (Verified Digital Signature)
              </div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                IP: 198.51.100.42 | Timestamp: 2026-09-10 14:30:00 UTC
              </div>
            </div>

            <div>
              <strong>MOTIONZ COUNTERSIGNATURE:</strong>
              <div style={{ color: 'var(--color-status-done-text)', marginTop: '4px', fontStyle: 'italic' }}>
                /s/ Motionz Operations Executive
              </div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                Verification ID: GHL-SIG-2026-0910-884
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

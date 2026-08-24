"use client";

import { FormEvent, useState } from "react";

type SendResult = {
  ok?: boolean;
  error?: string;
  sid?: string;
  status?: string;
  to?: string;
  from?: string | null;
  requestedMode?: string;
  note?: string;
};

export default function MessagingTestPage() {
  const [to, setTo] = useState("");
  const [body, setBody] = useState(
    "BandWagon platform test: Messaging is working. Reply HELP for help or STOP to opt out."
  );
  const [mode, setMode] = useState<"auto" | "sms">("auto");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/messaging-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, body, mode }),
      });

      const data = await response.json();
      setResult(data);
    } catch {
      setResult({ error: "Unable to reach the BandWagon test API." });
    } finally {
      setSending(false);
    }
  }

  return (
    <main style={{maxWidth: 900, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif"}}>
      <div style={{background:"#0f1d3a", color:"#fff", borderRadius:24, padding:"28px 32px", marginBottom:24}}>
        <div style={{fontSize:14, fontWeight:700, letterSpacing:1, opacity:.8}}>PLATFORM ADMIN</div>
        <h1 style={{fontSize:40, margin:"6px 0 4px"}}>Messaging Test</h1>
        <p style={{margin:0, opacity:.9}}>Test BandWagon → Twilio → RCS/SMS delivery without creating a ride.</p>
      </div>

      <div style={{background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:16, padding:18, marginBottom:24}}>
        <strong>Platform-owner test tool.</strong> This page uses your signed-in BandWagon session.
        If ADMIN_TEST_PHONE is configured, messages can only be sent to that number.
      </div>

      <form onSubmit={submit} style={{background:"#fff", border:"1px solid #dbe3ef", borderRadius:18, padding:24}}>
        <label style={{display:"block", fontWeight:700, marginBottom:6}}>Recipient</label>
        <input
          type="tel"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="+14695550123"
          required
          style={{width:"100%", padding:12, border:"1px solid #cbd5e1", borderRadius:8, marginBottom:18}}
        />
        <div style={{fontSize:13, color:"#64748b", marginTop:-12, marginBottom:18}}>
          Use E.164 format, for example +14695550123.
        </div>

        <label style={{display:"block", fontWeight:700, marginBottom:6}}>Delivery Test</label>
        <div style={{display:"grid", gap:10, marginBottom:18}}>
          <label style={{padding:14, border:"1px solid #cbd5e1", borderRadius:10}}>
            <input
              type="radio"
              name="mode"
              checked={mode === "auto"}
              onChange={() => setMode("auto")}
            />{" "}
            <strong>RCS preferred + SMS fallback</strong>
            <div style={{fontSize:13, color:"#64748b", marginLeft:22, marginTop:4}}>
              Sends through the BandWagon Messaging Service. Twilio chooses RCS first when the sender/device supports it, then falls back to SMS.
            </div>
          </label>

          <label style={{padding:14, border:"1px solid #cbd5e1", borderRadius:10}}>
            <input
              type="radio"
              name="mode"
              checked={mode === "sms"}
              onChange={() => setMode("sms")}
            />{" "}
            <strong>Force SMS from (223) BANDWAG</strong>
            <div style={{fontSize:13, color:"#64748b", marginLeft:22, marginTop:4}}>
              Forces the configured TWILIO_PHONE_NUMBER while retaining Messaging Service features.
            </div>
          </label>
        </div>

        <label style={{display:"block", fontWeight:700, marginBottom:6}}>Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={1000}
          required
          style={{width:"100%", padding:12, border:"1px solid #cbd5e1", borderRadius:8, marginBottom:8}}
        />
        <div style={{fontSize:13, color:"#64748b", marginBottom:20}}>{body.length}/1000 characters</div>

        <button
          disabled={sending}
          style={{
            background:"#2563eb", color:"#fff", border:0, borderRadius:10,
            padding:"13px 22px", fontWeight:800, cursor:sending ? "wait" : "pointer"
          }}
        >
          {sending ? "Sending..." : "Send Platform Test"}
        </button>
      </form>

      {result && (
        <section style={{
          marginTop:24, padding:20, borderRadius:16,
          background: result.ok ? "#ecfdf5" : "#fef2f2",
          border: `1px solid ${result.ok ? "#a7f3d0" : "#fecaca"}`
        }}>
          <h2 style={{marginTop:0}}>{result.ok ? "Accepted by Twilio" : "Test Failed"}</h2>
          {result.error && <p>{result.error}</p>}
          {result.sid && <p><strong>Message SID:</strong> <code>{result.sid}</code></p>}
          {result.status && <p><strong>Initial status:</strong> {result.status}</p>}
          {result.requestedMode && <p><strong>Requested mode:</strong> {result.requestedMode}</p>}
          {result.from && <p><strong>From:</strong> {result.from}</p>}
          {result.to && <p><strong>To:</strong> {result.to}</p>}
          {result.note && <p>{result.note}</p>}
          {result.ok && (
            <p style={{marginBottom:0}}>
              Delivery/read updates will continue through the BandWagon Twilio status webhook.
            </p>
          )}
        </section>
      )}
    </main>
  );
}

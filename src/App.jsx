import { useState, useEffect, useRef } from "react";
import { collection, doc, setDoc, updateDoc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const PM_PASSWORD = import.meta.env.VITE_PM_PASSWORD || "thetataupledge";

const ACTIVITY_TYPES = [
  { id: "interview_active", label: "Interview with Active", icon: "🤝", detail: "active" },
  { id: "sig_active",       label: "Sig with Active",       icon: "✍️", detail: "active" },
  { id: "pnm_interview",    label: "1-on-1 PNM Interview",  icon: "💬", detail: "pnm"    },
  { id: "event",            label: "Event Attendance",       icon: "📅", detail: "event"  },
];

const POINTS        = { interview_active: 3, sig_active: 2, pnm_interview: 2, event: 1 };
const STATUS_COLORS = { pending: "#C9A84C", approved: "#2E8B57", rejected: "#B83232" };
const STATUS_BG     = { pending: "#FDF8EC", approved: "#EDF7F1", rejected: "#FBEAEA" };

async function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale  = Math.min(1, 800 / img.width);
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function PledgeBook() {
  const [view,        setView]        = useState("pnm");
  const [submissions, setSubmissions] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // PNM state machine
  const [pnmScreen,    setPnmScreen]    = useState("name_entry"); // name_entry | home | form | submitted
  const [pnmName,      setPnmName]      = useState("");
  const [nameInput,    setNameInput]    = useState("");
  const [form,         setForm]         = useState({ type: "", contactName: "", eventName: "", date: "", notes: "", photo: null });
  const [photoPreview, setPhotoPreview] = useState(null);
  const [formError,    setFormError]    = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const fileRef = useRef();

  // PM state
  const [pmAuthed,      setPmAuthed]      = useState(false);
  const [pwInput,       setPwInput]       = useState("");
  const [pwError,       setPwError]       = useState(false);
  const [filter,        setFilter]        = useState("pending");
  const [expandedId,    setExpandedId]    = useState(null);
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  const [showQR,        setShowQR]        = useState(false);
  const [copied,        setCopied]        = useState(false);

  // Real-time Firestore listener
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "submissions"),
      (snap) => {
        setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const mySubs = (n) => submissions.filter(s => s.pnmName === n);

  async function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressImage(file);
    setPhotoPreview(compressed);
    setForm(f => ({ ...f, photo: compressed }));
  }

  function validateForm() {
    if (!form.type) return "Select an activity type.";
    if (!form.date) return "Select a date.";
    const t = ACTIVITY_TYPES.find(a => a.id === form.type);
    if (t?.detail === "active" && !form.contactName.trim()) return "Enter the active's name.";
    if (t?.detail === "pnm"    && !form.contactName.trim()) return "Enter the other PNM's name.";
    if (t?.detail === "event"  && !form.eventName.trim())   return "Enter the event name.";
    return null;
  }

  async function handleSubmit() {
    const err = validateForm();
    if (err) { setFormError(err); return; }
    setFormError("");
    setSubmitting(true);

    const id  = crypto.randomUUID();
    const sub = {
      pnmName,
      type: form.type, contactName: form.contactName, eventName: form.eventName,
      date: form.date, notes: form.notes,
      hasPhoto: !!form.photo,
      status: "pending",
      submittedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, "submissions", id), sub);
      if (form.photo) {
        await setDoc(doc(db, "photos", id), { data: form.photo });
      }
    } catch (e) {
      setFormError("Failed to submit — check your connection and try again.");
      setSubmitting(false);
      return;
    }

    setForm({ type: "", contactName: "", eventName: "", date: "", notes: "", photo: null });
    setPhotoPreview(null);
    setSubmitting(false);
    setPnmScreen("submitted");
  }

  async function decide(id, status) {
    try {
      await updateDoc(doc(db, "submissions", id), { status, decidedAt: new Date().toISOString() });
    } catch (e) {
      console.error("Update failed:", e);
    }
  }

  async function toggleExpand(id) {
    if (expandedId === id) { setExpandedId(null); setExpandedPhoto(null); return; }
    setExpandedId(id);
    setExpandedPhoto(null);
    const sub = submissions.find(s => s.id === id);
    if (sub?.hasPhoto) {
      try {
        const snap = await getDoc(doc(db, "photos", id));
        if (snap.exists()) setExpandedPhoto(snap.data().data);
      } catch (_) {}
    }
  }

  function login() {
    if (pwInput === PM_PASSWORD) { setPmAuthed(true); setPwError(false); }
    else setPwError(true);
  }

  function leaderboard() {
    const tally = {};
    submissions.filter(s => s.status === "approved").forEach(s => {
      tally[s.pnmName] = (tally[s.pnmName] || 0) + (POINTS[s.type] || 0);
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const pendingCount = submissions.filter(s => s.status === "pending").length;
  const visibleSubs  = (filter === "all" ? [...submissions] : submissions.filter(s => s.status === filter)).reverse();
  const selectedType = ACTIVITY_TYPES.find(a => a.id === form.type);
  const shareUrl     = typeof window !== "undefined" ? window.location.href : "";

  const btn = (extra = {}) => ({
    border: "none", cursor: "pointer", fontFamily: "inherit",
    fontWeight: 800, letterSpacing: "0.4px", borderRadius: 4, ...extra,
  });

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F2F0EB", color: "#888", fontFamily: "system-ui" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#F2F0EB", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* HEADER */}
      <div style={{ background: "#1A2035", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ color: "#C9A84C", fontWeight: 800, fontSize: 20 }}>Θ Τ</span>
          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, letterSpacing: "0.6px" }}>Pledge Book</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["pnm", "pm"].map(v => (
            <button key={v} onClick={() => setView(v)} style={btn({
              fontSize: 11, padding: "5px 16px", position: "relative",
              background: view === v ? "#C9A84C" : "transparent",
              color:      view === v ? "#1A2035" : "rgba(255,255,255,0.45)",
            })}>
              {v === "pnm" ? "PNM" : "PM VIEW"}
              {v === "pm" && pendingCount > 0 && (
                <span style={{ position: "absolute", top: 1, right: 1, background: "#B83232", color: "white", borderRadius: "50%", width: 13, height: 13, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── PNM VIEW ── */}
      {view === "pnm" && (
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "28px 16px" }}>

          {pnmScreen === "name_entry" && (
            <div style={{ background: "white", borderRadius: 8, padding: "44px 28px", textAlign: "center" }}>
              <div style={{ color: "#C9A84C", fontWeight: 800, fontSize: 34, marginBottom: 8 }}>Θ Τ</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "#1A2035", marginBottom: 4 }}>Welcome, PNM</div>
              <div style={{ color: "#aaa", fontSize: 13, marginBottom: 28 }}>Enter your name to see your progress</div>
              <input
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && nameInput.trim() && (setPnmName(nameInput.trim()), setPnmScreen("home"))}
                placeholder="First Last"
                style={{ width: "100%", padding: "10px 14px", border: "1px solid #E0DDD5", borderRadius: 4, fontSize: 15, fontFamily: "inherit", textAlign: "center", marginBottom: 12 }}
              />
              <button
                disabled={!nameInput.trim()}
                onClick={() => nameInput.trim() && (setPnmName(nameInput.trim()), setPnmScreen("home"))}
                style={btn({ width: "100%", padding: 12, fontSize: 13, background: nameInput.trim() ? "#1A2035" : "#ddd", color: nameInput.trim() ? "#C9A84C" : "#aaa", cursor: nameInput.trim() ? "pointer" : "not-allowed" })}
              >CONTINUE</button>
            </div>
          )}

          {pnmScreen === "home" && (
            <div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 22, color: "#1A2035" }}>Hey, {pnmName.split(" ")[0]} 👋</div>
                <div style={{ color: "#aaa", fontSize: 13, marginTop: 2 }}>Your pledge progress</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
                {[
                  { label: "Approved", key: "approved" },
                  { label: "Pending",  key: "pending"  },
                  { label: "Rejected", key: "rejected" },
                ].map(({ label, key }) => (
                  <div key={key} style={{ background: "white", borderRadius: 6, padding: "14px 10px", textAlign: "center", borderBottom: `3px solid ${STATUS_COLORS[key]}` }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: STATUS_COLORS[key] }}>{mySubs(pnmName).filter(s => s.status === key).length}</div>
                    <div style={{ fontSize: 11, color: "#aaa", fontWeight: 600, marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {mySubs(pnmName).length > 0 ? (
                <div style={{ background: "white", borderRadius: 8, padding: "14px 18px", marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#aaa", letterSpacing: "0.5px", marginBottom: 10 }}>RECENT</div>
                  {[...mySubs(pnmName)].reverse().slice(0, 5).map(sub => {
                    const at = ACTIVITY_TYPES.find(a => a.id === sub.type);
                    return (
                      <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F5F4F0" }}>
                        <span style={{ fontSize: 18 }}>{at?.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1A2035" }}>{at?.label}</div>
                          <div style={{ fontSize: 11, color: "#bbb" }}>{sub.date}</div>
                        </div>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: STATUS_BG[sub.status], color: STATUS_COLORS[sub.status], fontWeight: 700 }}>
                          {sub.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background: "white", borderRadius: 8, padding: "24px", textAlign: "center", color: "#ccc", fontSize: 14, marginBottom: 18 }}>
                  No activities logged yet
                </div>
              )}

              <button onClick={() => setPnmScreen("form")} style={btn({ width: "100%", padding: 13, fontSize: 14, background: "#1A2035", color: "#C9A84C" })}>
                + LOG ACTIVITY
              </button>
              <button
                onClick={() => { setPnmName(""); setNameInput(""); setPnmScreen("name_entry"); }}
                style={btn({ width: "100%", padding: 9, fontSize: 12, background: "none", color: "#bbb", fontWeight: 400, marginTop: 6 })}
              >
                Not {pnmName.split(" ")[0]}? Switch name
              </button>
            </div>
          )}

          {pnmScreen === "form" && (
            <div>
              <button onClick={() => setPnmScreen("home")} style={btn({ background: "none", color: "#888", fontSize: 13, marginBottom: 14, fontWeight: 600, padding: 0 })}>
                ← Back
              </button>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                {ACTIVITY_TYPES.map(a => (
                  <div key={a.id} onClick={() => setForm(f => ({ ...f, type: a.id }))} style={{
                    background: form.type === a.id ? "#1A2035" : "white",
                    borderRadius: 6, padding: "12px 14px", cursor: "pointer",
                    border: `2px solid ${form.type === a.id ? "#C9A84C" : "transparent"}`,
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{a.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: form.type === a.id ? "white" : "#1A2035", lineHeight: 1.3 }}>{a.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: "white", borderRadius: 8, padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                {selectedType?.detail === "active" && (
                  <Field label="Active's name" required>
                    <Input value={form.contactName} onChange={v => setForm(f => ({ ...f, contactName: v }))} placeholder="Which active?" />
                  </Field>
                )}
                {selectedType?.detail === "pnm" && (
                  <Field label="Other PNM's name" required>
                    <Input value={form.contactName} onChange={v => setForm(f => ({ ...f, contactName: v }))} placeholder="Who'd you interview with?" />
                  </Field>
                )}
                {selectedType?.detail === "event" && (
                  <Field label="Event name" required>
                    <Input value={form.eventName} onChange={v => setForm(f => ({ ...f, eventName: v }))} placeholder="e.g. Brotherhood Night" />
                  </Field>
                )}

                <Field label="Date" required>
                  <Input type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
                </Field>

                <Field label="Photo">
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: "2px dashed #E0DDD5", borderRadius: 6, padding: "20px",
                      textAlign: "center", cursor: "pointer",
                      background: photoPreview ? "#111" : "#FAFAF8",
                      minHeight: 90, display: "flex", alignItems: "center",
                      justifyContent: "center", flexDirection: "column", overflow: "hidden",
                    }}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" style={{ maxWidth: "100%", maxHeight: 180, borderRadius: 4, objectFit: "contain" }} />
                    ) : (
                      <>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>📷</div>
                        <div style={{ fontSize: 13, color: "#aaa" }}>Tap to upload a photo</div>
                      </>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: "none" }} />
                  </div>
                  {photoPreview && (
                    <button onClick={() => { setPhotoPreview(null); setForm(f => ({ ...f, photo: null })); }}
                      style={btn({ fontSize: 11, color: "#B83232", background: "none", fontWeight: 600, padding: "4px 0", marginTop: 4 })}>
                      Remove photo
                    </button>
                  )}
                </Field>

                <Field label="Notes for PNM">
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Anything to add about this activity…" rows={3}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #E0DDD5", borderRadius: 4, fontSize: 14, resize: "vertical", fontFamily: "inherit", color: "#1A2035" }} />
                </Field>

                {formError && <div style={{ color: "#B83232", fontSize: 13, fontWeight: 600 }}>{formError}</div>}

                <button onClick={handleSubmit} disabled={submitting} style={btn({ padding: 12, fontSize: 13, background: submitting ? "#aaa" : "#1A2035", color: "#C9A84C", cursor: submitting ? "not-allowed" : "pointer" })}>
                  {submitting ? "SUBMITTING…" : "SUBMIT FOR VERIFICATION"}
                </button>
              </div>
            </div>
          )}

          {pnmScreen === "submitted" && (
            <div style={{ background: "white", borderRadius: 8, padding: "48px 28px", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: "#1A2035", marginBottom: 8 }}>Logged</div>
              <div style={{ color: "#aaa", fontSize: 14, marginBottom: 28 }}>In the queue — your PM will verify it soon.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => setPnmScreen("home")} style={btn({ padding: "10px 28px", background: "#1A2035", color: "#C9A84C", fontSize: 13 })}>
                  BACK TO HOME
                </button>
                <button onClick={() => setPnmScreen("form")} style={btn({ padding: "10px 28px", background: "none", color: "#888", border: "1px solid #E0DDD5", fontWeight: 600, fontSize: 13 })}>
                  Log Another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PM VIEW ── */}
      {view === "pm" && (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 16px" }}>
          {!pmAuthed ? (
            <div style={{ maxWidth: 320, margin: "0 auto", background: "white", borderRadius: 8, padding: "40px 28px" }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: "#1A2035", marginBottom: 4 }}>PM Access</div>
              <div style={{ color: "#aaa", fontSize: 13, marginBottom: 22 }}>Pledge Master only</div>
              <input type="password" value={pwInput} onChange={e => setPwInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && login()} placeholder="Password"
                style={{ width: "100%", padding: "10px 12px", border: `1px solid ${pwError ? "#B83232" : "#E0DDD5"}`, borderRadius: 4, fontSize: 14, fontFamily: "inherit", marginBottom: 8 }} />
              {pwError && <div style={{ color: "#B83232", fontSize: 12, marginBottom: 8 }}>Wrong password</div>}
              <button onClick={login} style={btn({ width: "100%", padding: 10, background: "#1A2035", color: "#C9A84C", fontSize: 13 })}>
                LOGIN
              </button>
            </div>
          ) : (
            <div>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
                {["pending", "approved", "rejected"].map(key => (
                  <div key={key} onClick={() => setFilter(key)} style={{ background: filter === key ? "#1A2035" : "white", borderRadius: 6, padding: "14px 16px", cursor: "pointer", borderBottom: `3px solid ${STATUS_COLORS[key]}` }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: filter === key ? STATUS_COLORS[key] : "#1A2035" }}>
                      {submissions.filter(s => s.status === key).length}
                    </div>
                    <div style={{ fontSize: 12, color: filter === key ? "rgba(255,255,255,0.45)" : "#aaa", fontWeight: 600, marginTop: 2, textTransform: "capitalize" }}>{key}</div>
                  </div>
                ))}
              </div>

              {/* Leaderboard */}
              {leaderboard().length > 0 && (
                <div style={{ background: "white", borderRadius: 8, padding: "14px 18px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#aaa", letterSpacing: "0.5px", marginBottom: 10 }}>LEADERBOARD</div>
                  {leaderboard().map(([name, pts], i) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 0" }}>
                      <div style={{ width: 18, fontSize: 11, color: i === 0 ? "#C9A84C" : "#ccc", fontWeight: 800, textAlign: "right" }}>{i + 1}</div>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: i === 0 ? 700 : 400, color: "#1A2035" }}>{name}</div>
                      <div style={{ fontWeight: 800, color: "#C9A84C", fontSize: 14 }}>{pts} pts</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Share / QR */}
              <div style={{ background: "white", borderRadius: 8, padding: "14px 18px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2035" }}>Share with PNMs</div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>QR code + link for your site</div>
                  </div>
                  <button onClick={() => setShowQR(q => !q)} style={btn({ padding: "6px 14px", background: "#1A2035", color: "#C9A84C", fontSize: 12 })}>
                    {showQR ? "Hide" : "QR + Link"}
                  </button>
                </div>
                {showQR && (
                  <div style={{ marginTop: 16, textAlign: "center" }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`} alt="QR Code" style={{ borderRadius: 8, border: "1px solid #E0DDD5" }} />
                    <div style={{ fontSize: 11, color: "#888", marginTop: 10, wordBreak: "break-all", background: "#F5F4F0", padding: "7px 10px", borderRadius: 4 }}>
                      {shareUrl}
                    </div>
                    <button onClick={copyLink} style={btn({ marginTop: 8, padding: "6px 18px", background: "none", color: "#1A2035", border: "1px solid #E0DDD5", fontSize: 12 })}>
                      {copied ? "Copied ✓" : "Copy Link"}
                    </button>
                  </div>
                )}
              </div>

              {/* Filter tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {["pending", "approved", "rejected", "all"].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={btn({
                    padding: "5px 14px", borderRadius: 20, fontSize: 12,
                    background: filter === f ? "#1A2035" : "white",
                    color:      filter === f ? "#C9A84C" : "#888",
                    textTransform: "capitalize",
                  })}>{f}</button>
                ))}
              </div>

              {/* Submissions */}
              {visibleSubs.length === 0 ? (
                <div style={{ background: "white", borderRadius: 8, padding: 40, textAlign: "center", color: "#ccc", fontSize: 14 }}>
                  No {filter} submissions
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visibleSubs.map(sub => {
                    const at       = ACTIVITY_TYPES.find(a => a.id === sub.type);
                    const expanded = expandedId === sub.id;
                    const hasDetail = sub.notes || sub.hasPhoto;
                    return (
                      <div key={sub.id} style={{ background: "white", borderRadius: 6, borderLeft: `4px solid ${STATUS_COLORS[sub.status]}` }}>
                        <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 800, fontSize: 15, color: "#1A2035" }}>{sub.pnmName}</span>
                              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: STATUS_BG[sub.status], color: STATUS_COLORS[sub.status], fontWeight: 700 }}>
                                {sub.status}
                              </span>
                              {sub.hasPhoto && <span title="Has photo" style={{ fontSize: 13 }}>📷</span>}
                            </div>
                            <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
                              {at?.icon} {at?.label}
                              {sub.contactName && <span style={{ color: "#aaa" }}> · {sub.contactName}</span>}
                              {sub.eventName   && <span style={{ color: "#aaa" }}> · {sub.eventName}</span>}
                            </div>
                            <div style={{ fontSize: 11, color: "#ccc", marginTop: 4 }}>
                              {sub.date} · submitted {new Date(sub.submittedAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                            {sub.status === "pending" ? (
                              <div style={{ display: "flex", gap: 5 }}>
                                <button onClick={() => decide(sub.id, "approved")} style={btn({ padding: "5px 10px", background: "#2E8B57", color: "white", fontSize: 11 })}>✓</button>
                                <button onClick={() => decide(sub.id, "rejected")} style={btn({ padding: "5px 10px", background: "#B83232", color: "white", fontSize: 11 })}>✗</button>
                              </div>
                            ) : (
                              <button onClick={() => decide(sub.id, "pending")} style={btn({ padding: "3px 8px", background: "none", color: "#ccc", border: "1px solid #E0DDD5", fontSize: 10, fontWeight: 600 })}>undo</button>
                            )}
                            {hasDetail && (
                              <button onClick={() => toggleExpand(sub.id)} style={btn({ background: "none", color: "#bbb", fontSize: 11, fontWeight: 600, padding: 0 })}>
                                {expanded ? "▲ less" : "▼ more"}
                              </button>
                            )}
                          </div>
                        </div>
                        {expanded && (
                          <div style={{ padding: "0 14px 12px", borderTop: "1px solid #F5F4F0" }}>
                            {sub.notes && (
                              <div style={{ fontSize: 12, color: "#666", fontStyle: "italic", margin: "10px 0 0", borderLeft: "2px solid #E0DDD5", paddingLeft: 8 }}>
                                "{sub.notes}"
                              </div>
                            )}
                            {sub.hasPhoto && !expandedPhoto && <div style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>Loading photo…</div>}
                            {sub.hasPhoto && expandedPhoto && <img src={expandedPhoto} alt="Proof" style={{ maxWidth: "100%", borderRadius: 6, marginTop: 10 }} />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A2035", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#C9A84C" }}> *</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", padding: "9px 12px", border: "1px solid #E0DDD5", borderRadius: 4, fontSize: 14, fontFamily: "inherit", color: "#1A2035" }} />
  );
}

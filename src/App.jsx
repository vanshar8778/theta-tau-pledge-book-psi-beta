import { useState, useEffect, useRef } from "react";
import { collection, doc, setDoc, updateDoc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from "./firebase";

const PM_PASSWORD = import.meta.env.VITE_PM_PASSWORD || "thetataupledge";

const PNM_NAMES = [
  "Adryel Rosales Juarez",
  "Alvin An",
  "Alyssa Riddell",
  "Anusha Adhya",
  "Austin Rutherford",
  "Bailey Alexander",
  "Ben Corson",
  "Bennett Pearson",
  "Eduardo Botello",
  "Julia Lee",
  "Kate Leakey",
  "Kavya Ganguly",
  "Kaylin Kramer",
  "Kevin Ngyuen",
  "Lucas de Almedia",
  "Mahira Momin",
  "Pranaav Nair",
  "Rohan Cortes",
  "Ryan Gonzalez",
  "Sal Pellegrino",
  "Travis Schultz",
  "Violet Pyles",
];

// 5-digit PIN per PNM — swap any of these for your own before you share the link
const PNM_PASSWORDS = {
  "Adryel Rosales Juarez": "48213",
  "Alvin An":               "75092",
  "Alyssa Riddell":         "30587",
  "Anusha Adhya":           "61940",
  "Austin Rutherford":      "82715",
  "Bailey Alexander":       "19364",
  "Ben Corson":             "57028",
  "Bennett Pearson":        "40691",
  "Eduardo Botello":        "83257",
  "Julia Lee":              "92184",
  "Kate Leakey":            "36750",
  "Kavya Ganguly":          "71493",
  "Kaylin Kramer":          "58326",
  "Kevin Ngyuen":           "20947",
  "Lucas de Almedia":       "64829",
  "Mahira Momin":           "13578",
  "Pranaav Nair":           "90362",
  "Rohan Cortes":           "47185",
  "Ryan Gonzalez":          "25630",
  "Sal Pellegrino":         "81946",
  "Travis Schultz":         "39072",
  "Violet Pyles":           "60184",
};

const ACTIVITY_TYPES = [
  { id: "interview_active", label: "Interview with Active", icon: "🤝", detail: "active" },
  { id: "sig_active",       label: "Sig with Active",       icon: "✍️", detail: "active" },
  { id: "pnm_interview",    label: "1-on-1 PNM Interview",  icon: "💬", detail: "pnm"    },
  { id: "event",            label: "Event Attendance",       icon: "📅", detail: "event"  },
];

const DEFAULT_POINTS = { interview_active: 2, sig_active: 1.5, pnm_interview: 1, event: 1 };
const STATUS_COLORS  = { pending: "#C9A84C", approved: "#2E8B57", rejected: "#B83232" };
const STATUS_BG      = { pending: "#FDF8EC", approved: "#EDF7F1", rejected: "#FBEAEA" };

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
  const [points,      setPoints]      = useState(DEFAULT_POINTS);
  const [loading,     setLoading]     = useState(true);

  // Secret PM unlock: Kaylin selected → 5 corner taps → logo tap
  const [cornerCount, setCornerCount] = useState(0);
  const [cornerDone,  setCornerDone]  = useState(false);
  const cornerTimer                   = useRef(null);

  // PNM state machine
  const [pnmScreen,    setPnmScreen]    = useState("name_entry");
  const [pnmName,      setPnmName]      = useState("");
  const [nameInput,    setNameInput]    = useState("");
  const [pinInput,     setPinInput]     = useState("");
  const [pinError,     setPinError]     = useState(false);
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
  const [typeFilter,    setTypeFilter]    = useState("all");
  const [pnmFilter,     setPnmFilter]     = useState("");
  const [expandedId,    setExpandedId]    = useState(null);
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  const [showQR,        setShowQR]        = useState(false);
  const [copied,        setCopied]        = useState(false);

  // PM: point value editor
  const [pointsDraft, setPointsDraft] = useState(DEFAULT_POINTS);
  const [pointsSaved, setPointsSaved] = useState(false);

  // PM: manual point award
  const [awardPnm,     setAwardPnm]     = useState("");
  const [awardType,    setAwardType]    = useState("");
  const [awardPoints,  setAwardPoints]  = useState("");
  const [awardNote,    setAwardNote]    = useState("");
  const [awardError,   setAwardError]   = useState("");
  const [awardSuccess, setAwardSuccess] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "submissions"),
      (snap) => {
        setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => { console.error("Firestore error:", err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "points"),
      (snap) => {
        if (snap.exists()) {
          const merged = { ...DEFAULT_POINTS, ...snap.data() };
          setPoints(merged);
          setPointsDraft(merged);
        }
      },
      (err) => console.error("Points settings error:", err)
    );
    return () => unsub();
  }, []);

  // Step 1: corner tap (only when Kaylin is selected in dropdown)
  function handleCornerTap() {
    if (nameInput !== "Kaylin Kramer") return;
    if (cornerDone) return;
    if (cornerTimer.current) clearTimeout(cornerTimer.current);
    const next = cornerCount + 1;
    if (next >= 5) {
      setCornerCount(0);
      setCornerDone(true);
      cornerTimer.current = setTimeout(() => { setCornerDone(false); }, 8000);
    } else {
      setCornerCount(next);
      cornerTimer.current = setTimeout(() => setCornerCount(0), 2000);
    }
  }

  // Step 2: logo tap
  function handleLogoTap() {
    if (cornerDone) {
      if (cornerTimer.current) clearTimeout(cornerTimer.current);
      setCornerDone(false);
      setCornerCount(0);
      setView("pm");
    }
  }

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

  function continuePnm() {
    if (!nameInput || pinInput.length !== 5) return;
    if (pinInput !== PNM_PASSWORDS[nameInput]) {
      setPinError(true);
      return;
    }
    setPinError(false);
    setPnmName(nameInput);
    setPnmScreen("home");
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
      if (form.photo) await setDoc(doc(db, "photos", id), { data: form.photo });
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
    } catch (e) { console.error("Update failed:", e); }
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

  // Per-PNM activity breakdown (approved only). Bonus is stored as accumulated points, not a count.
  function pnmBreakdown() {
    const breakdown = {};
    PNM_NAMES.forEach(name => {
      breakdown[name] = { sig_active: 0, interview_active: 0, pnm_interview: 0, event: 0, bonus: 0 };
    });
    submissions.filter(s => s.status === "approved").forEach(s => {
      if (breakdown[s.pnmName] === undefined) return;
      if (s.type === "bonus") {
        breakdown[s.pnmName].bonus += (s.bonusPoints || 0);
      } else {
        breakdown[s.pnmName][s.type] = (breakdown[s.pnmName][s.type] || 0) + 1;
      }
    });
    return breakdown;
  }

  // All PNMs included (0 pts if none approved) — PM eyes only, never rendered for PNMs
  function fullLeaderboard() {
    const tally = {};
    PNM_NAMES.forEach(name => { tally[name] = 0; });
    submissions.filter(s => s.status === "approved").forEach(s => {
      if (tally[s.pnmName] === undefined) return;
      tally[s.pnmName] += s.type === "bonus" ? (s.bonusPoints || 0) : (points[s.type] || 0);
    });
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }

  // Class averages across all PNMs (approved only)
  function calcAverages() {
    const bd = pnmBreakdown();
    const n  = PNM_NAMES.length;
    const totals = { sig_active: 0, interview_active: 0, pnm_interview: 0, event: 0, bonus: 0 };
    PNM_NAMES.forEach(name => {
      totals.sig_active       += bd[name].sig_active;
      totals.interview_active += bd[name].interview_active;
      totals.pnm_interview    += bd[name].pnm_interview;
      totals.event            += bd[name].event;
      totals.bonus            += bd[name].bonus;
    });
    return {
      sig_active:       (totals.sig_active       / n).toFixed(1),
      interview_active: (totals.interview_active / n).toFixed(1),
      pnm_interview:    (totals.pnm_interview    / n).toFixed(1),
      event:            (totals.event            / n).toFixed(1),
      total:            ((totals.sig_active * points.sig_active + totals.interview_active * points.interview_active + totals.pnm_interview * points.pnm_interview + totals.event * points.event + totals.bonus) / n).toFixed(1),
    };
  }

  function calcMedians() {
    const bd   = pnmBreakdown();
    const lb   = Object.fromEntries(fullLeaderboard());
    const vals = { sig_active: [], interview_active: [], pnm_interview: [], event: [], total: [] };
    PNM_NAMES.forEach(name => {
      const r = bd[name];
      vals.sig_active.push(r.sig_active);
      vals.interview_active.push(r.interview_active);
      vals.pnm_interview.push(r.pnm_interview);
      vals.event.push(r.event);
      vals.total.push(lb[name] || 0);
    });
    function med(arr) {
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return (s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(1);
    }
    return {
      sig_active:       med(vals.sig_active),
      interview_active: med(vals.interview_active),
      pnm_interview:    med(vals.pnm_interview),
      event:            med(vals.event),
      total:            med(vals.total),
    };
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function exportCSV() {
    const headers = ["Name", "Type", "Contact/Event", "Date", "Notes", "Status", "Points", "Submitted At"];
    const rows = submissions.map(s => [
      s.pnmName,
      s.type === "bonus" ? "Bonus / PM Discretion" : (ACTIVITY_TYPES.find(a => a.id === s.type)?.label || s.type),
      s.contactName || s.eventName || "",
      s.date,
      s.notes || "",
      s.status,
      s.status === "approved" ? (s.type === "bonus" ? (s.bonusPoints || 0) : (points[s.type] || 0)) : "",
      new Date(s.submittedAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `theta-tau-submissions-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function savePoints() {
    try {
      await setDoc(doc(db, "settings", "points"), {
        interview_active: Number(pointsDraft.interview_active) || 0,
        sig_active:       Number(pointsDraft.sig_active)       || 0,
        pnm_interview:    Number(pointsDraft.pnm_interview)    || 0,
        event:            Number(pointsDraft.event)            || 0,
      });
      setPointsSaved(true);
      setTimeout(() => setPointsSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save point values:", e);
    }
  }

  async function submitAward() {
    setAwardError("");
    if (!awardPnm)  { setAwardError("Select a PNM."); return; }
    if (!awardType) { setAwardError("Select an activity type."); return; }
    if (awardType === "bonus" && (awardPoints === "" || isNaN(Number(awardPoints)))) {
      setAwardError("Enter a point value for the bonus.");
      return;
    }
    const id  = crypto.randomUUID();
    const sub = {
      pnmName: awardPnm,
      type: awardType,
      contactName: "", eventName: "",
      date: new Date().toISOString().slice(0, 10),
      notes: awardNote,
      hasPhoto: false,
      status: "approved",
      submittedAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
      manualAward: true,
      ...(awardType === "bonus" ? { bonusPoints: Number(awardPoints) } : {}),
    };
    try {
      await setDoc(doc(db, "submissions", id), sub);
      setAwardPnm(""); setAwardType(""); setAwardPoints(""); setAwardNote("");
      setAwardSuccess(true);
      setTimeout(() => setAwardSuccess(false), 2000);
    } catch (e) {
      setAwardError("Failed to award — check your connection and try again.");
    }
  }

  const pendingCount = submissions.filter(s => s.status === "pending").length;

  // Submissions list: chronological sort (newest first) + status/type/PNM filters
  const visibleSubs = submissions
    .filter(s => filter === "all" || s.status === filter)
    .filter(s => typeFilter === "all" || s.type === typeFilter)
    .filter(s => !pnmFilter || s.pnmName === pnmFilter)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  const selectedType = ACTIVITY_TYPES.find(a => a.id === form.type);
  const shareUrl     = typeof window !== "undefined" ? window.location.href : "";

  const btn = (extra = {}) => ({
    border: "none", cursor: "pointer", fontFamily: "inherit",
    fontWeight: 800, letterSpacing: "0.4px", borderRadius: 4, ...extra,
  });

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#F2F0EB", color:"#888", fontFamily:"system-ui" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#F2F0EB", fontFamily:"'Inter', system-ui, sans-serif" }}>

      {/* HEADER */}
      <div style={{ position:"relative", background:"#1A2035", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:54 }}>
        <div
          onClick={handleLogoTap}
          style={{ display:"flex", alignItems:"baseline", gap:10, cursor:"default", userSelect:"none" }}
        >
          <span style={{ color: cornerDone ? "#ffffff" : "#C9A84C", fontWeight:800, fontSize:20, transition:"color 0.2s" }}>Θ Τ</span>
          <span style={{ color:"rgba(255,255,255,0.45)", fontSize:12, letterSpacing:"0.6px" }}>Pledge Book</span>
        </div>

        {view === "pm" && (
          <button onClick={() => { setView("pnm"); setPmAuthed(false); setPwInput(""); }}
            style={btn({ fontSize:11, padding:"5px 14px", background:"rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.6)" })}>
            ← PNM View
          </button>
        )}

        {view === "pnm" && (
          <div
            onClick={handleCornerTap}
            style={{ position:"absolute", top:0, right:0, width:64, height:54, cursor:"default", WebkitTapHighlightColor:"transparent" }}
          />
        )}
      </div>

      {/* ── PNM VIEW ── */}
      {view === "pnm" && (
        <div style={{ maxWidth:460, margin:"0 auto", padding:"28px 16px" }}>

          {/* NAME ENTRY */}
          {pnmScreen === "name_entry" && (
            <div style={{ background:"white", borderRadius:8, padding:"44px 28px", textAlign:"center" }}>
              <div style={{ color:"#C9A84C", fontWeight:800, fontSize:34, marginBottom:8 }}>Θ Τ</div>
              <div style={{ fontWeight:800, fontSize:20, color:"#1A2035", marginBottom:4 }}>Welcome, PNM</div>
              <div style={{ color:"#aaa", fontSize:13, marginBottom:28 }}>Select your name and enter your PIN</div>
              <select
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setPinInput(""); setPinError(false); }}
                style={{ width:"100%", padding:"10px 14px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:15, fontFamily:"inherit", marginBottom:12, background:"white", color: nameInput ? "#1A2035" : "#aaa" }}
              >
                <option value="">Select your name…</option>
                {PNM_NAMES.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={pinInput}
                onChange={e => { setPinInput(e.target.value.replace(/\D/g, "").slice(0, 5)); setPinError(false); }}
                onKeyDown={e => e.key === "Enter" && continuePnm()}
                placeholder="5-digit PIN"
                style={{ width:"100%", padding:"10px 14px", border:`1px solid ${pinError ? "#B83232" : "#E0DDD5"}`, borderRadius:4, fontSize:16, fontFamily:"inherit", marginBottom:8, letterSpacing:"5px", textAlign:"center" }}
              />
              {pinError && <div style={{ color:"#B83232", fontSize:12, marginBottom:8 }}>Wrong PIN — try again</div>}
              <button
                disabled={!nameInput || pinInput.length !== 5}
                onClick={continuePnm}
                style={btn({ width:"100%", padding:12, fontSize:13, marginTop:4, background: (nameInput && pinInput.length===5) ? "#1A2035" : "#ddd", color: (nameInput && pinInput.length===5) ? "#C9A84C" : "#aaa", cursor: (nameInput && pinInput.length===5) ? "pointer" : "not-allowed" })}
              >CONTINUE</button>
            </div>
          )}

          {/* HOME SCREEN */}
          {pnmScreen === "home" && (
            <div>
              <div style={{ marginBottom:22 }}>
                <div style={{ fontWeight:800, fontSize:22, color:"#1A2035" }}>Hey, {pnmName.split(" ")[0]} 👋</div>
                <div style={{ color:"#aaa", fontSize:13, marginTop:2 }}>Log your pledge activities below</div>
              </div>

              <button onClick={() => setPnmScreen("form")} style={btn({ width:"100%", padding:14, fontSize:14, background:"#1A2035", color:"#C9A84C", marginBottom:10 })}>
                + LOG ACTIVITY
              </button>
              <button onClick={() => { setPnmName(""); setNameInput(""); setPinInput(""); setPnmScreen("name_entry"); setCornerCount(0); setCornerDone(false); }}
                style={btn({ width:"100%", padding:9, fontSize:12, background:"none", color:"#bbb", fontWeight:400, marginTop:4 })}>
                Not {pnmName.split(" ")[0]}? Switch name
              </button>
            </div>
          )}

          {/* FORM */}
          {pnmScreen === "form" && (
            <div>
              <button onClick={() => setPnmScreen("home")} style={btn({ background:"none", color:"#888", fontSize:13, marginBottom:14, fontWeight:600, padding:0 })}>
                ← Back
              </button>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                {ACTIVITY_TYPES.map(a => (
                  <div key={a.id} onClick={() => setForm(f => ({ ...f, type:a.id }))} style={{
                    background: form.type===a.id ? "#1A2035" : "white",
                    borderRadius:6, padding:"12px 14px", cursor:"pointer",
                    border:`2px solid ${form.type===a.id ? "#C9A84C" : "transparent"}`,
                  }}>
                    <div style={{ fontSize:20, marginBottom:6 }}>{a.icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:form.type===a.id ? "white" : "#1A2035", lineHeight:1.3 }}>{a.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background:"white", borderRadius:8, padding:22, display:"flex", flexDirection:"column", gap:14 }}>
                {selectedType?.detail === "active" && (
                  <Field label="Active's name" required>
                    <Input value={form.contactName} onChange={v => setForm(f => ({ ...f, contactName:v }))} placeholder="Which active?" />
                  </Field>
                )}
                {selectedType?.detail === "pnm" && (
                  <Field label="Other PNM's name" required>
                    <Input value={form.contactName} onChange={v => setForm(f => ({ ...f, contactName:v }))} placeholder="Who'd you interview with?" />
                  </Field>
                )}
                {selectedType?.detail === "event" && (
                  <Field label="Event name" required>
                    <Input value={form.eventName} onChange={v => setForm(f => ({ ...f, eventName:v }))} placeholder="e.g. Brotherhood Night" />
                  </Field>
                )}
                <Field label="Date" required>
                  <Input type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date:v }))} />
                </Field>
                <Field label="Photo">
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{ border:"2px dashed #E0DDD5", borderRadius:6, padding:"20px", textAlign:"center", cursor:"pointer", background:photoPreview ? "#111" : "#FAFAF8", minHeight:90, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", overflow:"hidden" }}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="Preview" style={{ maxWidth:"100%", maxHeight:180, borderRadius:4, objectFit:"contain" }} />
                    ) : (
                      <>
                        <div style={{ fontSize:26, marginBottom:6 }}>📷</div>
                        <div style={{ fontSize:13, color:"#aaa" }}>Tap to upload a photo</div>
                      </>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display:"none" }} />
                  </div>
                  {photoPreview && (
                    <button onClick={() => { setPhotoPreview(null); setForm(f => ({ ...f, photo:null })); }}
                      style={btn({ fontSize:11, color:"#B83232", background:"none", fontWeight:600, padding:"4px 0", marginTop:4 })}>
                      Remove photo
                    </button>
                  )}
                </Field>
                <Field label="Notes for PM">
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes:e.target.value }))}
                    placeholder="Anything to add about this activity…" rows={3}
                    style={{ width:"100%", padding:"9px 12px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:14, resize:"vertical", fontFamily:"inherit", color:"#1A2035" }} />
                </Field>
                {formError && <div style={{ color:"#B83232", fontSize:13, fontWeight:600 }}>{formError}</div>}
                <button onClick={handleSubmit} disabled={submitting} style={btn({ padding:12, fontSize:13, background:submitting ? "#aaa" : "#1A2035", color:"#C9A84C", cursor:submitting ? "not-allowed" : "pointer" })}>
                  {submitting ? "SUBMITTING…" : "SUBMIT FOR VERIFICATION"}
                </button>
              </div>
            </div>
          )}

          {/* SUBMITTED */}
          {pnmScreen === "submitted" && (
            <div style={{ background:"white", borderRadius:8, padding:"48px 28px", textAlign:"center" }}>
              <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
              <div style={{ fontWeight:800, fontSize:20, color:"#1A2035", marginBottom:8 }}>Logged</div>
              <div style={{ color:"#aaa", fontSize:14, marginBottom:28 }}>In the queue — your PM will verify it soon.</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <button onClick={() => setPnmScreen("home")} style={btn({ padding:"10px 28px", background:"#1A2035", color:"#C9A84C", fontSize:13 })}>
                  BACK TO HOME
                </button>
                <button onClick={() => setPnmScreen("form")} style={btn({ padding:"10px 28px", background:"none", color:"#888", border:"1px solid #E0DDD5", fontWeight:600, fontSize:13 })}>
                  Log Another
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PM VIEW ── */}
      {view === "pm" && (
        <div style={{ maxWidth:720, margin:"0 auto", padding:"28px 16px" }}>
          {!pmAuthed ? (
            <div style={{ maxWidth:320, margin:"0 auto", background:"white", borderRadius:8, padding:"40px 28px" }}>
              <div style={{ fontWeight:800, fontSize:18, color:"#1A2035", marginBottom:4 }}>PM Access</div>
              <div style={{ color:"#aaa", fontSize:13, marginBottom:22 }}>Pledge Master only</div>
              <input type="password" value={pwInput} onChange={e => setPwInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && login()} placeholder="Password"
                style={{ width:"100%", padding:"10px 12px", border:`1px solid ${pwError ? "#B83232" : "#E0DDD5"}`, borderRadius:4, fontSize:14, fontFamily:"inherit", marginBottom:8 }} />
              {pwError && <div style={{ color:"#B83232", fontSize:12, marginBottom:8 }}>Wrong password</div>}
              <button onClick={login} style={btn({ width:"100%", padding:10, background:"#1A2035", color:"#C9A84C", fontSize:13 })}>
                LOGIN
              </button>
            </div>
          ) : (
            <div>
              {/* Status stat cards */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:10 }}>
                {["pending","approved","rejected"].map(key => (
                  <div key={key} onClick={() => setFilter(key)} style={{ background:filter===key ? "#1A2035" : "white", borderRadius:6, padding:"14px 16px", cursor:"pointer", borderBottom:`3px solid ${STATUS_COLORS[key]}` }}>
                    <div style={{ fontSize:26, fontWeight:800, color:filter===key ? STATUS_COLORS[key] : "#1A2035" }}>
                      {submissions.filter(s => s.status===key).length}
                    </div>
                    <div style={{ fontSize:12, color:filter===key ? "rgba(255,255,255,0.45)" : "#aaa", fontWeight:600, marginTop:2, textTransform:"capitalize" }}>{key}</div>
                  </div>
                ))}
              </div>

              {/* Point value editor */}
              <div style={{ background:"white", borderRadius:8, padding:"14px 18px", marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:800, color:"#aaa", letterSpacing:"0.5px", marginBottom:12 }}>ACTIVITY POINT VALUES</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:10, marginBottom:12 }}>
                  {ACTIVITY_TYPES.map(a => (
                    <div key={a.id}>
                      <div style={{ fontSize:11, color:"#888", fontWeight:600, marginBottom:4 }}>{a.icon} {a.label}</div>
                      <input
                        type="number"
                        step="0.5"
                        value={pointsDraft[a.id]}
                        onChange={e => setPointsDraft(p => ({ ...p, [a.id]: e.target.value }))}
                        style={{ width:"100%", padding:"7px 10px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:14, fontFamily:"inherit", color:"#1A2035" }}
                      />
                    </div>
                  ))}
                </div>
                <button onClick={savePoints} style={btn({ padding:"8px 20px", background:"#1A2035", color:"#C9A84C", fontSize:12 })}>
                  {pointsSaved ? "Saved ✓" : "Save Point Values"}
                </button>
              </div>

              {/* Manual point award */}
              <div style={{ background:"white", borderRadius:8, padding:"14px 18px", marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:800, color:"#aaa", letterSpacing:"0.5px", marginBottom:4 }}>AWARD POINTS MANUALLY</div>
                <div style={{ fontSize:11, color:"#bbb", marginBottom:12 }}>Log an already-approved activity for a PNM directly — e.g. helping clean up, going above and beyond, etc.</div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <select value={awardPnm} onChange={e => setAwardPnm(e.target.value)}
                    style={{ padding:"9px 12px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:14, fontFamily:"inherit", background:"white", color: awardPnm ? "#1A2035" : "#aaa" }}>
                    <option value="">Select PNM…</option>
                    {PNM_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <select value={awardType} onChange={e => setAwardType(e.target.value)}
                    style={{ padding:"9px 12px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:14, fontFamily:"inherit", background:"white", color: awardType ? "#1A2035" : "#aaa" }}>
                    <option value="">Select activity type…</option>
                    {ACTIVITY_TYPES.map(a => <option key={a.id} value={a.id}>{a.icon} {a.label} (+{points[a.id]})</option>)}
                    <option value="bonus">🌟 Bonus — custom point value</option>
                  </select>
                  {awardType === "bonus" && (
                    <input type="number" step="0.5" value={awardPoints} onChange={e => setAwardPoints(e.target.value)}
                      placeholder="Points to award"
                      style={{ padding:"9px 12px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:14, fontFamily:"inherit", color:"#1A2035" }} />
                  )}
                  <textarea value={awardNote} onChange={e => setAwardNote(e.target.value)} rows={2}
                    placeholder="Reason / note (kept in your PM records)"
                    style={{ padding:"9px 12px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:14, resize:"vertical", fontFamily:"inherit", color:"#1A2035" }} />
                  {awardError && <div style={{ color:"#B83232", fontSize:12, fontWeight:600 }}>{awardError}</div>}
                  <button onClick={submitAward} style={btn({ padding:11, background:"#2E8B57", color:"white", fontSize:13 })}>
                    {awardSuccess ? "Awarded ✓" : "Award Points"}
                  </button>
                </div>
              </div>

              {/* Class stats row (mean + median) */}
              {(() => {
                const avg = calcAverages();
                const med = calcMedians();
                const metrics = [
                  { label:"Pts",          avg: avg.total,            med: med.total,            color:"#C9A84C" },
                  { label:"Interviews",   avg: avg.interview_active, med: med.interview_active, color:"#4A90D9" },
                  { label:"Sigs",         avg: avg.sig_active,       med: med.sig_active,       color:"#7B5EA7" },
                  { label:"PNM 1-on-1s",  avg: avg.pnm_interview,    med: med.pnm_interview,    color:"#2E8B57" },
                  { label:"Events",       avg: avg.event,             med: med.event,            color:"#D9822B" },
                ];
                return (
                  <div style={{ background:"white", borderRadius:8, padding:"12px 18px", marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:"#aaa", letterSpacing:"0.5px", marginBottom:10 }}>CLASS STATS (PER PNM, APPROVED)</div>
                    <div style={{ display:"flex", gap:0, flexWrap:"wrap" }}>
                      {metrics.map(({ label, avg: a, med: m, color }) => (
                        <div key={label} style={{ flex:"1 1 80px", textAlign:"center", padding:"4px 8px" }}>
                          <div style={{ fontSize:20, fontWeight:800, color }}>{a}</div>
                          <div style={{ fontSize:9, color:"#ccc", fontWeight:600, marginTop:1 }}>mean</div>
                          <div style={{ fontSize:14, fontWeight:800, color, opacity:0.6, marginTop:5 }}>{m}</div>
                          <div style={{ fontSize:9, color:"#ccc", fontWeight:600, marginTop:1 }}>median</div>
                          <div style={{ fontSize:10, color:"#aaa", fontWeight:700, marginTop:5 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* PNM Activity Breakdown */}
              <div style={{ background:"white", borderRadius:8, padding:"14px 18px", marginBottom:14, overflowX:"auto" }}>
                <div style={{ fontSize:11, fontWeight:800, color:"#aaa", letterSpacing:"0.5px", marginBottom:12 }}>PNM ACTIVITY BREAKDOWN (APPROVED)</div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead>
                    <tr style={{ borderBottom:"2px solid #E0DDD5" }}>
                      <th style={{ textAlign:"left",   padding:"6px 8px 8px 0",  color:"#1A2035", fontWeight:800, fontSize:12 }}>PNM</th>
                      <th style={{ textAlign:"center", padding:"6px 6px 8px",    color:"#555",    fontWeight:700, fontSize:11 }}>✍️ Sigs</th>
                      <th style={{ textAlign:"center", padding:"6px 6px 8px",    color:"#555",    fontWeight:700, fontSize:11 }}>🤝 Interviews</th>
                      <th style={{ textAlign:"center", padding:"6px 6px 8px",    color:"#555",    fontWeight:700, fontSize:11 }}>💬 PNM 1-on-1s</th>
                      <th style={{ textAlign:"center", padding:"6px 6px 8px",    color:"#555",    fontWeight:700, fontSize:11 }}>📅 Events</th>
                      <th style={{ textAlign:"center", padding:"6px 6px 8px",    color:"#555",    fontWeight:700, fontSize:11 }}>🌟 Bonus</th>
                      <th style={{ textAlign:"center", padding:"6px 0 8px 6px",  color:"#C9A84C", fontWeight:700, fontSize:11 }}>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const bd  = pnmBreakdown();
                      const lb  = Object.fromEntries(fullLeaderboard());
                      // Sort by total points desc
                      const sorted = [...PNM_NAMES].sort((a, b) => (lb[b] || 0) - (lb[a] || 0));
                      return sorted.map((name, i) => {
                        const r     = bd[name];
                        const pts   = lb[name] || 0;
                        const total = r.sig_active + r.interview_active + r.pnm_interview + r.event;
                        return (
                          <tr key={name} style={{ borderBottom:"1px solid #F5F4F0", background: i % 2 === 0 ? "transparent" : "#FAFAF8" }}>
                            <td style={{ padding:"7px 8px 7px 0", color:"#1A2035", fontWeight: total > 0 ? 600 : 400, whiteSpace:"nowrap" }}>
                              {name.split(" ")[0]} {name.split(" ").slice(-1)[0]}
                            </td>
                            <td style={{ textAlign:"center", padding:"7px 6px", color: r.sig_active       > 0 ? "#7B5EA7" : "#ccc", fontWeight:700 }}>{r.sig_active       || "—"}</td>
                            <td style={{ textAlign:"center", padding:"7px 6px", color: r.interview_active > 0 ? "#4A90D9" : "#ccc", fontWeight:700 }}>{r.interview_active || "—"}</td>
                            <td style={{ textAlign:"center", padding:"7px 6px", color: r.pnm_interview    > 0 ? "#2E8B57" : "#ccc", fontWeight:700 }}>{r.pnm_interview    || "—"}</td>
                            <td style={{ textAlign:"center", padding:"7px 6px", color: r.event            > 0 ? "#D9822B" : "#ccc", fontWeight:700 }}>{r.event            || "—"}</td>
                            <td style={{ textAlign:"center", padding:"7px 6px", color: r.bonus            > 0 ? "#C9A84C" : "#ccc", fontWeight:700 }}>{r.bonus > 0 ? `+${r.bonus}` : "—"}</td>
                            <td style={{ textAlign:"center", padding:"7px 0 7px 6px", color: pts > 0 ? "#C9A84C" : "#ccc", fontWeight:800 }}>{pts || "—"}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Share / Export */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                <div style={{ background:"white", borderRadius:8, padding:"14px 18px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1A2035", marginBottom:4 }}>Share with PNMs</div>
                  <div style={{ fontSize:11, color:"#aaa", marginBottom:10 }}>QR code + link</div>
                  <button onClick={() => setShowQR(q => !q)} style={btn({ width:"100%", padding:"7px", background:"#1A2035", color:"#C9A84C", fontSize:12 })}>
                    {showQR ? "Hide QR" : "Show QR"}
                  </button>
                  {showQR && (
                    <div style={{ marginTop:12, textAlign:"center" }}>
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}`} alt="QR" style={{ borderRadius:6, border:"1px solid #E0DDD5" }} />
                      <button onClick={copyLink} style={btn({ marginTop:8, width:"100%", padding:"6px", background:"none", color:"#1A2035", border:"1px solid #E0DDD5", fontSize:11 })}>
                        {copied ? "Copied ✓" : "Copy Link"}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ background:"white", borderRadius:8, padding:"14px 18px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1A2035", marginBottom:4 }}>Backup Data</div>
                  <div style={{ fontSize:11, color:"#aaa", marginBottom:10 }}>Download all submissions as CSV</div>
                  <button onClick={exportCSV} style={btn({ width:"100%", padding:"7px", background:"#2E8B57", color:"white", fontSize:12 })}>
                    ↓ Export CSV
                  </button>
                  <div style={{ fontSize:10, color:"#ccc", marginTop:8 }}>
                    {submissions.length} total submissions
                  </div>
                </div>
              </div>

              {/* ── Submission filters ── */}
              {/* Row 1: status */}
              <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                {["pending","approved","rejected","all"].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={btn({
                    padding:"5px 14px", borderRadius:20, fontSize:12,
                    background: filter===f ? "#1A2035" : "white",
                    color:      filter===f ? "#C9A84C" : "#888",
                    textTransform:"capitalize",
                  })}>{f}</button>
                ))}
              </div>

              {/* Row 2: activity type */}
              <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
                {[
                  { id:"all",              label:"All types" },
                  { id:"interview_active", label:"🤝 Interviews" },
                  { id:"sig_active",       label:"✍️ Sigs" },
                  { id:"pnm_interview",    label:"💬 PNM 1-on-1" },
                  { id:"event",            label:"📅 Events" },
                  { id:"bonus",            label:"🌟 Bonus" },
                ].map(f => (
                  <button key={f.id} onClick={() => setTypeFilter(f.id)} style={btn({
                    padding:"5px 12px", borderRadius:20, fontSize:11,
                    background: typeFilter===f.id ? "#E8EBF2" : "white",
                    color:      typeFilter===f.id ? "#1A2035" : "#aaa",
                    fontWeight: typeFilter===f.id ? 800 : 600,
                    border: typeFilter===f.id ? "1.5px solid #1A2035" : "1.5px solid transparent",
                  })}>{f.label}</button>
                ))}
              </div>

              {/* Row 3: PNM filter */}
              <div style={{ marginBottom:12 }}>
                <select
                  value={pnmFilter}
                  onChange={e => setPnmFilter(e.target.value)}
                  style={{ padding:"6px 12px", border:"1px solid #E0DDD5", borderRadius:20, fontSize:12, fontFamily:"inherit", background:"white", color: pnmFilter ? "#1A2035" : "#aaa", cursor:"pointer" }}
                >
                  <option value="">All PNMs</option>
                  {PNM_NAMES.map(name => (
                    <option key={name} value={name}>{name.split(" ")[0]} {name.split(" ").slice(-1)[0]}</option>
                  ))}
                </select>
                {pnmFilter && (
                  <button onClick={() => setPnmFilter("")} style={btn({ marginLeft:8, padding:"5px 10px", borderRadius:20, fontSize:11, background:"none", color:"#B83232", fontWeight:700 })}>
                    ✕ clear
                  </button>
                )}
                <span style={{ marginLeft:12, fontSize:11, color:"#aaa" }}>{visibleSubs.length} result{visibleSubs.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Submissions list */}
              {visibleSubs.length === 0 ? (
                <div style={{ background:"white", borderRadius:8, padding:40, textAlign:"center", color:"#ccc", fontSize:14 }}>
                  No submissions match these filters
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {visibleSubs.map(sub => {
                    const at = sub.type === "bonus"
                      ? { icon: "🌟", label: "Bonus / PM Discretion" }
                      : ACTIVITY_TYPES.find(a => a.id === sub.type);
                    const expanded = expandedId === sub.id;
                    const hasDetail = sub.notes || sub.hasPhoto;
                    return (
                      <div key={sub.id} style={{ background:"white", borderRadius:6, borderLeft:`4px solid ${STATUS_COLORS[sub.status]}` }}>
                        <div style={{ padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                              <span style={{ fontWeight:800, fontSize:15, color:"#1A2035" }}>{sub.pnmName}</span>
                              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:STATUS_BG[sub.status], color:STATUS_COLORS[sub.status], fontWeight:700 }}>
                                {sub.status}
                              </span>
                              {sub.manualAward && <span title="Manually awarded by PM" style={{ fontSize:13 }}>🛠️</span>}
                              {sub.hasPhoto && <span title="Has photo" style={{ fontSize:13 }}>📷</span>}
                            </div>
                            <div style={{ fontSize:13, color:"#555", marginTop:4 }}>
                              {at?.icon} {at?.label}
                              {sub.contactName && <span style={{ color:"#aaa" }}> · {sub.contactName}</span>}
                              {sub.eventName   && <span style={{ color:"#aaa" }}> · {sub.eventName}</span>}
                              {sub.type === "bonus" && <span style={{ color:"#C9A84C", fontWeight:700 }}> · +{sub.bonusPoints} pts</span>}
                            </div>
                            <div style={{ fontSize:11, color:"#ccc", marginTop:4 }}>
                              {sub.date} · submitted {new Date(sub.submittedAt).toLocaleString()}
                            </div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
                            {sub.status === "pending" ? (
                              <div style={{ display:"flex", gap:5 }}>
                                <button onClick={() => decide(sub.id,"approved")} style={btn({ padding:"5px 10px", background:"#2E8B57", color:"white", fontSize:11 })}>✓</button>
                                <button onClick={() => decide(sub.id,"rejected")} style={btn({ padding:"5px 10px", background:"#B83232", color:"white", fontSize:11 })}>✗</button>
                              </div>
                            ) : (
                              <button onClick={() => decide(sub.id,"pending")} style={btn({ padding:"3px 8px", background:"none", color:"#ccc", border:"1px solid #E0DDD5", fontSize:10, fontWeight:600 })}>undo</button>
                            )}
                            {hasDetail && (
                              <button onClick={() => toggleExpand(sub.id)} style={btn({ background:"none", color:"#bbb", fontSize:11, fontWeight:600, padding:0 })}>
                                {expanded ? "▲ less" : "▼ more"}
                              </button>
                            )}
                          </div>
                        </div>
                        {expanded && (
                          <div style={{ padding:"0 14px 12px", borderTop:"1px solid #F5F4F0" }}>
                            {sub.notes && (
                              <div style={{ fontSize:12, color:"#666", fontStyle:"italic", margin:"10px 0 0", borderLeft:"2px solid #E0DDD5", paddingLeft:8 }}>
                                "{sub.notes}"
                              </div>
                            )}
                            {sub.hasPhoto && !expandedPhoto && <div style={{ fontSize:12, color:"#bbb", marginTop:8 }}>Loading photo…</div>}
                            {sub.hasPhoto && expandedPhoto && <img src={expandedPhoto} alt="Proof" style={{ maxWidth:"100%", borderRadius:6, marginTop:10 }} />}
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
      <div style={{ fontSize:12, fontWeight:700, color:"#1A2035", marginBottom:6 }}>
        {label}{required && <span style={{ color:"#C9A84C" }}> *</span>}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width:"100%", padding:"9px 12px", border:"1px solid #E0DDD5", borderRadius:4, fontSize:14, fontFamily:"inherit", color:"#1A2035" }} />
  );
}

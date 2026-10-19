"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch as fetch } from "@/lib/authenticated-fetch";
import { LogoutButton } from "@/components/logout-button";

type LineRecord = {
  id: string;
  lineNumber: string;
  location: string;
  from: string;
  to: string;
  service: string;
  material: string;
  pipeSize: number;
  originalThickness: number;
  cmlCount: number;
  testPointCount: number;
  latestInspection: { date: string; thickness: string } | null;
};

type DashboardData = {
  summary: {
    lineCount: number;
    cmlCount: number;
    testPointCount: number;
    thicknessCount: number;
  };
  lines: LineRecord[];
};

type LineForm = {
  lineNumber: string;
  location: string;
  from: string;
  to: string;
  drawingNumber: string;
  service: string;
  material: string;
  inserviceDate: string;
  pipeSize: string;
  originalThickness: string;
  stress: string;
  jointEfficiency: string;
  ca: string;
  designLife: string;
  designPressure: string;
  operatingPressure: string;
  designTemperature: string;
  operatingTemperature: string;
};

const blankForm: LineForm = {
  lineNumber: "",
  location: "",
  from: "",
  to: "",
  drawingNumber: "",
  service: "",
  material: "",
  inserviceDate: "",
  pipeSize: "",
  originalThickness: "",
  stress: "",
  jointEfficiency: "1",
  ca: "",
  designLife: "",
  designPressure: "",
  operatingPressure: "",
  designTemperature: "",
  operatingTemperature: "",
};

const metrics = [
  { key: "lineCount", label: "PIPE LINES", color: "blue" },
  { key: "cmlCount", label: "CML LOCATIONS", color: "teal" },
  { key: "testPointCount", label: "TEST POINTS", color: "violet" },
  { key: "thicknessCount", label: "THICKNESS RECORDS", color: "amber" },
] as const;

const fields: { key: keyof LineForm; label: string; type?: string; step?: string }[] = [
  { key: "lineNumber", label: "Line Number" },
  { key: "location", label: "Location" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "drawingNumber", label: "Drawing Number" },
  { key: "service", label: "Service" },
  { key: "material", label: "Material" },
  { key: "inserviceDate", label: "In-service Date", type: "date" },
  { key: "pipeSize", label: "Pipe Size (in)", type: "number", step: "any" },
  { key: "originalThickness", label: "Original Thickness", type: "number", step: "any" },
  { key: "stress", label: "Stress", type: "number", step: "1" },
  { key: "jointEfficiency", label: "Joint Efficiency", type: "number", step: "1" },
  { key: "ca", label: "Corrosion Allowance (CA)", type: "number", step: "1" },
  { key: "designLife", label: "Design Life", type: "number", step: "1" },
  { key: "designPressure", label: "Design Pressure", type: "number", step: "1" },
  { key: "operatingPressure", label: "Operating Pressure", type: "number", step: "1" },
  { key: "designTemperature", label: "Design Temperature", type: "number", step: "1" },
  { key: "operatingTemperature", label: "Operating Temperature", type: "number", step: "any" },
];

export default function Home() {
  const [data, setData] = useState<DashboardData>({
    summary: { lineCount: 0, cmlCount: 0, testPointCount: 0, thicknessCount: 0 },
    lines: [],
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LineForm>(blankForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());

      const response = await fetch(`/api/dashboard?${params}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Unable to load dashboard data.");
      setData((await response.json()) as DashboardData);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => loadData(controller.signal), 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadData, refreshKey]);

  function openCreate() {
    setEditingId(null);
    setForm(blankForm);
    setFormError("");
    setNotice("");
    setFormOpen(true);
  }

  async function openEdit(id: string) {
    setNotice("");
    setFormError("");
    try {
      const response = await fetch(`/api/lines/${id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load line.");

      setEditingId(id);
      setForm({
        lineNumber: result.lineNumber ?? "",
        location: result.location ?? "",
        from: result.from ?? "",
        to: result.to ?? "",
        drawingNumber: result.drawingNumber ?? "",
        service: result.service ?? "",
        material: result.material ?? "",
        inserviceDate: result.inserviceDate ?? "",
        pipeSize: String(result.pipeSize ?? ""),
        originalThickness: String(result.originalThickness ?? ""),
        stress: String(result.stress ?? ""),
        jointEfficiency: String(result.jointEfficiency ?? "1"),
        ca: String(result.corrosionAllowance ?? ""),
        designLife: String(result.designLife ?? ""),
        designPressure: String(result.designPressure ?? ""),
        operatingPressure: String(result.operatingPressure ?? ""),
        designTemperature: String(result.designTemperature ?? ""),
        operatingTemperature: String(result.operatingTemperature ?? ""),
      });
      setFormOpen(true);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to load line.");
    }
  }

  async function saveLine(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const url = editingId ? `/api/lines/${editingId}` : "/api/lines";
      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Unable to save pipe line.");

      setFormOpen(false);
      setEditingId(null);
      setForm(blankForm);
      setNotice(editingId ? "Pipe line updated successfully." : "Pipe line created successfully.");
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to save pipe line.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLine(line: LineRecord) {
    const confirmed = window.confirm(
      `Delete pipe line "${line.lineNumber}"?\n\nThis action cannot be undone. Lines with CML records cannot be deleted.`,
    );
    if (!confirmed) return;

    setNotice("");
    try {
      const response = await fetch(`/api/lines/${line.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete pipe line.");

      setNotice(`Pipe line ${line.lineNumber} deleted.`);
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Unable to delete pipe line.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div><strong>AIHR</strong><span>ASSET INTEGRITY</span></div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <a className="nav-link active" href="#overview"><span>◈</span> Overview</a>
        <a className="nav-link" href="#lines"><span>▤</span> Pipe Lines</a>
        <a className="nav-link" href="#inspection"><span>◷</span> Inspection Data</a>
        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div><strong>LOCAL DATABASE</strong><span>PostgreSQL connected</span></div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> Overview</div>
          <div className="topbar-right">
            <LogoutButton />
            <span className="environment"><i /> DEVELOPMENT</span>
            <div className="avatar">AI</div>
          </div>
        </header>

        <div className="content">
          <section className="page-heading" id="overview">
            <div>
              <div className="eyebrow">ASSET INTEGRITY MANAGEMENT</div>
              <h1>Inspection Overview</h1>
              <p>Monitor piping assets and thickness inspection records.</p>
            </div>
            <div className="live-status"><i /> DATABASE ONLINE</div>
          </section>

          {notice && (
            <div className="crud-notice" role="status">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button>
            </div>
          )}

          <section className="metric-grid">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.key}>
                <div className="metric-top">
                  <span>{metric.label}</span>
                  <div className={`metric-icon ${metric.color}`}>▦</div>
                </div>
                <div className="metric-value">
                  {loading ? "—" : data.summary[metric.key].toLocaleString()}
                </div>
                <div className="metric-foot"><span className="tiny-dot" /> From connected database</div>
              </article>
            ))}
          </section>

          <section className="table-panel" id="lines">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">ASSET REGISTER</div>
                <h2>Pipe Line Register</h2>
                <p>Browse piping systems and their inspection coverage.</p>
              </div>
              <div className="crud-heading-actions">
                <div className="record-count">{data.lines.length} LINES</div>
                <button className="primary-button" type="button" onClick={openCreate}>+ Add Pipe Line</button>
              </div>
            </div>

            <div className="table-toolbar">
              <div className="search-box">
                <span>⌕</span>
                <input
                  aria-label="Search pipe lines"
                  placeholder="Search line number, location, service..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
              </div>
              <span className="sort-label">SORTED BY LINE NUMBER ↕</span>
            </div>

            {error && <div className="error-banner">{error}</div>}

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>LINE NUMBER</th><th>LOCATION</th><th>FROM</th><th>TO</th><th>SERVICE</th><th>MATERIAL</th>
                    <th>SIZE (IN)</th><th>CML</th><th>TEST POINTS</th><th>LAST THICKNESS</th><th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={11} className="empty-state">Loading inspection data...</td></tr>
                  ) : data.lines.length === 0 ? (
                    <tr><td colSpan={11} className="empty-state">No matching pipe lines found.</td></tr>
                  ) : data.lines.map((line) => (
                    <tr key={line.id}>
                      <td><Link className="line-code" href={`/lines/${line.id}`}>{line.lineNumber}</Link></td>
                      <td>{line.location}</td>
                       <td>{line.from}</td>
                       <td>{line.to}</td>
                      <td>{line.service}</td>
                      <td><span className="material-tag">{line.material}</span></td>
                      <td>{line.pipeSize.toLocaleString()}</td>
                      <td>{line.cmlCount}</td>
                      <td>{line.testPointCount}</td>
                      <td>
                        {line.latestInspection ? (
                          <div className="thickness-cell">
                            <strong>{line.latestInspection.thickness} mm</strong>
                            <span>{line.latestInspection.date}</span>
                          </div>
                        ) : <span className="muted">No records</span>}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button type="button" className="secondary-button" onClick={() => openEdit(line.id)}>Edit</button>
                          <button type="button" className="danger-button" onClick={() => deleteLine(line)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>Showing {data.lines.length} matching line(s)</span>
              <span>Source: PostgreSQL inspection database</span>
            </div>
          </section>

          <section className="bottom-grid" id="inspection">
            <article className="info-panel">
              <div className="eyebrow">INSPECTION WORKFLOW</div>
              <h2>Inspection data is available</h2>
              <p>Thickness records are connected to their test points and CML locations. The latest recorded thickness is shown for each line.</p>
              <div className="workflow-tags">
                <span>01 · Pipe line</span><b>›</b><span>02 · CML</span><b>›</b>
                <span>03 · Test point</span><b>›</b><span>04 · Thickness</span>
              </div>
            </article>
            <article className="info-panel calculation-panel">
              <div className="calculation-header">
                <span className="calculation-symbol">∑</span>
                <span className="pending-tag">READ-ONLY PREVIEW</span>
              </div>
              <h2>Thickness Calculations</h2>
              <p>Open a pipe line Detail page for the Actual OD, Structural, Design and Required Thickness calculation preview from Excel.</p>
              <div className="formula-note">Stored CML values are unchanged. Input units, Joint Efficiency scale and rounding still require confirmation. Unsupported inputs are not guessed.</div>
            </article>
          </section>

          <footer className="page-footer">
            <span>AIHR-DEV02 <span className="footer-separator">/</span> Piping Inspection</span>
            <span>LOCAL DEVELOPMENT ENVIRONMENT</span>
          </footer>
        </div>
      </section>

      {formOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setFormOpen(false);
        }}>
          <section className="crud-modal" role="dialog" aria-modal="true" aria-labelledby="crud-title">
            <div className="crud-modal-header">
              <div>
                <div className="eyebrow">ASSET REGISTER</div>
                <h2 id="crud-title">{editingId ? "Edit Pipe Line" : "Add Pipe Line"}</h2>
                <p>Enter all required piping information.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setFormOpen(false)} disabled={saving} aria-label="Close form">×</button>
            </div>

            <form onSubmit={saveLine}>
              <div className="crud-form-grid">
                {fields.map((field) => (
                  <label className="crud-field" key={field.key}>
                    <span>{field.label} <b>*</b></span>
                    <input
                      required
                      type={field.type || "text"}
                      step={field.step}
                      minLength={field.type ? undefined : 1}
                      value={form[field.key]}
                      onChange={(event) => setForm((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))}
                    />
                  </label>
                ))}
              </div>

              {formError && <div className="error-banner" role="alert">{formError}</div>}

              <div className="crud-modal-footer">
                <span>* Required fields</span>
                <div className="row-actions">
                  <button type="button" className="secondary-button" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Save Changes" : "Create Pipe Line"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { parseThicknessInput } from "@/lib/thickness-validation";
import { calculateExcelPreview } from "@/lib/excel-calculations";
import { authenticatedFetch as fetch } from "@/lib/authenticated-fetch";
import { LogoutButton } from "@/components/logout-button";

type Thickness = {
  id: string;
  date: string;
  actualThickness: string;
};

type TestPoint = {
  id: string;
  number: number;
  description: number;
  note: string | null;
  thicknesses: Thickness[];
};

type Cml = {
  id: string;
  cmlNumber: number;
  description: string;
  actualOutsideDiameter: number | null;
  designThickness: number | null;
  structuralThickness: number | null;
  requiredThickness: number | null;
  testPoints: TestPoint[];
};

type PipeLine = {
  id: string;
  lineNumber: string;
  location: string;
  from: string;
  to: string;
  drawingNumber: string;
  service: string;
  material: string;
  inserviceDate: string;
  pipeSize: number;
  originalThickness: number;
  stress: number;
  jointEfficiency: number;
  corrosionAllowance: number;
  designLife: number;
  designPressure: number;
  operatingPressure: number;
  designTemperature: number;
  operatingTemperature: string;
  cmls: Cml[];
};

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB");
}

export default function PipeLineDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [line, setLine] = useState<PipeLine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [cmlFormOpen, setCmlFormOpen] = useState(false);
  const [editingCmlId, setEditingCmlId] = useState<string | null>(null);
  const [cmlFormError, setCmlFormError] = useState("");
  const [cmlSaving, setCmlSaving] = useState(false);
  const [cmlNotice, setCmlNotice] = useState("");
  const [tpParent, setTpParent] = useState<Cml | null>(null);
  const [editingTpId, setEditingTpId] = useState<string | null>(null);
  const [tpForm, setTpForm] = useState({ tpNumber: "", tpDescription: "", note: "" });
  const [tpSaving, setTpSaving] = useState(false);
  const [tpFormError, setTpFormError] = useState("");
  const [tpNotice, setTpNotice] = useState("");
  const [deletingTpId, setDeletingTpId] = useState<string | null>(null);
  const [thicknessParent, setThicknessParent] = useState<{ point: TestPoint; cmlNumber: number } | null>(null);
  const [editingThicknessId, setEditingThicknessId] = useState<string | null>(null);
  const [thicknessForm, setThicknessForm] = useState({ inspectionDate: "", actualThickness: "" });
  const [thicknessSaving, setThicknessSaving] = useState(false);
  const [thicknessError, setThicknessError] = useState("");
  const [thicknessNotice, setThicknessNotice] = useState("");
  const [thicknessDelete, setThicknessDelete] = useState<{ point: TestPoint; item: Thickness; cmlNumber: number } | null>(null);
  const [cmlForm, setCmlForm] = useState({
    cmlNumber: "",
    cmlDescription: "",
    actualOutsideDiameter: "",
    designThickness: "",
    structuralThickness: "",
    requiredThickness: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadLine() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/lines/${id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load pipe line.");
        }

        if (!cancelled) setLine(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Something went wrong.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) loadLine();

    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  function openCreateCml() {
    const usedNumbers = new Set(line?.cmls.map((cml) => cml.cmlNumber));
    let suggestedNumber = 1;
    while (usedNumbers.has(suggestedNumber)) suggestedNumber++;
    setEditingCmlId(null);
    setCmlForm({
      cmlNumber: String(suggestedNumber),
      cmlDescription: "",
      actualOutsideDiameter: "",
      designThickness: "",
      structuralThickness: "",
      requiredThickness: "",
    });
    setCmlFormError("");
    setCmlNotice("");
    setCmlFormOpen(true);
  }

  function openEditCml(cml: Cml) {
    setEditingCmlId(cml.id);
    setCmlForm({
      cmlNumber: String(cml.cmlNumber),
      cmlDescription: cml.description,
      actualOutsideDiameter: cml.actualOutsideDiameter == null ? "" : String(cml.actualOutsideDiameter),
      designThickness: cml.designThickness == null ? "" : String(cml.designThickness),
      structuralThickness: cml.structuralThickness == null ? "" : String(cml.structuralThickness),
      requiredThickness: cml.requiredThickness == null ? "" : String(cml.requiredThickness),
    });
    setCmlFormError("");
    setCmlNotice("");
    setCmlFormOpen(true);
  }

  async function saveCml(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCmlSaving(true);
    setCmlFormError("");

    try {
      const url = editingCmlId
        ? `/api/cmls/${editingCmlId}`
        : `/api/lines/${id}/cmls`;

      const response = await fetch(url, {
        method: editingCmlId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmlNumber: Number(cmlForm.cmlNumber),
          cmlDescription: cmlForm.cmlDescription,
          actualOutsideDiameter: cmlForm.actualOutsideDiameter,
          designThickness: cmlForm.designThickness,
          structuralThickness: cmlForm.structuralThickness,
          requiredThickness: cmlForm.requiredThickness,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Unable to save CML.");
      }

      setCmlFormOpen(false);
      setCmlNotice(editingCmlId ? "CML updated successfully." : "CML created successfully.");
      setReloadKey((value) => value + 1);
    } catch (err) {
      setCmlFormError(err instanceof Error ? err.message : "Unable to save CML.");
    } finally {
      setCmlSaving(false);
    }
  }

  async function deleteCml(cml: Cml) {
    if (cml.testPoints.length > 0) {
      setCmlNotice("Cannot delete this CML because it has Test Points.");
      return;
    }

    if (!window.confirm(`Delete CML ${cml.cmlNumber}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/cmls/${cml.id}`, { method: "DELETE" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to delete CML.");
      }

      setCmlNotice(`CML ${cml.cmlNumber} deleted.`);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setCmlNotice(err instanceof Error ? err.message : "Unable to delete CML.");
    }
  }
  function openTestPoint(cml: Cml, point?: TestPoint) {
    setTpParent(cml);
    setEditingTpId(point?.id ?? null);
    setTpForm({
      tpNumber: point ? String(point.number) : "",
      tpDescription: point ? String(point.description) : "",
      note: point?.note ?? "",
    });
    setTpFormError("");
    setTpNotice("");
  }

  async function saveTestPoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tpParent) return;
    const tpNumber = Number(tpForm.tpNumber);
    const tpDescription = Number(tpForm.tpDescription);
    if (!tpForm.tpNumber.trim() || !tpForm.tpDescription.trim() ||
        !Number.isInteger(tpNumber) || !Number.isInteger(tpDescription)) {
      setTpFormError("TP Number and TP Description must be integers.");
      return;
    }
    setTpSaving(true);
    setTpFormError("");
    try {
      const response = await fetch(editingTpId ? `/api/test-points/${editingTpId}` : `/api/cmls/${tpParent.id}/test-points`, {
        method: editingTpId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tpNumber, tpDescription, note: tpForm.note || null }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save Test Point.");
      setTpParent(null);
      setTpNotice(editingTpId ? "Test Point updated successfully." : "Test Point created successfully.");
      setReloadKey((value) => value + 1);
    } catch (err) {
      setTpFormError(err instanceof Error ? err.message : "Unable to save Test Point.");
    } finally {
      setTpSaving(false);
    }
  }

  async function deleteTestPoint(point: TestPoint) {
    if (point.thicknesses.length > 0) {
      setTpNotice("Cannot delete this Test Point because it has Thickness records. Inspection history has been preserved.");
      return;
    }
    if (!window.confirm(`Delete TP ${point.number}? This cannot be undone.`)) return;
    setDeletingTpId(point.id);
    try {
      const response = await fetch(`/api/test-points/${point.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete Test Point.");
      setTpNotice(`TP ${point.number} deleted.`);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setTpNotice(err instanceof Error ? err.message : "Unable to delete Test Point.");
    } finally {
      setDeletingTpId(null);
    }
  }

  function openThickness(cml: Cml, point: TestPoint, item?: Thickness) {
    setThicknessParent({ point, cmlNumber: cml.cmlNumber });
    setEditingThicknessId(item?.id ?? null);
    setThicknessForm({ inspectionDate: item?.date ?? "", actualThickness: item?.actualThickness ?? "" });
    setThicknessError("");
    setThicknessNotice("");
  }

  async function saveThickness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thicknessParent) return;
    let input;
    try {
      input = parseThicknessInput(thicknessForm);
    } catch (err) {
      setThicknessError(err instanceof Error ? err.message : "Invalid Thickness.");
      return;
    }
    setThicknessSaving(true);
    setThicknessError("");
    try {
      const collection = `/api/test-points/${thicknessParent.point.id}/thicknesses`;
      const response = await fetch(editingThicknessId ? `${collection}/${editingThicknessId}` : collection, {
        method: editingThicknessId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save Thickness.");
      setThicknessParent(null);
      setThicknessNotice(editingThicknessId ? "Thickness updated successfully." : "Thickness created successfully.");
      setReloadKey((value) => value + 1);
    } catch (err) {
      setThicknessError(err instanceof Error ? err.message : "Unable to save Thickness.");
    } finally {
      setThicknessSaving(false);
    }
  }

  async function confirmThicknessDelete() {
    if (!thicknessDelete) return;
    setThicknessSaving(true);
    setThicknessError("");
    try {
      const response = await fetch(`/api/test-points/${thicknessDelete.point.id}/thicknesses/${thicknessDelete.item.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete Thickness.");
      setThicknessDelete(null);
      setThicknessNotice("Thickness deleted successfully.");
      setReloadKey((value) => value + 1);
    } catch (err) {
      setThicknessError(err instanceof Error ? err.message : "Unable to delete Thickness.");
    } finally {
      setThicknessSaving(false);
    }
  }

  if (loading) {
    return <main className="detail-page"><p>Loading pipe line...</p></main>;
  }

  if (error || !line) {
    return (
      <main className="detail-page">
        <Link href="/" className="back-link">← Back to Dashboard</Link>
        <section className="detail-panel">
          <h1>Unable to load pipe line</h1>
          <p>{error || "Pipe line not found."}</p>
        </section>
      </main>
    );
  }

  const calculation = calculateExcelPreview(line);
  const calculationItems = [
    ["Actual Outside Diameter (mm)", calculation.actualOutsideDiameter],
    ["Structural Thickness (mm)", calculation.structuralThickness],
    ["Design Thickness (mm)", calculation.designThickness],
    ["Required Thickness (mm)", calculation.requiredThickness],
  ] as const;

  const infoItems = [
    ["Location", line.location],
    ["From", line.from],
    ["To", line.to],
    ["Drawing Number", line.drawingNumber],
    ["Service", line.service],
    ["Material", line.material],
    ["In-service Date", formatDate(line.inserviceDate)],
    ["Pipe Size (inch)", line.pipeSize],
    ["Original Thickness", line.originalThickness],
    ["Stress", line.stress],
    ["Joint Efficiency", line.jointEfficiency],
    ["Corrosion Allowance", line.corrosionAllowance],
    ["Design Life", line.designLife],
    ["Design Pressure", line.designPressure],
    ["Operating Pressure", line.operatingPressure],
    ["Design Temperature", line.designTemperature],
    ["Operating Temperature", line.operatingTemperature],
  ];

  const cmlCount = line.cmls.length;
  const pointCount = line.cmls.reduce(
    (total, cml) => total + cml.testPoints.length,
    0,
  );
  const thicknessCount = line.cmls.reduce(
    (total, cml) =>
      total +
      cml.testPoints.reduce(
        (pointTotal, point) => pointTotal + point.thicknesses.length,
        0,
      ),
    0,
  );

  return (
    <main className="detail-page">
      <Link href="/" className="back-link">← Back to Dashboard</Link>

      <header className="detail-header">
        <div>
          <p className="eyebrow">PIPE LINE REGISTER / DETAIL</p>
          <h1>{line.lineNumber}</h1>
          <p className="detail-subtitle">
            {line.from || "-"} → {line.to || "-"}
          </p>
        </div>
        <div className="cml-heading-actions"><span className="detail-status">Inspection Data</span><LogoutButton /></div>
      </header>

      <section className="detail-stats">
        <article className="detail-stat">
          <span>CMLs</span>
          <strong>{cmlCount}</strong>
        </article>
        <article className="detail-stat">
          <span>Test Points</span>
          <strong>{pointCount}</strong>
        </article>
        <article className="detail-stat">
          <span>Thickness Records</span>
          <strong>{thicknessCount}</strong>
        </article>
      </section>

      <section className="detail-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GENERAL INFORMATION</p>
            <h2>Pipe Line Information</h2>
          </div>
        </div>

        <div className="info-grid">
          {infoItems.map(([label, value]) => (
            <div className="info-item" key={label}>
              <span>{label}</span>
              <strong>{formatValue(value as string | number)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EXCEL CALCULATION PREVIEW / READ ONLY</p>
            <h2>ผลคำนวณตาม Excel — ยังต้องยืนยันหน่วย input</h2>
          </div>
        </div>
        <p>ใช้ Pipe Size {line.pipeSize} inch, Design Pressure {line.designPressure}, Stress {line.stress}, Joint Efficiency {line.jointEfficiency} ตามค่าที่บันทึก โดยไม่แปลงหน่วยหรือ scale ที่เอกสารไม่ได้ระบุ</p>
        <p className="formula-note">Preview นี้ไม่บันทึกหรือเขียนทับค่า CML เดิม หน่วยผลลัพธ์ mm ตาม mockup ยังต้องยืนยันหน่วย Pressure/Stress และ scale ของ Joint Efficiency ก่อนใช้ทางวิศวกรรม</p>
        <div className="info-grid">
          {calculationItems.map(([label, item]) => (
            <div className="info-item" key={label}>
              <span>{label}</span>
              <strong>{item.status === "calculated" ? `${item.value} mm` : "คำนวณไม่ได้ / ต้องยืนยัน"}</strong>
              {item.status === "needs-confirmation" ? <p>{item.reason}</p>
                : item.representation === "fraction" ? <p>เศษส่วนที่แน่นอน — ไม่ปัดเป็นทศนิยม</p> : null}
            </div>
          ))}
        </div>
        <p>Design = (P × OD) / ((2 × S × E) + (2 × P × 0.4)); Required = MAX(Design, Structural) เมื่อทั้งสองค่าคำนวณได้</p>
        <p>ไม่มี interpolation, fallback หรือกฎปัดเศษ ขนาดที่ไม่อยู่ในตาราง/เงื่อนไขและตัวหารศูนย์ต้องขอคำยืนยัน</p>
      </section>

      <section className="detail-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CORROSION MONITORING</p>
            <h2>CML & Thickness History</h2>
          </div>
          <button type="button" className="cml-primary-button" onClick={openCreateCml}>
            + Add CML
          </button>
        </div>

        {tpNotice && <div className="cml-notice" role="status">
          <span>{tpNotice}</span>
          <button type="button" onClick={() => setTpNotice("")} aria-label="Dismiss Test Point message">×</button>
        </div>}

        {thicknessNotice && <div className="cml-notice" role="status">
          <span>{thicknessNotice}</span>
          <button type="button" onClick={() => setThicknessNotice("")} aria-label="Dismiss Thickness message">×</button>
        </div>}

        {line.cmls.length === 0 ? (
          <p className="empty-message">No CML data available.</p>
        ) : (
          line.cmls.map((cml) => (
            <article className="cml-card" key={cml.id}>
              <div className="cml-heading">
                <div>
                  <h3>CML {cml.cmlNumber}</h3>
                  <p>{cml.description || "No description"}</p>
                </div>
                <div className="cml-heading-actions">
                  <span>{cml.testPoints.length} Test Points</span>
                  <button type="button" className="cml-secondary-button" onClick={() => openEditCml(cml)}>
                    Edit
                  </button>
                  <button type="button" className="cml-danger-button" onClick={() => deleteCml(cml)}>
                    Delete
                  </button>
                </div>
              </div>

              <p>Stored CML values — ค่าที่บันทึกไว้ ไม่ถูกแทนที่ด้วย Preview</p>
              <div className="cml-metrics">
                <div>
                  <span>Outside Diameter (mm)</span>
                  <strong>{formatValue(cml.actualOutsideDiameter)}</strong>
                </div>
                <div>
                  <span>Design Thickness (mm)</span>
                  <strong>{formatValue(cml.designThickness)}</strong>
                </div>
                <div>
                  <span>Structural Thickness (mm)</span>
                  <strong>{formatValue(cml.structuralThickness)}</strong>
                </div>
                <div>
                  <span>Required Thickness (mm)</span>
                  <strong>{formatValue(cml.requiredThickness)}</strong>
                </div>
              </div>

              <div className="test-point-heading">
                <h4>Test Points</h4>
                <button type="button" className="cml-primary-button" onClick={() => openTestPoint(cml)}>+ Add TP</button>
              </div>
              {cml.testPoints.length === 0 ? (
                <p className="empty-message">No test points available.</p>
              ) : (
                cml.testPoints.map((point) => (
                  <div className="test-point" key={point.id}>
                    <div className="test-point-heading">
                      <div>
                        <strong>TP number: {point.number}</strong>
                        <span>TP description: {point.description}</span>
                        <span>Note: {formatValue(point.note)}</span>
                      </div>
                      <div className="cml-heading-actions">
                        <span>{point.thicknesses.length} Records</span>
                        <button type="button" className="cml-secondary-button" onClick={() => openTestPoint(cml, point)}>Edit TP</button>
                        <button type="button" className="cml-danger-button" disabled={deletingTpId !== null} onClick={() => deleteTestPoint(point)}>
                          {deletingTpId === point.id ? "Deleting..." : "Delete TP"}
                        </button>
                      </div>
                    </div>

                    <div className="test-point-heading">
                      <strong>Thickness History</strong>
                      <button type="button" className="cml-primary-button" onClick={() => openThickness(cml, point)}>+ Add Thickness</button>
                    </div>
                    {point.thicknesses.length === 0 ? (
                      <p className="empty-message">No thickness records.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="thickness-table">
                          <thead>
                            <tr>
                              <th>Inspection Date</th>
                              <th>Actual Thickness (mm)</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {point.thicknesses.map((item) => (
                              <tr key={item.id}>
                                <td>{formatDate(item.date)}</td>
                                <td>{item.actualThickness}</td>
                                <td><div className="cml-heading-actions">
                                  <button type="button" className="cml-secondary-button" onClick={() => openThickness(cml, point, item)}>Edit Thickness</button>
                                  <button type="button" className="cml-danger-button" onClick={() => {
                                    setThicknessDelete({ point, item, cmlNumber: cml.cmlNumber });
                                    setThicknessError("");
                                    setThicknessNotice("");
                                  }}>Delete Thickness</button>
                                </div></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              )}
            </article>
          ))
        )}
      </section>
          {cmlNotice && (
        <div className="cml-notice" role="status">
          <span>{cmlNotice}</span>
          <button type="button" onClick={() => setCmlNotice("")} aria-label="Dismiss message">×</button>
        </div>
      )}

      {thicknessParent && (
        <div className="cml-modal-backdrop">
          <section className="cml-modal" role="dialog" aria-modal="true" aria-labelledby="thickness-form-title">
            <div className="cml-modal-heading">
              <div>
                <p className="eyebrow">CML {thicknessParent.cmlNumber} · TP {thicknessParent.point.number}</p>
                <h2 id="thickness-form-title">{editingThicknessId ? "Edit Thickness" : "Add Thickness"}</h2>
              </div>
              <button type="button" className="cml-close-button" aria-label="Close Thickness form" disabled={thicknessSaving} onClick={() => setThicknessParent(null)}>×</button>
            </div>
            <form onSubmit={saveThickness}>
              <div className="cml-form-grid">
                <label>Inspection Date *
                  <input type="date" required disabled={thicknessSaving} value={thicknessForm.inspectionDate} onChange={(event) => setThicknessForm({ ...thicknessForm, inspectionDate: event.target.value })} />
                </label>
                <label>Actual Thickness (mm) *
                  <input type="text" inputMode="decimal" required disabled={thicknessSaving} value={thicknessForm.actualThickness} onChange={(event) => setThicknessForm({ ...thicknessForm, actualThickness: event.target.value })} />
                </label>
              </div>
              {thicknessError && <p className="cml-form-error" role="alert">{thicknessError}</p>}
              <div className="cml-modal-footer">
                <span>* Required fields</span>
                <div>
                  <button type="button" className="cml-secondary-button" disabled={thicknessSaving} onClick={() => setThicknessParent(null)}>Cancel</button>
                  <button type="submit" className="cml-primary-button" disabled={thicknessSaving}>{thicknessSaving ? "Saving..." : editingThicknessId ? "Save Thickness" : "Create Thickness"}</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {thicknessDelete && (
        <div className="cml-modal-backdrop">
          <section className="cml-modal" role="dialog" aria-modal="true" aria-labelledby="thickness-delete-title">
            <div className="cml-modal-heading"><div>
              <p className="eyebrow">CML {thicknessDelete.cmlNumber} · TP {thicknessDelete.point.number}</p>
              <h2 id="thickness-delete-title">Delete Thickness?</h2>
              <p>Inspection date: {thicknessDelete.item.date}</p>
              <p>Actual thickness: {thicknessDelete.item.actualThickness} mm</p>
              <p>This action cannot be undone.</p>
            </div></div>
            {thicknessError && <p className="cml-form-error" role="alert">{thicknessError}</p>}
            <div className="cml-modal-footer"><span>Confirm this inspection record.</span><div>
              <button type="button" className="cml-secondary-button" disabled={thicknessSaving} onClick={() => setThicknessDelete(null)}>Cancel</button>
              <button type="button" className="cml-danger-button" disabled={thicknessSaving} onClick={confirmThicknessDelete}>{thicknessSaving ? "Deleting..." : "Confirm Delete Thickness"}</button>
            </div></div>
          </section>
        </div>
      )}

      {tpParent && (
        <div className="cml-modal-backdrop">
          <section className="cml-modal" role="dialog" aria-modal="true" aria-labelledby="tp-form-title">
            <div className="cml-modal-heading">
              <div>
                <p className="eyebrow">CML {tpParent.cmlNumber} · TEST POINT</p>
                <h2 id="tp-form-title">{editingTpId ? "Edit Test Point" : "Add Test Point"}</h2>
              </div>
              <button type="button" className="cml-close-button" aria-label="Close Test Point form" disabled={tpSaving} onClick={() => setTpParent(null)}>×</button>
            </div>
            <form onSubmit={saveTestPoint}>
              <div className="cml-form-grid">
                <label>TP Number *
                  <input type="number" step="1" required value={tpForm.tpNumber} onChange={(event) => setTpForm({ ...tpForm, tpNumber: event.target.value })} />
                </label>
                <label>TP Description *
                  <input type="number" step="1" required value={tpForm.tpDescription} onChange={(event) => setTpForm({ ...tpForm, tpDescription: event.target.value })} />
                </label>
                <label className="cml-form-wide">Note
                  <input value={tpForm.note} onChange={(event) => setTpForm({ ...tpForm, note: event.target.value })} />
                </label>
              </div>
              {tpFormError && <p className="cml-form-error" role="alert">{tpFormError}</p>}
              <div className="cml-modal-footer">
                <span>* Required fields</span>
                <div>
                  <button type="button" className="cml-secondary-button" disabled={tpSaving} onClick={() => setTpParent(null)}>Cancel</button>
                  <button type="submit" className="cml-primary-button" disabled={tpSaving}>{tpSaving ? "Saving..." : editingTpId ? "Save Test Point" : "Create Test Point"}</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {cmlFormOpen && (
        <div className="cml-modal-backdrop">
          <section className="cml-modal" role="dialog" aria-modal="true" aria-labelledby="cml-form-title">
            <div className="cml-modal-heading">
              <div>
                <p className="eyebrow">CORROSION MONITORING</p>
                <h2 id="cml-form-title">{editingCmlId ? "Edit CML" : "Add CML"}</h2>
                <p>Blank optional thickness fields will be stored as null.</p>
              </div>
              <button type="button" className="cml-close-button" disabled={cmlSaving} onClick={() => setCmlFormOpen(false)}>×</button>
            </div>

            <form onSubmit={saveCml}>
              <div className="cml-form-grid">
                <label>
                  CML Number *
                  <input type="number" step="1" required value={cmlForm.cmlNumber}
                    onChange={(event) => setCmlForm({ ...cmlForm, cmlNumber: event.target.value })} />
                </label>
                <label className="cml-form-wide">
                  Description *
                  <input required value={cmlForm.cmlDescription}
                    onChange={(event) => setCmlForm({ ...cmlForm, cmlDescription: event.target.value })} />
                </label>
                <label>
                  Actual Outside Diameter (mm)
                  <input type="number" step="any" value={cmlForm.actualOutsideDiameter}
                    onChange={(event) => setCmlForm({ ...cmlForm, actualOutsideDiameter: event.target.value })} />
                </label>
                <label>
                  Design Thickness (mm)
                  <input type="number" step="any" value={cmlForm.designThickness}
                    onChange={(event) => setCmlForm({ ...cmlForm, designThickness: event.target.value })} />
                </label>
                <label>
                  Structural Thickness (mm)
                  <input type="number" step="any" value={cmlForm.structuralThickness}
                    onChange={(event) => setCmlForm({ ...cmlForm, structuralThickness: event.target.value })} />
                </label>
                <label>
                  Required Thickness (mm)
                  <input type="number" step="any" value={cmlForm.requiredThickness}
                    onChange={(event) => setCmlForm({ ...cmlForm, requiredThickness: event.target.value })} />
                </label>
              </div>

              {cmlFormError && <p className="cml-form-error" role="alert">{cmlFormError}</p>}

              <div className="cml-modal-footer">
                <span>* Required fields</span>
                <div>
                  <button type="button" className="cml-secondary-button" disabled={cmlSaving} onClick={() => setCmlFormOpen(false)}>Cancel</button>
                  <button type="submit" className="cml-primary-button" disabled={cmlSaving}>
                    {cmlSaving ? "Saving..." : editingCmlId ? "Save Changes" : "Create CML"}
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

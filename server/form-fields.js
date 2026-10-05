import { fail, text } from "./domain.js";
export function defineField(f, i) {
  if (
    ![
      "text",
      "textarea",
      "checkbox",
      "email",
      "number",
      "date",
      "select",
    ].includes(f.type)
  )
    fail("Choose a supported question type.");
  const field = {
    id: "q" + i,
    label: text(f.label, 160),
    type: f.type,
    required: f.required === true,
  };
  if (f.type === "select") {
    if (!Array.isArray(f.options) || !f.options.length || f.options.length > 30)
      fail("Select questions need 1–30 choices.");
    field.options = f.options.map((v) => text(v, 100));
    if (new Set(field.options).size !== field.options.length)
      fail("Choices must be unique.");
  }
  return field;
}
export function answerField(field, value) {
  if (field.type === "checkbox") {
    if (field.required && value !== true)
      fail(`Please confirm: ${field.label}`);
    return value === true;
  }
  if (value == null || value === "") {
    if (field.required) fail(`Please answer: ${field.label}`);
    return "";
  }
  if (!["string", "number"].includes(typeof value))
    fail("Invalid answer type.");
  const s = text(String(value), 2000);
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    fail(`Enter an email address: ${field.label}`);
  if (
    field.type === "number" &&
    (!/^-?\d+(\.\d+)?$/.test(s) || !Number.isFinite(Number(s)))
  )
    fail(`Enter a number: ${field.label}`);
  if (
    field.type === "date" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      !Number.isFinite(Date.parse(s)) ||
      new Date(s).toISOString().slice(0, 10) !== s)
  )
    fail(`Enter a valid date: ${field.label}`);
  if (field.type === "select" && !field.options.includes(s))
    fail(`Choose an available option: ${field.label}`);
  return s;
}
export function onboardingAction(db, u, action, b) {
  if (action === "waiver-approve") {
    if (u.role !== "admin") fail("Administrator access required.", 403);
    const f = db.forms.find((f) => f.id === b.id);
    if (!f) fail("Form not found.", 404);
    f.approval = {
      reference: text(b.reference, 500),
      approvedBy: u.id,
      approvedAt: new Date().toISOString(),
    };
    return;
  }
  const f = db.files.find((f) => f.id === b.id && f.purpose === "staff");
  if (!f || !(u.role === "admin" || f.ownerId === u.id))
    fail("Document access denied.", 403);
  const expiresOn = b.expiresOn || null;
  if (expiresOn) answerField({ type: "date", label: "Expiry date" }, expiresOn);
  f.retired = b.retired === true;
  f.documentTitle = text(b.title, 100);
  f.expiresOn = expiresOn;
  f.metadataUpdatedAt = new Date().toISOString();
  const p = db.staffProfiles.find((p) => p.userId === f.ownerId);
  if (p) {
    p.status = "Submitted";
    p.reviewNote = "Document metadata changed; review required.";
  }
}

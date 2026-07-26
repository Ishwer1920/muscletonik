import { body, validationResult } from "express-validator";
import { SiteSetting } from "../models/site-setting.model.js";
import { writeAudit } from "../utils/audit.js";

function validationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
}

export const settingValidators = [
  body("key").trim().isLength({ min: 2, max: 120 }).withMessage("Key is required."),
  body("category").optional().isString().withMessage("Category must be text."),
  body("value").exists().withMessage("Value is required.")
];

export async function listSettings(req, res, next) {
  try {
    const settings = await SiteSetting.find().sort({ category: 1, key: 1 }).lean();
    res.json({ settings });
  } catch (err) { next(err); }
}

export async function getSetting(req, res, next) {
  try {
    const setting = await SiteSetting.findOne({ key: req.params.key }).lean();
    if (!setting) return res.status(404).json({ message: "Setting not found" });
    res.json({ setting });
  } catch (err) { next(err); }
}

export async function upsertSetting(req, res, next) {
  try {
    if (validationErrors(req, res)) return;
    const key = String(req.body.key || req.params.key || "").trim();
    const category = String(req.body.category || "general").trim();
    const value = req.body.value;
    const before = await SiteSetting.findOne({ key }).lean();
    const setting = await SiteSetting.findOneAndUpdate(
      { key },
      { key, category, value, updatedBy: req.auth?.email || "" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await writeAudit(req, before ? "setting.update" : "setting.create", key, { before, after: setting });
    res.json({ message: "Setting saved.", setting });
  } catch (err) { next(err); }
}

export async function deleteSetting(req, res, next) {
  try {
    const setting = await SiteSetting.findOne({ key: req.params.key });
    if (!setting) return res.status(404).json({ message: "Setting not found" });
    await writeAudit(req, "setting.delete", setting.key, setting.toObject());
    await setting.deleteOne();
    res.json({ message: "Setting deleted." });
  } catch (err) { next(err); }
}

export async function publicSettings(req, res, next) {
  try {
    const settings = await SiteSetting.find().lean();
    const byKey = Object.fromEntries(settings.map(s => [s.key, s.value]));
    res.json({ settings: byKey });
  } catch (err) { next(err); }
}

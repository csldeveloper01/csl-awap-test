"""
Shared Section Directory Resolution Service for CSV, Coding JSON, and future imports.
Extracts, normalizes, matches, validates duplicates, and atomically applies admin
decisions ('map' | 'create' | 'skip') against AssessmentSection.
"""

import re
from typing import Any, Dict, List, Optional, Tuple
from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import AssessmentSection


def normalize_section_code(raw: str) -> str:
    """Normalizes a section identifier into an uppercase <=50 char code."""
    clean = (raw or "").strip().upper()
    if not clean:
        return ""
    return re.sub(r"[^A-Z0-9_]+", "_", clean).strip("_")[:50]


def normalize_section_key(raw: str) -> str:
    """Case-, punctuation-, and separator-insensitive key for fuzzy/exact directory matching."""
    if not raw:
        return ""
    text = str(raw).strip().lower()
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


class SectionDirectoryLookup:
    """In-memory lookup index of AssessmentSection records for fast import matching."""

    def __init__(self, include_inactive: bool = False):
        qs = AssessmentSection.objects.all()
        if not include_inactive:
            qs = qs.filter(is_active=True)
        self.sections: List[AssessmentSection] = list(qs.order_by("order", "name"))
        self.by_id: Dict[int, AssessmentSection] = {}
        self.by_code: Dict[str, AssessmentSection] = {}
        self.by_name_lower: Dict[str, AssessmentSection] = {}
        self.by_norm_key: Dict[str, AssessmentSection] = {}
        for sec in self.sections:
            self.register(sec)

    def register(self, sec: AssessmentSection) -> None:
        self.by_id[sec.id] = sec
        if sec.code:
            self.by_code[sec.code.strip().upper()] = sec
            self.by_norm_key.setdefault(normalize_section_key(sec.code), sec)
        if sec.name:
            self.by_name_lower[sec.name.strip().lower()] = sec
            self.by_norm_key.setdefault(normalize_section_key(sec.name), sec)
        if sec not in self.sections:
            self.sections.append(sec)

    def match(self, raw_section: str) -> Optional[AssessmentSection]:
        raw = (raw_section or "").strip()
        if not raw:
            return None
        code_upper = raw.upper()
        norm_code = normalize_section_code(raw)
        norm_key = normalize_section_key(raw)
        return (
            self.by_code.get(code_upper)
            or self.by_code.get(norm_code)
            or self.by_name_lower.get(raw.lower())
            or self.by_norm_key.get(norm_key)
        )


def parse_section_mapping(raw_mapping: Any) -> Dict[str, Any]:
    """Normalizes JSON/dict section_mapping into uppercase raw/code keys."""
    if isinstance(raw_mapping, str):
        import json
        try:
            raw_mapping = json.loads(raw_mapping)
        except Exception:
            raw_mapping = {}
    if not isinstance(raw_mapping, dict):
        return {}

    normalized: Dict[str, Any] = {}
    for key, val in raw_mapping.items():
        clean_key = str(key or "").strip().upper()
        if clean_key:
            normalized[clean_key] = val
        norm_code = normalize_section_code(str(key or ""))
        if norm_code and norm_code not in normalized:
            normalized[norm_code] = val
    return normalized


def inspect_sections_against_directory(
    raw_sections_list: List[str],
    default_code: str = "GENERAL",
) -> Dict[str, Any]:
    """
    Aggregates section occurrences from parsed import rows/items, normalizes identifiers,
    detects duplicates/aliases, and matches against the AssessmentSection directory.
    """
    lookup = SectionDirectoryLookup(include_inactive=False)
    # Also load inactive sections so duplicate code collisions can be flagged honestly
    all_sections_lookup = SectionDirectoryLookup(include_inactive=True)

    grouped: Dict[str, Dict[str, Any]] = {}
    for raw in raw_sections_list:
        raw_clean = (raw or "").strip() or default_code
        matched = lookup.match(raw_clean)
        canonical_code = matched.code.upper() if matched else (normalize_section_code(raw_clean) or default_code)
        norm_key = normalize_section_key(raw_clean)
        group_key = f"ID:{matched.id}" if matched else f"NEW:{canonical_code or norm_key}"

        if group_key not in grouped:
            inactive_match = None if matched else all_sections_lookup.match(raw_clean)
            suggested_name = matched.name if matched else (
                raw_clean if any(c.islower() for c in raw_clean) else raw_clean.replace("_", " ").title()
            )
            grouped[group_key] = {
                "raw_section": raw_clean,
                "raw_variants": [raw_clean],
                "detected_name": suggested_name,
                "code": canonical_code,
                "normalized_key": norm_key,
                "matched": bool(matched),
                "matched_section_id": matched.id if matched else None,
                "matched_section_name": matched.name if matched else None,
                "matched_section_code": matched.code if matched else None,
                "has_inactive_conflict": bool(inactive_match),
                "inactive_section_id": inactive_match.id if inactive_match else None,
                "count": 0,
                "row_count": 0,
            }
        else:
            if raw_clean not in grouped[group_key]["raw_variants"]:
                grouped[group_key]["raw_variants"].append(raw_clean)

        grouped[group_key]["count"] += 1
        grouped[group_key]["row_count"] += 1

    detected_sections = list(grouped.values())
    duplicate_variants = [
        {
            "canonical_code": entry["code"],
            "variants": entry["raw_variants"],
        }
        for entry in detected_sections
        if len(entry["raw_variants"]) > 1
    ]
    unmatched_count = sum(1 for entry in detected_sections if not entry["matched"])

    return {
        "detected_sections": detected_sections,
        "unmatched_sections_count": unmatched_count,
        "duplicate_section_variants": duplicate_variants,
        "available_sections": [
            {"id": s.id, "name": s.name, "code": s.code, "description": s.description, "order": s.order}
            for s in lookup.sections
        ],
    }


def _find_mapping_rule(sec_raw: str, normalized_mapping: Dict[str, Any]) -> Any:
    clean = (sec_raw or "").strip().upper()
    code = normalize_section_code(sec_raw)
    norm_key = normalize_section_key(sec_raw).upper()
    return (
        normalized_mapping.get(clean)
        or normalized_mapping.get(code)
        or normalized_mapping.get(norm_key)
    )


def validate_section_resolution_decisions(
    detected_sections: List[Dict[str, Any]],
    section_mapping: Any,
    require_explicit_for_unmatched: bool = False,
) -> Dict[str, str]:
    """
    Validates admin section_mapping decisions prior to commit.
    Prevents duplicate code/name creation or unapproved automatic creation when
    require_explicit_for_unmatched=True.
    Returns map of raw/code -> error string for any invalid entries.
    """
    normalized_mapping = parse_section_mapping(section_mapping)
    lookup = SectionDirectoryLookup(include_inactive=True)
    proposed_new_codes: Dict[str, str] = {}
    proposed_new_names: Dict[str, str] = {}
    errors: Dict[str, str] = {}

    for entry in detected_sections:
        raw_sec = entry.get("raw_section", "")
        code = entry.get("code", "")
        rule = _find_mapping_rule(raw_sec, normalized_mapping) or _find_mapping_rule(code, normalized_mapping)

        if not entry.get("matched") and rule is None:
            if require_explicit_for_unmatched:
                errors[code or raw_sec] = (
                    f"Unmatched section '{raw_sec}' requires an explicit decision "
                    "(map to existing, create new, or skip)."
                )
            continue

        if isinstance(rule, str):
            target = lookup.match(rule)
            if not target:
                errors[code or raw_sec] = f"Mapped target section '{rule}' does not exist."
            continue

        if isinstance(rule, dict):
            action = str(rule.get("action") or "").strip().lower()
            if action not in ("map", "create", "skip"):
                errors[code or raw_sec] = f"Invalid resolution action '{action}' for section '{raw_sec}'."
                continue

            if action == "map":
                target_id = rule.get("target_section_id") or rule.get("section_id")
                target_code = rule.get("target_section_code")
                target_sec = (
                    lookup.by_id.get(int(target_id)) if target_id else None
                ) or (lookup.match(str(target_code)) if target_code else None)
                if not target_sec:
                    errors[code or raw_sec] = f"Selected target section for '{raw_sec}' was not found."
            elif action == "create":
                target_name = str(rule.get("target_section_name") or rule.get("name") or entry.get("detected_name") or "").strip()
                target_code = normalize_section_code(
                    str(rule.get("target_section_code") or rule.get("code") or code)
                )
                if not target_name:
                    errors[code or raw_sec] = f"New section name is required when creating '{raw_sec}'."
                    continue
                if not target_code:
                    errors[code or raw_sec] = f"New section code is required when creating '{raw_sec}'."
                    continue
                if target_code in lookup.by_code:
                    existing = lookup.by_code[target_code]
                    if existing.name.strip().lower() != target_name.lower():
                        errors[code or raw_sec] = (
                            f"Section code '{target_code}' already exists in directory ('{existing.name}'). "
                            "Map to it or pick a unique code."
                        )
                        continue
                if target_name.lower() in lookup.by_name_lower:
                    existing = lookup.by_name_lower[target_name.lower()]
                    if existing.code.upper() != target_code:
                        errors[code or raw_sec] = (
                            f"Section name '{target_name}' already exists in directory (code '{existing.code}'). "
                            "Map to it or pick a unique name."
                        )
                        continue
                if target_code in proposed_new_codes and proposed_new_codes[target_code] != (code or raw_sec):
                    errors[code or raw_sec] = f"Duplicate new section code '{target_code}' in this import."
                    continue
                if target_name.lower() in proposed_new_names and proposed_new_names[target_name.lower()] != (code or raw_sec):
                    errors[code or raw_sec] = f"Duplicate new section name '{target_name}' in this import."
                    continue
                proposed_new_codes[target_code] = code or raw_sec
                proposed_new_names[target_name.lower()] = code or raw_sec

    return errors


def resolve_section_for_import_item(
    sec_raw: str,
    normalized_mapping: Dict[str, Any],
    lookup: SectionDirectoryLookup,
    fallback_section: Optional[AssessmentSection] = None,
    commit: bool = False,
    require_explicit_for_unmatched: bool = False,
) -> Tuple[Optional[AssessmentSection], bool]:
    """
    Resolves an AssessmentSection for a single imported question item inside a transaction.
    Returns (AssessmentSection | None, should_skip_item).
    """
    raw_clean = (sec_raw or "").strip()
    sec_code = normalize_section_code(raw_clean)
    sec_name = (
        raw_clean if any(c.islower() for c in raw_clean) else raw_clean.replace("_", " ").title()
    ) if raw_clean else "General"

    rule = _find_mapping_rule(raw_clean, normalized_mapping)
    if isinstance(rule, str):
        sec_obj = lookup.match(rule)
        if sec_obj:
            return sec_obj, False
    elif isinstance(rule, dict):
        action = str(rule.get("action") or "").strip().lower()
        if action == "skip":
            return None, True
        if action == "map":
            target_id = rule.get("target_section_id") or rule.get("section_id")
            target_code = rule.get("target_section_code")
            sec_obj = None
            if target_id:
                try:
                    sec_obj = lookup.by_id.get(int(target_id)) or AssessmentSection.objects.filter(id=int(target_id)).first()
                except (TypeError, ValueError):
                    sec_obj = None
            if not sec_obj and target_code:
                sec_obj = lookup.match(str(target_code))
            if not sec_obj:
                raise ValidationError({"section_mapping": f"Mapped target section for '{raw_clean}' does not exist."})
            lookup.register(sec_obj)
            return sec_obj, False
        if action == "create":
            target_name = str(rule.get("target_section_name") or rule.get("name") or sec_name).strip()
            target_code = normalize_section_code(str(rule.get("target_section_code") or rule.get("code") or sec_code))
            description = str(rule.get("description") or "").strip()
            try:
                order = max(0, int(rule.get("display_order") if rule.get("display_order") is not None else (rule.get("order") or 0)))
            except (TypeError, ValueError):
                order = 0
            existing = lookup.by_code.get(target_code) or lookup.by_name_lower.get(target_name.lower())
            if existing:
                if not existing.is_active:
                    if existing.code.upper() == target_code and existing.name.strip().lower() != target_name.lower():
                        raise ValidationError({"section_mapping": f"Section code '{target_code}' conflicts with existing section '{existing.name}'."})
                    existing.is_active = True
                    if commit:
                        existing.save(update_fields=["is_active"])
                lookup.register(existing)
                return existing, False
            if commit:
                if not target_code or not target_name:
                    raise ValidationError({"section_mapping": f"Valid section name and code are required to create '{raw_clean}'."})
                with transaction.atomic():
                    sec_obj, _ = AssessmentSection.objects.get_or_create(
                        code=target_code,
                        defaults={
                            "name": target_name,
                            "description": description,
                            "order": order,
                            "is_active": True,
                        },
                    )
                lookup.register(sec_obj)
                return sec_obj, False
            return None, False

    matched = lookup.match(raw_clean)
    if matched:
        return matched, False

    if require_explicit_for_unmatched:
        raise ValidationError(
            {
                "section_mapping": (
                    f"Unmatched section '{raw_clean}' requires explicit admin approval "
                    "(create new section, map to existing directory entry, or skip)."
                )
            }
        )

    if commit and sec_code:
        sec_obj, _ = AssessmentSection.objects.get_or_create(
            code=sec_code,
            defaults={"name": sec_name, "is_active": True},
        )
        lookup.register(sec_obj)
        return sec_obj, False

    return fallback_section, False

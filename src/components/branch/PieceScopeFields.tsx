"use client";

import { Check } from "lucide-react";
import type { Gender } from "@/types/database";

/**
 * Department and gender pickers for a uniform piece.
 *
 * Pieces are shared: a white shirt may serve several departments and both genders. Used by
 * both the create form and the edit modal so the two cannot drift apart.
 */

type Department = { id: string; name: string };

export type PieceScopeValue = {
  departmentIds: string[];
  allDepartments: boolean;
  genders: Gender[];
};

const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

function chipStyle(active: boolean, muted = false): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.45rem 0.8rem",
    borderRadius: "var(--radius-full)",
    border: `1px solid ${active ? "var(--color-primary-dark)" : "var(--color-border)"}`,
    background: active ? "var(--color-primary-light)" : "var(--color-bg-elevated)",
    color: active ? "var(--color-primary-dark)" : "var(--color-text-secondary)",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    opacity: muted ? 0.55 : 1,
    transition: "background 120ms, border-color 120ms, opacity 120ms",
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
  display: "block",
  marginBottom: "0.35rem",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--color-text-muted)",
  margin: "0.4rem 0 0",
};

const groupStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.4rem" };

function Chip({
  active,
  muted,
  onClick,
  children,
}: {
  active: boolean;
  muted?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={chipStyle(active, muted)}>
      {active && <Check size={13} />}
      {children}
    </button>
  );
}

/**
 * Department picker on its own — shared by pieces and looks.
 *
 * For looks this is what avoids paying to re-render the same outfit per department.
 */
export function DepartmentChips({
  departments,
  departmentIds,
  allDepartments,
  onChange,
  label = "Departments",
  hint,
}: {
  departments: Department[];
  departmentIds: string[];
  allDepartments: boolean;
  onChange: (next: { departmentIds: string[]; allDepartments: boolean }) => void;
  label?: string;
  hint?: string;
}) {
  const toggle = (id: string) => {
    onChange({
      allDepartments,
      departmentIds: departmentIds.includes(id)
        ? departmentIds.filter((existing) => existing !== id)
        : [...departmentIds, id],
    });
  };

  return (
    <div>
      <label style={labelStyle}>
        {label} <span style={{ color: "var(--color-error)" }}>*</span>
      </label>
      <div style={groupStyle}>
        <Chip
          active={allDepartments}
          onClick={() => onChange({ departmentIds, allDepartments: !allDepartments })}
        >
          All departments
        </Chip>
        {departments.map((department) => (
          <Chip
            key={department.id}
            active={departmentIds.includes(department.id)}
            // Individual picks stay selectable while "all" is on, so unticking it
            // falls back to what was chosen rather than to nothing.
            muted={allDepartments}
            onClick={() => toggle(department.id)}
          >
            {department.name}
          </Chip>
        ))}
      </div>
      <p style={hintStyle}>
        {allDepartments
          ? "Applies to every department, including any added later."
          : hint ?? "Pick every department that uses this piece."}
      </p>
    </div>
  );
}

export function PieceScopeFields({
  departments,
  value,
  onChange,
}: {
  departments: Department[];
  value: PieceScopeValue;
  onChange: (next: PieceScopeValue) => void;
}) {
  const { departmentIds, allDepartments, genders } = value;
  const allGenders = genders.length === GENDER_OPTIONS.length;

  const toggleGender = (gender: Gender) => {
    onChange({
      ...value,
      genders: genders.includes(gender)
        ? genders.filter((existing) => existing !== gender)
        : [...genders, gender],
    });
  };

  return (
    <>
      <div>
        <label style={labelStyle}>
          Gender <span style={{ color: "var(--color-error)" }}>*</span>
        </label>
        <div style={groupStyle}>
          <Chip
            active={allGenders}
            onClick={() => onChange({ ...value, genders: allGenders ? [] : GENDER_OPTIONS.map((o) => o.value) })}
          >
            All
          </Chip>
          {GENDER_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={genders.includes(option.value)}
              onClick={() => toggleGender(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
        <p style={hintStyle}>Pick both for a unisex piece.</p>
      </div>

      <DepartmentChips
        departments={departments}
        departmentIds={departmentIds}
        allDepartments={allDepartments}
        onChange={(next) => onChange({ ...value, ...next })}
      />
    </>
  );
}

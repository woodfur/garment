"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  History,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import type { Gender, InventoryAssignmentStatus } from "@/types/database";

type Tab = "items" | "assignments" | "history" | "categories" | "members";
type Department = { id: string; name: string };
type Schedule = { id: string; service_date: string; title: string };
type Member = { id: string; person_id: string; name: string; gender: Gender; created_at: string };
type Person = { id: string; name: string; gender: Gender };
type Category = { id: string; name: string; created_at: string };
type InventoryItem = {
  id: string;
  category_id: string;
  category_name?: string;
  name: string;
  quantity: number;
  assigned_quantity: number;
  available_quantity: number;
  image_url: string | null;
  storage_path: string | null;
  bg_removed: boolean;
  is_archived: boolean;
  _bgRemoving?: boolean;
  _bgError?: string;
};
type AssignmentLine = {
  id: string;
  inventory_item_id: string;
  quantity: number;
  status: InventoryAssignmentStatus;
  returned_at: string | null;
  was_overdue: boolean;
  is_overdue?: boolean;
  notes: string | null;
  item: { id: string; name: string; image_url: string | null; category?: { name: string } | null } | null;
};
type InventoryAssignment = {
  id: string;
  schedule: Schedule | null;
  department: Department | null;
  person: Person | null;
  items: AssignmentLine[];
  created_at: string;
};
type HistoryEvent = {
  id: string;
  event_type: string;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason: string | null;
  created_at: string;
  item: { name: string } | null;
  assignment_item: {
    assignment: {
      schedule: Schedule | null;
      department: Department | null;
      person: Person | null;
    } | null;
  } | null;
};
type Selection = { inventory_item_id: string; quantity: number };

const STATUS_LABELS: Record<InventoryAssignmentStatus, string> = {
  assigned: "Assigned",
  returned: "Returned",
  damaged: "Damaged",
  destroyed: "Destroyed",
  missing: "Missing",
};

function dateLabel(value: string | undefined): string {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function statusColor(status: InventoryAssignmentStatus, overdue?: boolean): string {
  if (overdue) return "var(--color-error)";
  if (status === "assigned") return "var(--color-primary)";
  if (status === "returned") return "var(--color-sage)";
  return "var(--color-warning)";
}

export default function InventoryPageClient() {
  const [tab, setTab] = useState<Tab>("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [assignments, setAssignments] = useState<InventoryAssignment[]>([]);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersByDepartment, setMembersByDepartment] = useState<Record<string, Member[]>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showItemForm, setShowItemForm] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [itemPreview, setItemPreview] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [categorySuccess, setCategorySuccess] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedItems, setSelectedItems] = useState<Selection[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberGender, setNewMemberGender] = useState<Gender>("male");
  const [useExistingPerson, setUseExistingPerson] = useState(false);
  const [existingPersonId, setExistingPersonId] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [memberDepartmentIds, setMemberDepartmentIds] = useState<string[]>([]);
  const [memberTabName, setMemberTabName] = useState("");
  const [memberTabGender, setMemberTabGender] = useState<Gender>("male");
  const [memberTabUseExisting, setMemberTabUseExisting] = useState(false);
  const [memberTabExistingPersonId, setMemberTabExistingPersonId] = useState("");
  const [savingMemberTab, setSavingMemberTab] = useState(false);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    const res = await fetch("/api/branch/inventory/items?include_archived=false");
    const data = await res.json();
    if (res.ok) setItems(Array.isArray(data) ? data : []);
  }, []);

  const loadAssignments = useCallback(async () => {
    const res = await fetch("/api/branch/inventory/assignments");
    const data = await res.json();
    if (res.ok) setAssignments(Array.isArray(data) ? data : []);
  }, []);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/branch/inventory/history");
    const data = await res.json();
    if (res.ok) setHistory(Array.isArray(data) ? data : []);
  }, []);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, catRes, deptRes, scheduleRes, assignmentRes, historyRes] = await Promise.all([
        fetch("/api/branch/inventory/items?include_archived=false"),
        fetch("/api/branch/inventory/categories"),
        fetch("/api/branch/departments"),
        fetch("/api/branch/schedules"),
        fetch("/api/branch/inventory/assignments"),
        fetch("/api/branch/inventory/history"),
      ]);
      const [itemData, categoryData, deptData, scheduleData, assignmentData, historyData] = await Promise.all([
        itemsRes.json(), catRes.json(), deptRes.json(), scheduleRes.json(), assignmentRes.json(), historyRes.json(),
      ]);
      setItems(Array.isArray(itemData) ? itemData : []);
      setCategories(Array.isArray(categoryData) ? categoryData : []);
      setDepartments(Array.isArray(deptData) ? deptData : []);
      if (Array.isArray(deptData) && deptData[0]) setMemberDepartmentIds((current) => current.length > 0 ? current : [deptData[0].id]);
      setSchedules(Array.isArray(scheduleData) ? scheduleData : []);
      setAssignments(Array.isArray(assignmentData) ? assignmentData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
      if (Array.isArray(categoryData) && categoryData[0]) setItemCategoryId((current) => current || categoryData[0].id);
    } catch {
      setError("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    if (!selectedDepartmentId) { setMembers([]); return; }
    fetch(`/api/branch/departments/${selectedDepartmentId}/members`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setMembers(list);
        setMembersByDepartment((prev) => ({ ...prev, [selectedDepartmentId]: list }));
      })
      .catch(() => setMembers([]));
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (departments.length === 0) { setMembersByDepartment({}); return; }
    let cancelled = false;
    Promise.all(departments.map(async (department) => {
      try {
        const res = await fetch(`/api/branch/departments/${department.id}/members`);
        const data = await res.json();
        return [department.id, Array.isArray(data) ? data : []] as const;
      } catch {
        return [department.id, []] as const;
      }
    })).then((entries) => {
      if (!cancelled) setMembersByDepartment(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [departments]);

  useEffect(() => {
    fetch("/api/branch/inventory/people")
      .then((res) => res.json())
      .then((data) => setPeople(Array.isArray(data) ? data : []))
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    if (!categorySuccess) return;
    const timer = window.setTimeout(() => setCategorySuccess(null), 3500);
    return () => window.clearTimeout(timer);
  }, [categorySuccess]);

  useEffect(() => {
    if (!memberSuccess) return;
    const timer = window.setTimeout(() => setMemberSuccess(null), 3500);
    return () => window.clearTimeout(timer);
  }, [memberSuccess]);

  useEffect(() => {
    setSelectedPersonId("");
    setSelectedItems([]);
    setSuggestions([]);
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (!selectedScheduleId || !selectedDepartmentId || !selectedPersonId) {
      setSuggestions([]);
      return;
    }
    const params = new URLSearchParams({
      schedule_id: selectedScheduleId,
      department_id: selectedDepartmentId,
      person_id: selectedPersonId,
    });
    fetch(`/api/branch/inventory/assignments/suggestions?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setSuggestions(Array.isArray(data) ? data : []))
      .catch(() => setSuggestions([]));
  }, [selectedScheduleId, selectedDepartmentId, selectedPersonId]);

  const assignedLines = useMemo(
    () => assignments.flatMap((assignment) => assignment.items.map((line) => ({ assignment, line }))),
    [assignments]
  );
  const openLines = assignedLines.filter(({ line }) => line.status === "assigned");
  const upcomingSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.service_date >= todayString()),
    [schedules]
  );

  useEffect(() => {
    if (selectedScheduleId || upcomingSchedules.length === 0) return;
    setSelectedScheduleId(upcomingSchedules[0].id);
  }, [selectedScheduleId, upcomingSchedules]);

  function resetItemForm() {
    setShowItemForm(false);
    setItemName("");
    setItemQuantity(1);
    setItemFile(null);
    setItemPreview(null);
    setItemError(null);
  }

  async function createCategory() {
    if (!categoryName.trim()) return;
    setSavingCategory(true);
    setCategorySuccess(null);
    setCategoryError(null);
    const res = await fetch("/api/branch/inventory/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: categoryName.trim() }),
    });
    const data = await res.json();
    setSavingCategory(false);
    if (res.ok) {
      setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setItemCategoryId(data.id);
      setCategorySuccess(`${data.name} category created`);
      setCategoryName("");
    } else {
      setCategoryError(data.error ?? "Failed to create category");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setItemFile(file);
    setItemPreview(URL.createObjectURL(file));
    setItemError(null);
  }

  async function triggerBgRemoval(itemId: string, storagePath: string) {
    setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, _bgRemoving: true } : item));
    try {
      const res = await fetch("/api/branch/inventory/items/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, storagePath }),
      });
      const data = await res.json();
      setItems((prev) => prev.map((item) => item.id === itemId
        ? {
            ...item,
            image_url: res.ok && data.image_url ? data.image_url : item.image_url,
            bg_removed: res.ok && data.bg_removed ? true : item.bg_removed,
            _bgRemoving: false,
            _bgError: res.ok ? undefined : data.error ?? "Background removal failed",
          }
        : item
      ));
    } catch {
      setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, _bgRemoving: false, _bgError: "Background removal failed" } : item));
    }
  }

  async function createItem() {
    if (!itemName.trim()) { setItemError("Item name is required"); return; }
    if (!itemCategoryId) { setItemError("Category is required"); return; }
    if (!Number.isInteger(itemQuantity) || itemQuantity < 0) { setItemError("Quantity must be a whole number"); return; }
    if (!itemFile) { setItemError("Item image is required"); return; }

    setSavingItem(true);
    setItemError(null);
    try {
      const ext = itemFile.name.split(".").pop() ?? "jpg";
      const storagePath = `items/${Date.now()}.${ext}`;
      const uploadRes = await fetch("/api/branch/inventory/items/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: storagePath, contentType: itemFile.type }),
      });
      if (!uploadRes.ok) { setItemError("Image upload service unavailable"); setSavingItem(false); return; }
      const { uploadUrl, publicUrl } = await uploadRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", body: itemFile, headers: { "Content-Type": itemFile.type } });
      if (!putRes.ok) { setItemError("Image upload failed"); setSavingItem(false); return; }

      const createRes = await fetch("/api/branch/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: itemName.trim(),
          category_id: itemCategoryId,
          quantity: itemQuantity,
          image_url: publicUrl,
          raw_image_url: publicUrl,
          storage_path: storagePath,
          bg_removed: false,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) { setItemError(created.error ?? "Failed to save item"); setSavingItem(false); return; }

      setItems((prev) => [{ ...created, category_name: categories.find((c) => c.id === itemCategoryId)?.name, _bgRemoving: true }, ...prev]);
      resetItemForm();
      setSavingItem(false);
      triggerBgRemoval(created.id, storagePath);
      loadHistory();
    } catch {
      setItemError("Failed to create item");
      setSavingItem(false);
    }
  }

  async function archiveItem(itemId: string) {
    const res = await fetch(`/api/branch/inventory/items/${itemId}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  async function adjustQuantity(item: InventoryItem) {
    const value = window.prompt(`New quantity for ${item.name}`, String(item.quantity));
    if (value === null) return;
    const newQuantity = Number(value);
    if (!Number.isInteger(newQuantity) || newQuantity < 0) return;
    const reason = window.prompt("Reason for adjustment", "Manual count update");
    if (!reason?.trim()) return;

    const res = await fetch(`/api/branch/inventory/items/${item.id}/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newQuantity, reason: reason.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, quantity: data.quantity, available_quantity: Math.max(0, data.quantity - row.assigned_quantity) } : row));
      loadHistory();
    } else {
      window.alert(data.error ?? "Failed to adjust quantity");
    }
  }

  function toggleSelection(itemId: string) {
    setSelectedItems((prev) =>
      prev.some((item) => item.inventory_item_id === itemId)
        ? prev.filter((item) => item.inventory_item_id !== itemId)
        : [...prev, { inventory_item_id: itemId, quantity: 1 }]
    );
  }

  function setSelectionQuantity(itemId: string, quantity: number) {
    setSelectedItems((prev) => prev.map((item) => item.inventory_item_id === itemId ? { ...item, quantity } : item));
  }

  function addMemberLocally(departmentId: string, member: Member) {
    const merge = (list: Member[]) => (
      [...list.filter((item) => item.person_id !== member.person_id), member]
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setMembersByDepartment((prev) => ({ ...prev, [departmentId]: merge(prev[departmentId] ?? []) }));
    if (selectedDepartmentId === departmentId) setMembers((prev) => merge(prev));
    setPeople((prev) => (
      prev.some((person) => person.id === member.person_id)
        ? prev
        : [...prev, { id: member.person_id, name: member.name, gender: member.gender }].sort((a, b) => a.name.localeCompare(b.name))
    ));
  }

  function removeMemberLocally(departmentId: string, membershipId: string) {
    const remove = (list: Member[]) => list.filter((member) => member.id !== membershipId);
    const removed = membersByDepartment[departmentId]?.find((member) => member.id === membershipId);
    setMembersByDepartment((prev) => ({ ...prev, [departmentId]: remove(prev[departmentId] ?? []) }));
    if (selectedDepartmentId === departmentId) setMembers((prev) => remove(prev));
    if (removed && selectedDepartmentId === departmentId && selectedPersonId === removed.person_id) {
      setSelectedPersonId("");
      setSelectedItems([]);
      setSuggestions([]);
    }
  }

  async function createOrLinkMember({
    departmentId,
    useExisting,
    personId,
    name,
    gender,
  }: {
    departmentId: string;
    useExisting: boolean;
    personId?: string;
    name?: string;
    gender?: Gender;
  }): Promise<Member> {
    const body = useExisting
      ? { department_id: departmentId, person_id: personId }
      : { name: name?.trim(), gender };
    const url = useExisting
      ? "/api/branch/inventory/department-memberships"
      : `/api/branch/departments/${departmentId}/members`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save member");
    addMemberLocally(departmentId, data);
    return data;
  }

  async function saveMember() {
    if (!selectedDepartmentId) return;
    setSavingMember(true);
    try {
      const member = await createOrLinkMember({
        departmentId: selectedDepartmentId,
        useExisting: useExistingPerson,
        personId: existingPersonId,
        name: newMemberName,
        gender: newMemberGender,
      });
      setSelectedPersonId(member.person_id);
      setNewMemberName("");
      setExistingPersonId("");
      setUseExistingPerson(false);
    } catch {
      // The compact assignment form keeps errors out of the main flow; the Members tab
      // shows detailed feedback for roster maintenance.
    } finally {
      setSavingMember(false);
    }
  }

  async function saveMemberFromTab() {
    if (memberDepartmentIds.length === 0) return;
    setSavingMemberTab(true);
    setMemberSuccess(null);
    setMemberError(null);
    try {
      let personId = memberTabExistingPersonId;
      let savedName = memberTabName.trim();

      for (const [index, departmentId] of memberDepartmentIds.entries()) {
        const member = await createOrLinkMember({
          departmentId,
          useExisting: memberTabUseExisting || index > 0,
          personId,
          name: memberTabName,
          gender: memberTabGender,
        });
        personId = member.person_id;
        savedName = member.name;
      }

      setMemberSuccess(`${savedName} added to ${memberDepartmentIds.length} ${memberDepartmentIds.length === 1 ? "department" : "departments"}`);
      setMemberTabName("");
      setMemberTabExistingPersonId("");
      setMemberTabUseExisting(false);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to save member");
    } finally {
      setSavingMemberTab(false);
    }
  }

  async function deleteMemberFromDepartment(departmentId: string, member: Member) {
    const departmentName = departments.find((department) => department.id === departmentId)?.name ?? "this department";
    if (!window.confirm(`Remove ${member.name} from ${departmentName}?`)) return;

    setDeletingMemberId(member.id);
    setMemberSuccess(null);
    setMemberError(null);
    const res = await fetch(`/api/branch/departments/${departmentId}/members/${member.id}`, { method: "DELETE" });
    setDeletingMemberId(null);
    if (res.ok) {
      removeMemberLocally(departmentId, member.id);
      setMemberSuccess(`${member.name} removed from ${departmentName}`);
      return;
    }
    const data = await res.json().catch(() => ({}));
    setMemberError(data.error ?? "Failed to remove member");
  }

  async function createAssignment() {
    if (!selectedScheduleId || !selectedDepartmentId || !selectedPersonId || selectedItems.length === 0) return;
    setAssigning(true);
    setAssignmentError(null);
    const res = await fetch("/api/branch/inventory/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_id: selectedScheduleId,
        department_id: selectedDepartmentId,
        person_id: selectedPersonId,
        items: selectedItems,
      }),
    });
    const data = await res.json();
    setAssigning(false);
    if (!res.ok) {
      setAssignmentError(data.error ?? "Failed to assign items");
      return;
    }
    setSelectedItems([]);
    await Promise.all([loadItems(), loadAssignments(), loadHistory()]);
  }

  async function resolveLine(lineId: string, status: Exclude<InventoryAssignmentStatus, "assigned">) {
    const res = await fetch(`/api/branch/inventory/assignments/items/${lineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await Promise.all([loadItems(), loadAssignments(), loadHistory()]);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "0.65rem 0.875rem",
    fontSize: "0.875rem",
    outline: "none",
    background: "var(--color-bg-elevated)",
  };

  if (loading) return null;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div className="dash-mast">
        <div>
          <div className="eyebrow eyebrow-accent">Inventory</div>
          <div className="ttl">Items &amp; Assignment</div>
        </div>
        <div className="issue">
          <b>{items.length} items · {openLines.length} out</b><br />
          Church-wide accessories and returns
        </div>
      </div>

      <div className="ward-head">
        <div className="ward-toggle">
          <button className={tab === "items" ? "on" : ""} onClick={() => setTab("items")}>Items</button>
          <button className={tab === "assignments" ? "on" : ""} onClick={() => setTab("assignments")}>Assignments</button>
          <button className={tab === "categories" ? "on" : ""} onClick={() => setTab("categories")}>Categories</button>
          <button className={tab === "members" ? "on" : ""} onClick={() => setTab("members")}>Members</button>
          <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>History</button>
        </div>
        {tab === "items" && (
          <button className="btn-primary" style={{ padding: "0.65rem 1.2rem", fontSize: "0.85rem" }} onClick={() => setShowItemForm(true)}>
            <Plus size={15} /> Add item
          </button>
        )}
      </div>

      {error && (
        <div className="builder-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {tab === "items" && (
        <section>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
              <Package size={34} color="var(--color-text-faint)" />
              <h2 className="display-serif" style={{ fontSize: "1.5rem", margin: "0.75rem 0 0.4rem" }}>No inventory items yet</h2>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Create a category, then add the first accessory.</p>
            </div>
          ) : (
            <div className="ward-gallery">
              {items.map((item) => (
                <article key={item.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ height: 170, background: item.bg_removed ? "repeating-conic-gradient(#e9e3d7 0% 25%, #fbf9f4 0% 50%) 0 0 / 20px 20px" : "var(--color-bg-elevated)", position: "relative", display: "grid", placeItems: "center" }}>
                    {item.image_url ? (
                      <Image src={item.image_url} alt={item.name} fill style={{ objectFit: "contain", padding: "0.65rem" }} unoptimized />
                    ) : (
                      <Package size={42} color="var(--color-text-disabled)" />
                    )}
                    {item._bgRemoving && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(33,28,25,0.45)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: "0.75rem" }}>
                        <span><Loader2 size={18} className="animate-spin" /> Removing bg...</span>
                      </div>
                    )}
                    {item._bgError && <span style={{ position: "absolute", left: 8, right: 8, bottom: 8, background: "var(--color-error-bg)", color: "var(--color-error)", padding: "0.3rem 0.45rem", borderRadius: "var(--radius-md)", fontSize: "0.68rem", fontWeight: 700 }}>{item._bgError}</span>}
                  </div>
                  <div style={{ padding: "0.875rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.3rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: "0.76rem", marginBottom: "0.7rem" }}>{item.category_name ?? "Uncategorised"}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.45rem", marginBottom: "0.8rem" }}>
                      <StockBox label="Total" value={item.quantity} />
                      <StockBox label="Out" value={item.assigned_quantity} />
                      <StockBox label="Ready" value={item.available_quantity} />
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button className="btn-back" style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.45rem", fontSize: "0.75rem" }} onClick={() => adjustQuantity(item)}>
                        <RefreshCw size={12} /> Count
                      </button>
                      <button className="btn-back" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.45rem 0.6rem" }} onClick={() => archiveItem(item.id)} title="Remove item">
                        <Archive size={13} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "categories" && (
        <section style={{ display: "grid", gap: "1rem" }}>
          <div className="card" style={{ padding: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "end" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>New category</label>
                <input
                  value={categoryName}
                  onChange={(e) => {
                    setCategoryName(e.target.value);
                    setCategorySuccess(null);
                    setCategoryError(null);
                  }}
                  placeholder="e.g. Ties, Pins, Bows"
                  style={inputStyle}
                />
              </div>
              <button className="btn-secondary" style={{ padding: "0.65rem 1rem" }} disabled={savingCategory || !categoryName.trim()} onClick={createCategory}>
                {savingCategory ? "Saving..." : "Add category"}
              </button>
            </div>
            {categorySuccess && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.85rem", color: "var(--color-sage)", fontSize: "0.82rem", fontWeight: 700 }}>
                <CheckCircle2 size={15} /> {categorySuccess}
              </div>
            )}
            {categoryError && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.85rem", color: "var(--color-error)", fontSize: "0.82rem", fontWeight: 700 }}>
                <AlertTriangle size={15} /> {categoryError}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: "1.25rem" }}>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.35rem" }}>Categories</div>
            {categories.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: 0 }}>No categories have been created yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.6rem" }}>
                {categories.map((category) => (
                  <div key={category.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.6rem" }}>
                    <div>
                      <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>{category.name}</div>
                      <div style={{ fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
                        Created {new Date(category.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.25rem 0.6rem" }}>
                      {items.filter((item) => item.category_id === category.id).length} items
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "members" && (
        <section style={{ display: "grid", gap: "1rem" }}>
          <div className="card" style={{ padding: "1rem" }}>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.35rem" }}>Members</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--color-text-secondary)" }}>Add department member</span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                <input
                  type="checkbox"
                  checked={memberTabUseExisting}
                  onChange={(e) => {
                    setMemberTabUseExisting(e.target.checked);
                    setMemberSuccess(null);
                    setMemberError(null);
                  }}
                />
                Existing person
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 2fr) auto", gap: "0.6rem", alignItems: "end" }}>
              <div>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Departments</span>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.45rem", background: "var(--color-bg-elevated)", minHeight: 43 }}>
                  {departments.map((department) => {
                    const active = memberDepartmentIds.includes(department.id);
                    return (
                      <button
                        key={department.id}
                        type="button"
                        onClick={() => {
                          setMemberDepartmentIds((prev) =>
                            active
                              ? prev.filter((id) => id !== department.id)
                              : [...prev, department.id]
                          );
                          setMemberSuccess(null);
                          setMemberError(null);
                        }}
                        style={{
                          border: active ? "1px solid var(--color-primary-dark)" : "1px solid var(--color-border)",
                          borderRadius: "var(--radius-full)",
                          background: active ? "var(--color-primary-dark)" : "transparent",
                          color: active ? "#fff" : "var(--color-text-muted)",
                          padding: "0.3rem 0.65rem",
                          font: "inherit",
                          fontSize: "0.76rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {department.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              {memberTabUseExisting ? (
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Person</span>
                  <select
                    value={memberTabExistingPersonId}
                    onChange={(e) => {
                      setMemberTabExistingPersonId(e.target.value);
                      setMemberSuccess(null);
                      setMemberError(null);
                    }}
                    style={inputStyle}
                  >
                    <option value="">Select person...</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.gender}</option>)}
                  </select>
                </label>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: "0.6rem" }}>
                  <label style={{ display: "block" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Name</span>
                    <input
                      value={memberTabName}
                      onChange={(e) => {
                        setMemberTabName(e.target.value);
                        setMemberSuccess(null);
                        setMemberError(null);
                      }}
                      placeholder="e.g. Ken"
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "block" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Gender</span>
                    <select value={memberTabGender} onChange={(e) => setMemberTabGender(e.target.value as Gender)} style={inputStyle}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </label>
                </div>
              )}
              <button
                className="btn-secondary"
                style={{ padding: "0.65rem 1rem" }}
                disabled={savingMemberTab || memberDepartmentIds.length === 0 || (memberTabUseExisting ? !memberTabExistingPersonId : !memberTabName.trim())}
                onClick={saveMemberFromTab}
              >
                {savingMemberTab ? "Saving..." : memberTabUseExisting ? "Link" : "Add"}
              </button>
            </div>
            {memberSuccess && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.85rem", color: "var(--color-sage)", fontSize: "0.82rem", fontWeight: 700 }}>
                <CheckCircle2 size={15} /> {memberSuccess}
              </div>
            )}
            {memberError && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.85rem", color: "var(--color-error)", fontSize: "0.82rem", fontWeight: 700 }}>
                <AlertTriangle size={15} /> {memberError}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: "1.25rem" }}>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.35rem" }}>Department members</div>
            {departments.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: 0 }}>No departments have been created yet.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {departments.map((department) => {
                  const list = membersByDepartment[department.id] ?? [];
                  return (
                    <div key={department.id} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.85rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginBottom: list.length > 0 ? "0.65rem" : 0 }}>
                        <div style={{ fontSize: "0.92rem", fontWeight: 800 }}>{department.name}</div>
                        <span style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.25rem 0.6rem" }}>
                          {list.length} members
                        </span>
                      </div>
                      {list.length === 0 ? (
                        <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", margin: 0 }}>No members yet.</p>
                      ) : (
                        <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                          {list.map((member) => (
                            <span key={member.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.25rem 0.35rem 0.25rem 0.65rem", background: "var(--color-bg-elevated)" }}>
                              {member.name} <span style={{ color: "var(--color-text-muted)", textTransform: "capitalize" }}>{member.gender}</span>
                              <button
                                type="button"
                                title={`Remove ${member.name}`}
                                onClick={() => deleteMemberFromDepartment(department.id, member)}
                                disabled={deletingMemberId === member.id}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 22,
                                  height: 22,
                                  border: "1px solid var(--color-border)",
                                  borderRadius: "50%",
                                  background: "transparent",
                                  color: "var(--color-text-muted)",
                                  cursor: deletingMemberId === member.id ? "default" : "pointer",
                                }}
                              >
                                {deletingMemberId === member.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "assignments" && (
        <section style={{ display: "grid", gap: "1rem" }}>
          <div className="card" style={{ padding: "1.25rem" }}>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.35rem" }}>Issue items</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
              <Select label="Service" value={selectedScheduleId} onChange={setSelectedScheduleId} options={upcomingSchedules.map((s) => ({ value: s.id, label: `${dateLabel(s.service_date)} - ${s.title}` }))} />
              <Select label="Department" value={selectedDepartmentId} onChange={setSelectedDepartmentId} options={departments.map((d) => ({ value: d.id, label: d.name }))} />
              <Select label="Member" value={selectedPersonId} onChange={setSelectedPersonId} options={members.map((m) => ({ value: m.person_id, label: `${m.name} · ${m.gender}` }))} />
            </div>

            {selectedDepartmentId && (
              <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.8rem", marginBottom: "1rem", background: "var(--color-bg-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.65rem" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--color-text-secondary)" }}><UserPlus size={14} /> Add member</span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                    <input type="checkbox" checked={useExistingPerson} onChange={(e) => setUseExistingPerson(e.target.checked)} />
                    Existing person
                  </label>
                </div>
                {useExistingPerson ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.6rem" }}>
                    <select value={existingPersonId} onChange={(e) => setExistingPersonId(e.target.value)} style={inputStyle}>
                      <option value="">Select person...</option>
                      {people.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.gender}</option>)}
                    </select>
                    <button className="btn-secondary" style={{ padding: "0.65rem 1rem" }} disabled={savingMember || !existingPersonId} onClick={saveMember}>Link</button>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px auto", gap: "0.6rem" }}>
                    <input value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Name" style={inputStyle} />
                    <select value={newMemberGender} onChange={(e) => setNewMemberGender(e.target.value as Gender)} style={inputStyle}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                    <button className="btn-secondary" style={{ padding: "0.65rem 1rem" }} disabled={savingMember || !newMemberName.trim()} onClick={saveMember}>Add</button>
                  </div>
                )}
              </div>
            )}

            {suggestions.length > 0 && (
              <div style={{ marginBottom: "0.85rem" }}>
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", fontWeight: 700, marginBottom: "0.45rem" }}>Suggested from scheduled look</div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {suggestions.map((item) => (
                    <button key={item.id} className="btn-back" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.4rem 0.75rem" }} onClick={() => toggleSelection(item.id)}>
                      {item.name} · {item.available_quantity} ready
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="ward-gallery" style={{ marginBottom: "1rem" }}>
              {items.map((item) => {
                const selected = selectedItems.find((selection) => selection.inventory_item_id === item.id);
                return (
                  <button key={item.id} className="card" style={{ padding: "0.75rem", textAlign: "left", cursor: item.available_quantity > 0 ? "pointer" : "not-allowed", borderColor: selected ? "var(--color-primary-dark)" : "var(--color-border)", opacity: item.available_quantity > 0 ? 1 : 0.55 }} disabled={item.available_quantity <= 0} onClick={() => toggleSelection(item.id)}>
                    <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                      <div style={{ width: 54, height: 54, borderRadius: "var(--radius-md)", background: "var(--color-bg-elevated)", position: "relative", flexShrink: 0, overflow: "hidden", display: "grid", placeItems: "center" }}>
                        {item.image_url ? <Image src={item.image_url} alt={item.name} fill style={{ objectFit: "contain" }} unoptimized /> : <Package size={20} />}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "0.84rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>{item.available_quantity} available</div>
                      </div>
                    </div>
                    {selected && (
                      <input
                        type="number"
                        min={1}
                        max={item.available_quantity}
                        value={selected.quantity}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSelectionQuantity(item.id, Number(e.target.value))}
                        style={{ ...inputStyle, marginTop: "0.65rem" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {assignmentError && <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: "0 0 0.75rem" }}>{assignmentError}</p>}
            <button className="btn-primary" style={{ padding: "0.75rem 1.2rem" }} disabled={assigning || !selectedScheduleId || !selectedDepartmentId || !selectedPersonId || selectedItems.length === 0} onClick={createAssignment}>
              {assigning ? <><Loader2 size={15} className="animate-spin" /> Assigning...</> : <><CheckCircle2 size={15} /> Assign selected items</>}
            </button>
          </div>

          <div className="card" style={{ padding: "1.25rem" }}>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.35rem" }}>Returns</div>
            {openLines.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", margin: 0 }}>No items are currently out.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.65rem" }}>
                {openLines.map(({ assignment, line }) => (
                  <div key={line.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.75rem", alignItems: "center", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.75rem" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>{line.item?.name ?? "Inventory item"} × {line.quantity}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: "0.76rem" }}>
                        {assignment.person?.name} · {assignment.department?.name} · {dateLabel(assignment.schedule?.service_date)}
                        {line.is_overdue && <span style={{ color: "var(--color-error)", fontWeight: 700 }}> · Overdue</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <ResolveButton label="Returned" onClick={() => resolveLine(line.id, "returned")} />
                      <ResolveButton label="Damaged" onClick={() => resolveLine(line.id, "damaged")} />
                      <ResolveButton label="Missing" onClick={() => resolveLine(line.id, "missing")} />
                      <ResolveButton label="Destroyed" onClick={() => resolveLine(line.id, "destroyed")} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {tab === "history" && (
        <section className="card" style={{ padding: "1.25rem" }}>
          <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.35rem" }}>History</div>
          {history.length === 0 ? (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>No inventory history yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {history.map((event) => (
                <div key={event.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "0.75rem", alignItems: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.6rem" }}>
                  <History size={15} color="var(--color-text-muted)" />
                  <div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700 }}>{event.item?.name ?? "Inventory item"} · {event.event_type.replace("_", " ")}</div>
                    <div style={{ fontSize: "0.74rem", color: "var(--color-text-muted)" }}>
                      {event.assignment_item?.assignment?.person?.name ?? event.reason ?? "Manual update"}
                      {event.assignment_item?.assignment?.schedule?.service_date ? ` · ${dateLabel(event.assignment_item.assignment.schedule.service_date)}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.78rem", color: event.quantity_delta < 0 ? "var(--color-error)" : "var(--color-sage)", fontWeight: 700 }}>
                    {event.quantity_delta > 0 ? "+" : ""}{event.quantity_delta}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showItemForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(33,28,25,0.5)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="card" style={{ width: "100%", maxWidth: 520, padding: "1.75rem", position: "relative", maxHeight: "90dvh", overflowY: "auto" }}>
            <button onClick={resetItemForm} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.4rem" }}>Inventory</div>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Add <em className="serif-em">item</em></h2>
            <div style={{ display: "grid", gap: "0.85rem" }}>
              <button onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${itemPreview ? "var(--color-primary-dark)" : "var(--color-border)"}`, borderRadius: "var(--radius-md)", padding: "1rem", background: "var(--color-bg-elevated)", cursor: "pointer" }}>
                {itemPreview ? (
                  <span style={{ display: "block", position: "relative", width: 110, height: 110, margin: "0 auto" }}>
                    <Image src={itemPreview} alt="Preview" fill style={{ objectFit: "contain" }} unoptimized />
                  </span>
                ) : (
                  <span style={{ display: "grid", placeItems: "center", gap: "0.4rem", color: "var(--color-text-muted)" }}><Upload size={22} /> Upload image</span>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
              <input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name" style={inputStyle} />
              <select value={itemCategoryId} onChange={(e) => setItemCategoryId(e.target.value)} style={inputStyle}>
                <option value="">Select category...</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <input type="number" min={0} value={itemQuantity} onChange={(e) => setItemQuantity(Number(e.target.value))} style={inputStyle} />
              {itemError && <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: 0 }}><AlertTriangle size={13} /> {itemError}</p>}
              <button className="btn-primary" style={{ padding: "0.75rem" }} disabled={savingItem} onClick={createItem}>
                {savingItem ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : <><Upload size={15} /> Save item</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StockBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "0.45rem", textAlign: "center", background: "var(--color-bg-elevated)" }}>
      <div style={{ fontSize: "0.95rem", fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: "0.62rem", color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
        <option value="">Select...</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ResolveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="btn-back" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.4rem 0.55rem", fontSize: "0.72rem" }} onClick={onClick}>
      <RotateCcw size={12} /> {label}
    </button>
  );
}

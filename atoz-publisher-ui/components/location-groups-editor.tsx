"use client";

import { useCallback, useState } from "react";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface LocationGroup {
  name: string;
  suburbs: string[];
  postcodes: string[];
}

const DEFAULT_GROUPS: LocationGroup[] = [
  {
    name: "Brisbane",
    suburbs: ["Brisbane CBD", "South Brisbane", "Fortitude Valley", "West End", "New Farm", "Woolloongabba"],
    postcodes: ["4000", "4101", "4006", "4005", "4102", "4103", "4104", "4105"],
  },
  {
    name: "Redlands",
    suburbs: ["Cleveland", "Capalaba", "Victoria Point", "Redland Bay", "Alexandra Hills", "Thornlands"],
    postcodes: ["4163", "4157", "4165", "4161", "4158", "4164", "4160"],
  },
  {
    name: "Logan",
    suburbs: ["Logan Central", "Springwood", "Beenleigh", "Browns Plains", "Shailer Park", "Daisy Hill"],
    postcodes: ["4114", "4127", "4207", "4118", "4128", "4127"],
  },
];

export function parseLocationGroups(json: string | null | undefined): LocationGroup[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is LocationGroup =>
        typeof g.name === "string" &&
        Array.isArray(g.suburbs) &&
        Array.isArray(g.postcodes),
    );
  } catch {
    return [];
  }
}

export function serializeLocationGroups(groups: LocationGroup[]): string {
  return JSON.stringify(groups);
}

interface LocationGroupsEditorProps {
  value: string;
  onChange: (json: string) => void;
}

export function LocationGroupsEditor({ value, onChange }: LocationGroupsEditorProps) {
  const [groups, setGroups] = useState<LocationGroup[]>(() => {
    const parsed = parseLocationGroups(value);
    return parsed.length > 0 ? parsed : [];
  });
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const persist = useCallback(
    (next: LocationGroup[]) => {
      setGroups(next);
      onChange(serializeLocationGroups(next));
    },
    [onChange],
  );

  function addGroup() {
    const next = [...groups, { name: "", suburbs: [], postcodes: [] }];
    persist(next);
    setEditingIdx(next.length - 1);
  }

  function removeGroup(idx: number) {
    persist(groups.filter((_, i) => i !== idx));
    if (editingIdx === idx) setEditingIdx(null);
  }

  function updateGroup(idx: number, updated: LocationGroup) {
    const next = groups.map((g, i) => (i === idx ? updated : g));
    persist(next);
  }

  function loadDefaults() {
    persist(DEFAULT_GROUPS);
    setEditingIdx(null);
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Target Location Groups
        </label>
        <div className="flex items-center gap-2">
          {groups.length === 0 && (
            <Button onClick={loadDefaults} size="sm" variant="outline" className="text-xs h-7">
              Load Brisbane / Redlands / Logan
            </Button>
          )}
          <Button onClick={addGroup} size="sm" variant="outline" className="text-xs h-7 gap-1">
            <Plus className="h-3 w-3" />
            Add Group
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
          No location groups configured. Click &quot;Load Brisbane / Redlands / Logan&quot; for defaults or add your own.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group, idx) => (
            <GroupCard
              key={idx}
              group={group}
              isEditing={editingIdx === idx}
              onEdit={() => setEditingIdx(editingIdx === idx ? null : idx)}
              onRemove={() => removeGroup(idx)}
              onUpdate={(updated) => updateGroup(idx, updated)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({
  group,
  isEditing,
  onEdit,
  onRemove,
  onUpdate,
}: {
  group: LocationGroup;
  isEditing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onUpdate: (g: LocationGroup) => void;
}) {
  const [suburbInput, setSuburbInput] = useState("");
  const [postcodeInput, setPostcodeInput] = useState("");

  function addSuburb() {
    const val = suburbInput.trim();
    if (!val || group.suburbs.includes(val)) return;
    onUpdate({ ...group, suburbs: [...group.suburbs, val] });
    setSuburbInput("");
  }

  function removeSuburb(s: string) {
    onUpdate({ ...group, suburbs: group.suburbs.filter((x) => x !== s) });
  }

  function addPostcode() {
    const val = postcodeInput.trim();
    if (!val || group.postcodes.includes(val)) return;
    onUpdate({ ...group, postcodes: [...group.postcodes, val] });
    setPostcodeInput("");
  }

  function removePostcode(p: string) {
    onUpdate({ ...group, postcodes: group.postcodes.filter((x) => x !== p) });
  }

  return (
    <Card className="rounded-xl">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {isEditing ? (
            <Input
              className="h-7 text-sm font-medium"
              value={group.name}
              onChange={(e) => onUpdate({ ...group, name: e.target.value })}
              placeholder="Group name (e.g. Brisbane)"
            />
          ) : (
            <button
              onClick={onEdit}
              className="text-sm font-semibold text-brand-primary hover:underline text-left"
              type="button"
            >
              {group.name || "Untitled Group"}
            </button>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <Button onClick={onEdit} size="sm" variant="ghost" className="h-6 w-6 p-0 text-xs">
              {isEditing ? "Done" : "Edit"}
            </Button>
            <Button onClick={onRemove} size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Suburbs */}
        <div>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Suburbs</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {group.suburbs.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px] gap-0.5 py-0 px-1.5">
                {s}
                {isEditing && (
                  <button onClick={() => removeSuburb(s)} type="button" className="ml-0.5 hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            ))}
            {group.suburbs.length === 0 && <span className="text-[10px] text-muted-foreground">None</span>}
          </div>
          {isEditing && (
            <div className="flex gap-1 mt-1">
              <Input
                className="h-6 text-xs flex-1"
                placeholder="Add suburb..."
                value={suburbInput}
                onChange={(e) => setSuburbInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSuburb())}
              />
              <Button onClick={addSuburb} size="sm" className="h-6 text-xs px-2">
                +
              </Button>
            </div>
          )}
        </div>

        {/* Postcodes */}
        <div>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Postcodes</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {group.postcodes.map((p) => (
              <Badge key={p} variant="outline" className="text-[10px] gap-0.5 py-0 px-1.5 font-mono">
                {p}
                {isEditing && (
                  <button onClick={() => removePostcode(p)} type="button" className="ml-0.5 hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            ))}
            {group.postcodes.length === 0 && <span className="text-[10px] text-muted-foreground">None</span>}
          </div>
          {isEditing && (
            <div className="flex gap-1 mt-1">
              <Input
                className="h-6 text-xs flex-1 font-mono"
                placeholder="Add postcode (e.g. 4000)..."
                value={postcodeInput}
                onChange={(e) => setPostcodeInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPostcode())}
              />
              <Button onClick={addPostcode} size="sm" className="h-6 text-xs px-2">
                +
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

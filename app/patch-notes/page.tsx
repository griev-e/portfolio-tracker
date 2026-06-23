"use client";

import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PATCH_NOTES } from "@/lib/data/patchNotes";

export default function PatchNotesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Data"
        title="Patch Notes"
        description="What's changed in alpha, release by release."
      />

      <div className="space-y-5">
        {PATCH_NOTES.map((note, i) => (
          <Card key={note.version} className="px-6 py-5" i={i}>
            <CardHeader
              eyebrow={`v${note.version} · ${note.date}`}
              title={note.title}
              className="mb-3"
            />
            <ul className="space-y-1.5">
              {note.changes.map((change) => (
                <li key={change} className="flex gap-2 text-[13px] leading-relaxed text-mute">
                  <span className="mt-[7px] h-1 w-1 flex-none rounded-full bg-faint" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

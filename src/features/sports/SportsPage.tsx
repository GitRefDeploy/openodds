import { useMemo, useState } from "react";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { SPORT_KIND_LABELS, type SportKind } from "@/domain/taxonomy";
import { bySport, enrichAll } from "@/features/analytics/selectors";

export function SportsPage() {
  const { repo, sports, bets, currency, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SportKind>("team");

  const stats = useMemo(() => bySport(enrichAll(bets)), [bets]);
  const statsFor = (slug: string) => stats.find((s) => s.key === slug);

  async function addSport() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    await repo.createSport({ slug, name: trimmed, kind });
    await refresh();
    setName("");
    setOpen(false);
  }

  const groups: SportKind[] = ["racing", "team", "other"];

  return (
    <>
      <PageHeader
        title="Sports"
        description="The sports and racing codes you track. Enable the ones you use; add your own if something is missing."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            Add sport
          </Button>
        }
      />

      <div className="space-y-5">
        {groups.map((group) => {
          const list = sports.filter((s) => s.kind === group);
          if (list.length === 0) return null;
          return (
            <div key={group}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {SPORT_KIND_LABELS[group]}
              </h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {list.map((sport) => {
                  const s = statsFor(sport.slug);
                  const enabled = sport.enabled === 1;
                  return (
                    <Card
                      key={sport.id}
                      className="flex items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={
                              enabled
                                ? "truncate font-medium text-slate-100"
                                : "truncate font-medium text-slate-500"
                            }
                          >
                            {sport.name}
                          </p>
                          {!enabled && <Badge tone="neutral">Hidden</Badge>}
                        </div>
                        <p className="text-xs text-slate-500">
                          {s
                            ? `${s.count} bets · ${
                                s.profitCents >= 0 ? "+" : ""
                              }${(s.profitCents / 100).toFixed(2)} ${currency}`
                            : "No settled bets"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={enabled ? "ghost" : "default"}
                        onClick={async () => {
                          await repo.setSportEnabled(sport.id, !enabled);
                          await refresh();
                        }}
                      >
                        {enabled ? "Hide" : "Enable"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={open} title="Add sport" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Darts"
            />
          </Field>
          <Field label="Group">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as SportKind)}
            >
              <option value="racing">Racing</option>
              <option value="team">Team sport</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={addSport}>
              Add sport
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

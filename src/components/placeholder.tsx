import { Card, CardContent } from "@/components/ui/card";

export function Placeholder({ phase }: { phase: number }) {
  const phaseLabel: Record<number, string> = {
    2: "Discovery",
    3: "Enrichment",
    4: "Scoring + Leads UI",
    5: "Outreach",
    6: "Replies + Analytics",
  };
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        Built in phase {phase}
        {phaseLabel[phase] ? ` — ${phaseLabel[phase]}` : ""}.
      </CardContent>
    </Card>
  );
}

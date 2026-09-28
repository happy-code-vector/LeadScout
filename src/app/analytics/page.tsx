import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Reply, meeting, and win rates by tier, category, website class, and variant."
      />
      <Placeholder phase={6} />
    </>
  );
}

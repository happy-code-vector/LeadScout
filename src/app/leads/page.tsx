import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function LeadsPage() {
  return (
    <>
      <PageHeader
        title="Leads"
        description="Scored businesses, filterable by tier, category, area, and website class."
      />
      <Placeholder phase={4} />
    </>
  );
}

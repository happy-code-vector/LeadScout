import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function CampaignsPage() {
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Manual and automatic outreach over email, post, and phone tasks."
      />
      <Placeholder phase={5} />
    </>
  );
}

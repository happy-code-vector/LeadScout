import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Sender identity, mailboxes, scoring weights, and API limits."
      />
      <Placeholder phase={5} />
    </>
  );
}

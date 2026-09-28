import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export default function CallQueuePage() {
  return (
    <>
      <PageHeader
        title="Call Queue"
        description="Today's calls, with scripts and one-click outcomes."
      />
      <Placeholder phase={5} />
    </>
  );
}

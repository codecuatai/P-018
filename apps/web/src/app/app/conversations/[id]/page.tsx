import { ConversationDetail } from "@/features/product/conversation-detail";

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  return <ConversationDetail id={id} />;
}

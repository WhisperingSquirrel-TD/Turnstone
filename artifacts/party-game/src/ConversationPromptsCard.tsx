import type { ConversationPrompt } from './conversation-prompts';

type ConversationPromptsCardProps = {
  title: string;
  prompts: readonly ConversationPrompt[];
};

export function ConversationPromptsCard({
  title,
  prompts,
}: ConversationPromptsCardProps) {
  if (prompts.length === 0) return null;

  return (
    <section
      aria-labelledby="conversation-prompts-heading"
      className="mb-6 border-y border-gilt/40 py-4"
      data-testid="conversation-prompts"
    >
      <h2 className="display text-xl" id="conversation-prompts-heading">
        {title}
      </h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        {prompts.slice(0, 3).map((prompt) => (
          <li className="text-base leading-relaxed" key={prompt.id}>
            {prompt.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
